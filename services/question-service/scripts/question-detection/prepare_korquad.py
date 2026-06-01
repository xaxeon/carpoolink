"""
KorQuAD v1 에서 질문 데이터를 추출하여 학습용 CSV로 저장합니다.

출력:
  - korquad_questions_tfidf.csv   : TF-IDF용 20,000건  (label=1)
  - korquad_questions_electra.csv : KC-ELECTRA용 10,000건 (label=1)
  - korquad_questions_all.csv     : 전체 (중복 제거)

전처리:
  - ? 제거 (학습 시 ? 의존도 제거 전략)
  - 공백 정리
  - 너무 짧은 질문 (10자 미만) 제거
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
from datasets import load_dataset


OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "processed" / "question_detection" / "augmentation"

TFIDF_SIZE = 20_000
ELECTRA_SIZE = 10_000
MIN_CHAR_LEN = 10
RANDOM_SEED = 42


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="KorQuAD 질문 데이터 추출 및 전처리")
    parser.add_argument("--output-dir", type=str, default=str(OUTPUT_DIR))
    parser.add_argument("--tfidf-size", type=int, default=TFIDF_SIZE)
    parser.add_argument("--electra-size", type=int, default=ELECTRA_SIZE)
    parser.add_argument("--min-len", type=int, default=MIN_CHAR_LEN)
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    return parser.parse_args()


def load_korquad() -> pd.DataFrame:
    print("[1/4] KorQuAD v1 로드 중...")
    ds = load_dataset("squad_kor_v1")
    train_df = pd.DataFrame(ds["train"])
    valid_df = pd.DataFrame(ds["validation"])
    df = pd.concat([train_df, valid_df], ignore_index=True)
    print(f"  총 {len(df):,}건 로드 완료")
    return df


def preprocess(df: pd.DataFrame, min_len: int) -> pd.DataFrame:
    print("[2/4] 전처리 중...")
    questions = df["question"].dropna().astype(str)

    # ? 제거 후 공백 정리
    questions = questions.str.replace("?", "", regex=False).str.strip()

    # 너무 짧은 텍스트 제거
    mask = questions.str.len() >= min_len
    questions = questions[mask].drop_duplicates().reset_index(drop=True)

    print(f"  전처리 후: {len(questions):,}건 (원본 {len(df):,}건에서 {len(df)-len(questions):,}건 제거)")

    has_qmark = questions.str.contains("?", regex=False)
    print(f"  ? 잔존 여부 확인: {has_qmark.sum()}건 (0이어야 정상)")

    return pd.DataFrame({"text": questions, "label": 1})


def sample_and_save(df: pd.DataFrame, output_dir: Path, tfidf_size: int, electra_size: int, seed: int) -> None:
    print("[3/4] 샘플링 및 저장 중...")
    output_dir.mkdir(parents=True, exist_ok=True)

    # 전체 저장
    all_path = output_dir / "korquad_questions_all.csv"
    df.to_csv(all_path, index=False, encoding="utf-8-sig")
    print(f"  전체 저장: {all_path} ({len(df):,}건)")

    # TF-IDF용
    tfidf_size = min(tfidf_size, len(df))
    tfidf_df = df.sample(tfidf_size, random_state=seed)
    tfidf_path = output_dir / "korquad_questions_tfidf.csv"
    tfidf_df.to_csv(tfidf_path, index=False, encoding="utf-8-sig")
    print(f"  TF-IDF용 저장: {tfidf_path} ({len(tfidf_df):,}건)")

    # KC-ELECTRA용
    electra_size = min(electra_size, len(df))
    electra_df = df.sample(electra_size, random_state=seed)
    electra_path = output_dir / "korquad_questions_electra.csv"
    electra_df.to_csv(electra_path, index=False, encoding="utf-8-sig")
    print(f"  KC-ELECTRA용 저장: {electra_path} ({len(electra_df):,}건)")


def print_summary(df: pd.DataFrame) -> None:
    print("\n[4/4] 데이터 요약")
    print(f"  총 질문 수: {len(df):,}건")
    print(f"  평균 길이: {df['text'].str.len().mean():.1f}자")
    print(f"  최소 길이: {df['text'].str.len().min()}자")
    print(f"  최대 길이: {df['text'].str.len().max()}자")
    print("\n  어미 패턴 상위 10 (끝 3글자):")
    endings = df["text"].str[-3:].value_counts().head(10)
    for ending, cnt in endings.items():
        print(f"    {ending}  {cnt:,}건")
    print("\n  샘플 10개:")
    for text in df["text"].sample(10, random_state=42).tolist():
        print(f"    {text}")


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)

    df = load_korquad()
    df = preprocess(df, args.min_len)
    sample_and_save(df, output_dir, args.tfidf_size, args.electra_size, args.seed)
    print_summary(df)
    print("\n완료.")


if __name__ == "__main__":
    main()
