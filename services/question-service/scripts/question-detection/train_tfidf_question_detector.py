from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.pipeline import Pipeline


# =========================================================
# 인자 파싱
# =========================================================
def parse_args() -> argparse.Namespace:
    """
    학습/평가 실행에 필요한 명령행 인자를 정의한다.
    """
    parser = argparse.ArgumentParser(
        description="Train TF-IDF + Logistic Regression baseline for question detection."
    )
    parser.add_argument(
        "--train-path",
        type=str,
        default="data/processed/question_detection/tfidf_ready/train.csv",
        help="Path to preprocessed train csv",
    )
    parser.add_argument(
        "--valid-path",
        type=str,
        default="data/processed/question_detection/tfidf_ready/valid.csv",
        help="Path to preprocessed valid csv",
    )
    parser.add_argument(
        "--test-path",
        type=str,
        default="data/processed/question_detection/tfidf_ready/test.csv",
        help="Path to preprocessed test csv",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="services/question-service/outputs/question_detection/tfidf_lr",
        help="Directory to save reports and error samples",
    )
    parser.add_argument(
        "--max-features",
        type=int,
        default=50000,
        help="Maximum number of TF-IDF features",
    )
    parser.add_argument(
        "--ngram-max",
        type=int,
        default=2,
        help="Use ngram_range=(1, ngram_max). Example: 2 means unigram+bigram.",
    )
    parser.add_argument(
        "--c-value",
        type=float,
        default=1.0,
        help="Inverse regularization strength for Logistic Regression",
    )
    parser.add_argument(
        "--max-iter",
        type=int,
        default=1000,
        help="Maximum iterations for Logistic Regression",
    )
    parser.add_argument(
        "--use-class-weight",
        action="store_true",
        help="Use class_weight='balanced' to compensate label imbalance",
    )
    parser.add_argument(
        "--error-sample-size",
        type=int,
        default=200,
        help="Number of false positive / false negative samples to save",
    )
    return parser.parse_args()


# =========================================================
# 데이터 로드
# =========================================================
def load_dataset(path: str) -> pd.DataFrame:
    """
    전처리 완료된 csv를 읽어온다.

    사용 컬럼:
    - text_preprocessed: TF-IDF 입력 텍스트
    - label: 정답 라벨
    """
    df = pd.read_csv(path)
    df = df[["text", "text_preprocessed", "label"]].copy()
    return df


# =========================================================
# 모델 파이프라인 생성
# =========================================================
def build_pipeline(
    max_features: int,
    ngram_max: int,
    c_value: float,
    max_iter: int,
    use_class_weight: bool,
) -> Pipeline:
    """
    TF-IDF 벡터화 + Logistic Regression 분류 파이프라인을 생성한다.
    """
    class_weight = "balanced" if use_class_weight else None

    pipeline = Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    max_features=max_features,
                    ngram_range=(1, ngram_max),
                    lowercase=False,
                ),
            ),
            (
                "clf",
                LogisticRegression(
                    C=c_value,
                    max_iter=max_iter,
                    class_weight=class_weight,
                    solver="liblinear",
                    random_state=42,
                ),
            ),
        ]
    )
    return pipeline


# =========================================================
# 텍스트 저장 유틸
# =========================================================
def save_text(path: Path, text: str) -> None:
    """
    문자열 결과를 텍스트 파일로 저장한다.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8-sig")


# =========================================================
# split 평가
# =========================================================
def evaluate_split(
    model: Pipeline,
    df: pd.DataFrame,
    split_name: str,
    output_dir: Path,
    error_sample_size: int,
) -> None:
    """
    특정 split(valid/test)에 대해 예측을 수행하고,
    성능 리포트 / 혼동행렬 / 오분류 샘플을 저장한다.
    """
    x = df["text_preprocessed"]
    y_true = df["label"]

    # 예측 수행
    y_pred = model.predict(x)

    # 분류 리포트 생성
    report = classification_report(
        y_true,
        y_pred,
        digits=4,
        zero_division=0,
    )

    # 혼동행렬 생성
    cm = confusion_matrix(y_true, y_pred)

    print(f"\n===== [{split_name.upper()}] Classification Report =====")
    print(report)
    print(f"===== [{split_name.upper()}] Confusion Matrix =====")
    print(cm)

    # 결과 저장
    save_text(output_dir / f"{split_name}_classification_report.txt", report)
    save_text(output_dir / f"{split_name}_confusion_matrix.txt", str(cm))

    # 원문/전처리문/예측결과 함께 저장용 데이터프레임 구성
    result_df = df.copy()
    result_df["pred"] = y_pred
    result_df["correct"] = (result_df["label"] == result_df["pred"]).astype(int)

    # 오분류 샘플만 추출
    error_df = result_df[result_df["correct"] == 0].copy()

    # False Negative: 질문인데 비질문으로 놓친 경우
    fn_df = error_df[(error_df["label"] == 1) & (error_df["pred"] == 0)].copy()

    # False Positive: 비질문인데 질문으로 잘못 잡은 경우
    fp_df = error_df[(error_df["label"] == 0) & (error_df["pred"] == 1)].copy()

    # 샘플 수 제한
    fn_df = fn_df.head(error_sample_size)
    fp_df = fp_df.head(error_sample_size)

    # csv 저장
    fn_df.to_csv(
        output_dir / f"{split_name}_false_negative_samples.csv",
        index=False,
        encoding="utf-8-sig",
    )
    fp_df.to_csv(
        output_dir / f"{split_name}_false_positive_samples.csv",
        index=False,
        encoding="utf-8-sig",
    )


# =========================================================
# 메인 실행
# =========================================================
def main() -> None:
    """
    전체 baseline 학습/평가 파이프라인을 실행한다.
    """
    args = parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 데이터 로드
    train_df = load_dataset(args.train_path)
    valid_df = load_dataset(args.valid_path)
    test_df = load_dataset(args.test_path)

    print("[INFO] train size:", len(train_df))
    print("[INFO] valid size:", len(valid_df))
    print("[INFO] test size :", len(test_df))
    print("[INFO] use_class_weight:", args.use_class_weight)

    # 모델 생성
    model = build_pipeline(
        max_features=args.max_features,
        ngram_max=args.ngram_max,
        c_value=args.c_value,
        max_iter=args.max_iter,
        use_class_weight=args.use_class_weight,
    )

    # 학습
    print("\n[INFO] Training TF-IDF + Logistic Regression model...")
    model.fit(train_df["text_preprocessed"], train_df["label"])
    print("[INFO] Training completed.")

    # 검증셋 평가
    evaluate_split(
        model=model,
        df=valid_df,
        split_name="valid",
        output_dir=output_dir,
        error_sample_size=args.error_sample_size,
    )

    # 테스트셋 평가
    evaluate_split(
        model=model,
        df=test_df,
        split_name="test",
        output_dir=output_dir,
        error_sample_size=args.error_sample_size,
    )


if __name__ == "__main__":
    main()