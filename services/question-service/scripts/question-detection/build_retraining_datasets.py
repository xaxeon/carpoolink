"""
TF-IDF 및 KC-ELECTRA 재학습용 데이터셋을 구성합니다.

[TF-IDF 데이터셋 구성]
  train: 기존 SNS train (? 제거) + 3i4k + KorQuAD 20K
  valid: 기존 SNS valid (? 제거)  — 평가 일관성 유지
  test:  기존 SNS test  (? 제거)  — 평가 일관성 유지

[KC-ELECTRA 데이터셋 구성]
  train: 기존 SNS train 클래스 균형 샘플 (질문 25만 + 비질문 25만, ? 제거)
         + 3i4k + KorQuAD 10K + LLM 멘토링 hard negative 519건
  valid: 기존 SNS valid (? 제거)
  test:  기존 SNS test  (? 제거)

출력:
  data/processed/question_detection/tfidf_v2/{train,valid,test}.csv
  data/processed/question_detection/electra_v2/{train,valid,test}.csv
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[4]
DATA_ROOT = REPO_ROOT / "data"
PROCESSED = DATA_ROOT / "processed" / "question_detection"
AUGMENT   = PROCESSED / "augmentation"
RAW_3I4K  = DATA_ROOT / "raw" / "3i4k" / "kor_3i4k" / "data"

# KC-ELECTRA 기존 데이터 샘플 수 (클래스별)
ELECTRA_BASE_PER_CLASS = 250_000
RANDOM_SEED = 42

# 3i4k 라벨 매핑: 2 → 질문(1), 나머지(1,3,4,5,6) → 비질문(0), 0 → 제외
I4K_LABEL_MAP = {1: 0, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0}


# ─────────────────────────────────────────
# 전처리
# ─────────────────────────────────────────

def remove_question_mark(text: str) -> str:
    return str(text).replace("?", "").strip()


def apply_qmark_removal(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["text"] = df["text"].astype(str).apply(remove_question_mark)
    df = df[df["text"].str.len() >= 2].reset_index(drop=True)
    return df


# ─────────────────────────────────────────
# 데이터 로드
# ─────────────────────────────────────────

def load_existing(split: str) -> pd.DataFrame:
    path = PROCESSED / f"{split}.csv"
    df = pd.read_csv(path, usecols=["text", "label"])
    return apply_qmark_removal(df)


def load_3i4k() -> pd.DataFrame:
    frames = []
    for fname in ["train-00000-of-00001.parquet", "test-00000-of-00001.parquet"]:
        df = pd.read_parquet(RAW_3I4K / fname)
        df = df[df["label"].isin(I4K_LABEL_MAP)].copy()
        df["label"] = df["label"].map(I4K_LABEL_MAP)
        df = df.rename(columns={"text": "text"})[["text", "label"]]
        frames.append(df)
    result = pd.concat(frames, ignore_index=True)
    result = apply_qmark_removal(result)
    return result.drop_duplicates(subset=["text"])


def load_korquad(size: int) -> pd.DataFrame:
    path = AUGMENT / "korquad_questions_all.csv"
    df = pd.read_csv(path, usecols=["text", "label"]).sample(
        min(size, len(pd.read_csv(path))), random_state=RANDOM_SEED
    )
    return apply_qmark_removal(df)


def load_hard_negatives() -> pd.DataFrame:
    path = AUGMENT / "mentoring_hard_negatives.csv"
    df = pd.read_csv(path, usecols=["text", "label"])
    return apply_qmark_removal(df)


# ─────────────────────────────────────────
# TF-IDF 데이터셋 빌드
# ─────────────────────────────────────────

def build_tfidf(output_dir: Path) -> None:
    print("\n[TF-IDF] 데이터셋 구성 중...")

    # valid / test: 기존 데이터 ? 제거만
    for split in ["valid", "test"]:
        df = load_existing(split)
        _save(df, output_dir / f"{split}.csv", split)

    # train: 기존 + 3i4k + KorQuAD 20K
    base_train  = load_existing("train")
    i4k         = load_3i4k()
    korquad     = load_korquad(size=20_000)

    train = pd.concat([base_train, i4k, korquad], ignore_index=True)
    train = train.drop_duplicates(subset=["text"]).sample(
        frac=1, random_state=RANDOM_SEED
    ).reset_index(drop=True)

    _save(train, output_dir / "train.csv", "train")

    print(f"\n  [TF-IDF train 구성]")
    print(f"    기존 SNS:   {len(base_train):>10,}건")
    print(f"    3i4k:       {len(i4k):>10,}건")
    print(f"    KorQuAD:    {len(korquad):>10,}건")
    print(f"    ─────────────────────")
    print(f"    합계:       {len(train):>10,}건")
    q = (train["label"] == 1).sum()
    print(f"    질문 비율:  {q/len(train)*100:.1f}%  ({q:,} / {len(train):,})")


# ─────────────────────────────────────────
# KC-ELECTRA 데이터셋 빌드
# ─────────────────────────────────────────

def build_electra(output_dir: Path) -> None:
    print("\n[KC-ELECTRA] 데이터셋 구성 중...")

    # valid / test: 기존 데이터 ? 제거만 (TF-IDF와 동일)
    for split in ["valid", "test"]:
        df = load_existing(split)
        _save(df, output_dir / f"{split}.csv", split)

    # ── 질문 소스 전체 합산 ──────────────────────────────────
    i4k      = load_3i4k()
    korquad  = load_korquad(size=10_000)
    hard_neg = load_hard_negatives()

    base_train  = load_existing("train")
    q_base  = base_train[base_train["label"] == 1]   # SNS 질문 전체
    nq_base = base_train[base_train["label"] == 0]   # SNS 비질문

    # 질문: SNS 전체 + 3i4k 질문 + KorQuAD → 합산 후 총 질문 수 파악
    all_questions = pd.concat(
        [q_base,
         i4k[i4k["label"] == 1],
         korquad],
        ignore_index=True,
    ).drop_duplicates(subset=["text"])

    # 비질문: 3i4k 비질문 + hard negative 먼저 확보
    nq_fixed = pd.concat(
        [i4k[i4k["label"] == 0],
         hard_neg],
        ignore_index=True,
    ).drop_duplicates(subset=["text"])

    # SNS 비질문에서 (질문 수 - 고정 비질문 수)만큼 추가 샘플링 → 전체 50:50
    n_total_q  = len(all_questions)
    n_nq_extra = max(0, n_total_q - len(nq_fixed))
    nq_sns = nq_base.sample(min(n_nq_extra, len(nq_base)), random_state=RANDOM_SEED)

    all_nonquestions = pd.concat(
        [nq_fixed, nq_sns], ignore_index=True
    ).drop_duplicates(subset=["text"])

    train = pd.concat([all_questions, all_nonquestions], ignore_index=True)
    train = train.drop_duplicates(subset=["text"]).sample(
        frac=1, random_state=RANDOM_SEED
    ).reset_index(drop=True)

    _save(train, output_dir / "train.csv", "train")

    q = (train["label"] == 1).sum()
    nq = (train["label"] == 0).sum()
    print(f"\n  [KC-ELECTRA train 구성]")
    print(f"    질문 소스:")
    print(f"      SNS 질문 전체:   {len(q_base):>10,}건")
    print(f"      3i4k 질문:       {len(i4k[i4k['label']==1]):>10,}건")
    print(f"      KorQuAD:         {len(korquad):>10,}건")
    print(f"      → 질문 합계:     {q:>10,}건")
    print(f"    비질문 소스:")
    print(f"      3i4k 비질문:     {len(i4k[i4k['label']==0]):>10,}건")
    print(f"      LLM hard neg:    {len(hard_neg):>10,}건")
    print(f"      SNS 비질문 샘플: {len(nq_sns):>10,}건")
    print(f"      → 비질문 합계:   {nq:>10,}건")
    print(f"    ─────────────────────────────")
    print(f"    합계:              {len(train):>10,}건")
    print(f"    질문 비율:         {q/len(train)*100:.1f}%")


# ─────────────────────────────────────────
# 유틸
# ─────────────────────────────────────────

def _save(df: pd.DataFrame, path: Path, label: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df[["text", "label"]].to_csv(path, index=False, encoding="utf-8-sig")
    q = (df["label"] == 1).sum()
    print(f"  저장: {path.name}  {len(df):,}건  질문={q:,}({q/len(df)*100:.1f}%)")


def print_qmark_check(df: pd.DataFrame, name: str) -> None:
    remaining = df["text"].str.contains("?", regex=False).sum()
    print(f"  ? 잔존 확인 [{name}]: {remaining}건 (0이어야 정상)")


# ─────────────────────────────────────────
# Main
# ─────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tfidf-out",   default=str(PROCESSED / "tfidf_v2"))
    parser.add_argument("--electra-out", default=str(PROCESSED / "electra_v2"))
    parser.add_argument("--skip-tfidf",   action="store_true")
    parser.add_argument("--skip-electra", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not args.skip_tfidf:
        build_tfidf(Path(args.tfidf_out))

    if not args.skip_electra:
        build_electra(Path(args.electra_out))

    print("\n완료.")


if __name__ == "__main__":
    main()
