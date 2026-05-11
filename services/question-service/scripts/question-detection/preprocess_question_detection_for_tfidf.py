from __future__ import annotations

import argparse
import re
from pathlib import Path

import pandas as pd


# =========================================================
# 경로/인자 설정
# =========================================================
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply model-input preprocessing for TF-IDF question detection baseline."
    )
    parser.add_argument(
        "--train-path",
        type=str,
        default="data/processed/question_detection/train.csv",
        help="Path to processed train split.",
    )
    parser.add_argument(
        "--valid-path",
        type=str,
        default="data/processed/question_detection/valid.csv",
        help="Path to processed valid split.",
    )
    parser.add_argument(
        "--test-path",
        type=str,
        default="data/processed/question_detection/test.csv",
        help="Path to processed test split.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="data/processed/question_detection/tfidf_ready",
        help="Directory to save TF-IDF-ready csv files.",
    )
    return parser.parse_args()


# =========================================================
# 텍스트 전처리
# =========================================================
def normalize_for_tfidf(text: str) -> str:
    """
    TF-IDF baseline용 경량 텍스트 정제.
    이미 dataset 생성 단계에서 공백 정리/빈값 제거/중복 제거는 끝났으므로,
    여기서는 모델 입력 관점의 최소 정제만 수행한다.

    수행 내용:
    1. 소문자화 (영문 혼용 대비)
    2. URL 치환
    3. 이메일 치환
    4. 연속된 웃음/반복 문자 축약
    5. 특수문자 정리
    6. 공백 정리
    """
    if not isinstance(text, str):
        text = str(text)

    # 영문/숫자 혼합 채팅 대비
    text = text.lower()

    # URL / 이메일은 어휘 분산이 크므로 토큰으로 치환
    text = re.sub(r"https?://\S+|www\.\S+", " [URL] ", text)
    text = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", " [EMAIL] ", text)

    # 너무 긴 반복 문자 축약: ㅋㅋㅋㅋㅋㅋ -> ㅋㅋ, ㅠㅠㅠㅠ -> ㅠㅠ, !!!!!! -> !!, ??? -> ??
    text = re.sub(r"([ㅋㅎㅠㅜ])\1{2,}", r"\1\1", text)
    text = re.sub(r"([!?~])\1{2,}", r"\1\1", text)

    # 자주 나오는 장식성 특수문자 정리
    text = re.sub(r"[\"'`]+", " ", text)
    text = re.sub(r"[|]+", " ", text)

    # 한글/영문/숫자/기본 문장부호만 남기고 나머지는 공백 처리
    # 질문 판별에 중요한 ?, ! 는 유지
    text = re.sub(r"[^0-9a-z가-힣\s?!.,]", " ", text)

    # 공백 정리
    text = re.sub(r"\s+", " ", text).strip()

    return text


# =========================================================
# 데이터 로드 및 저장
# =========================================================
def load_split(path: str) -> pd.DataFrame:
    """
    이미 만들어진 processed split을 그대로 읽는다.
    여기서는 text, label만 사용한다.
    """
    df = pd.read_csv(path)
    df = df[["text", "label"]].copy()
    return df


def preprocess_split(df: pd.DataFrame) -> pd.DataFrame:
    """
    split 데이터에 대해 TF-IDF용 text 컬럼만 추가한다.
    원본 text는 남겨두고, 모델 입력용 text_preprocessed를 별도 생성한다.
    """
    out = df.copy()

    # 모델 입력용 텍스트 생성
    out["text_preprocessed"] = out["text"].astype(str).apply(normalize_for_tfidf)

    # 전처리 후 혹시 빈 문자열이 생긴 경우만 제거
    out = out[out["text_preprocessed"] != ""].reset_index(drop=True)

    return out


def print_stats(name: str, df: pd.DataFrame) -> None:
    """
    split별 기본 통계 출력
    """
    total = len(df)
    q_count = int((df["label"] == 1).sum())
    non_q_count = int((df["label"] == 0).sum())
    q_ratio = (q_count / total * 100) if total > 0 else 0.0

    print(f"\n[{name}]")
    print(f"총 행 수      : {total:,}")
    print(f"질문 수       : {q_count:,}")
    print(f"비질문 수     : {non_q_count:,}")
    print(f"질문 비율     : {q_ratio:.2f}%")


def save_split(df: pd.DataFrame, path: Path) -> None:
    """
    csv 저장
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8-sig")
    print(f"[SAVED] {path}")


# =========================================================
# 메인
# =========================================================
def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)

    # split 로드
    train_df = load_split(args.train_path)
    valid_df = load_split(args.valid_path)
    test_df = load_split(args.test_path)

    # TF-IDF용 입력 전처리
    train_ready = preprocess_split(train_df)
    valid_ready = preprocess_split(valid_df)
    test_ready = preprocess_split(test_df)

    # 저장
    save_split(train_ready, output_dir / "train.csv")
    save_split(valid_ready, output_dir / "valid.csv")
    save_split(test_ready, output_dir / "test.csv")

    # 통계 출력
    print_stats("train", train_ready)
    print_stats("valid", valid_ready)
    print_stats("test", test_ready)

    print("\n[DONE] TF-IDF용 전처리 데이터 생성 완료")


if __name__ == "__main__":
    main()