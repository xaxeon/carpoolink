from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Dict, List


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent

INPUT_DIR = PROJECT_ROOT / "data" / "interim" / "question_detection" / "candidate"
OUTPUT_DIR = PROJECT_ROOT / "data" / "interim" / "question_detection" / "merged"

TRAIN_INPUT = INPUT_DIR / "sns_multiturn_train_flat.csv"
VALID_INPUT = INPUT_DIR / "sns_multiturn_valid_flat.csv"

TRAIN_OUTPUT = OUTPUT_DIR / "sns_multiturn_train_cleaned.csv"
VALID_OUTPUT = OUTPUT_DIR / "sns_multiturn_valid_cleaned.csv"

ALLOWED_SPEECH_ACTS = {"정보 요청", "정보 제공", "친교 및 잡담"}


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def normalize_text(text: str) -> str:
    if text is None:
        return ""
    text = str(text)
    text = text.replace("\n", " ").replace("\r", " ").replace("\t", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def load_csv(path: Path) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def save_csv(rows: List[Dict[str, str]], path: Path) -> None:
    ensure_dir(path.parent)
    if not rows:
        print(f"[WARN] 저장할 행이 없습니다: {path}")
        return

    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"[SAVED] {path}")
    print(f"[ROWS] {len(rows)}")


def clean_rows(rows: List[Dict[str, str]], split_name: str) -> List[Dict[str, str]]:
    cleaned: List[Dict[str, str]] = []
    seen = set()

    total = len(rows)
    dropped_empty = 0
    dropped_invalid_act = 0
    dropped_short = 0
    dropped_duplicate = 0

    for row in rows:
        text = normalize_text(row.get("text", ""))
        speech_act = (row.get("speech_act", "") or "").strip()

        if not text:
            dropped_empty += 1
            continue

        if speech_act not in ALLOWED_SPEECH_ACTS:
            dropped_invalid_act += 1
            continue

        if len(text) < 2:
            dropped_short += 1
            continue

        dedup_key = (text, row.get("is_question", ""))
        if dedup_key in seen:
            dropped_duplicate += 1
            continue
        seen.add(dedup_key)

        cleaned_row = {
            "split": row.get("split", split_name),
            "text": text,
            "is_question": row.get("is_question", "0"),
            "speech_act": speech_act,
            "doc_id": row.get("doc_id", ""),
            "turn_id": row.get("turn_id", ""),
            "speaker": row.get("speaker", ""),
            "source_file": row.get("source_file", ""),
        }
        cleaned.append(cleaned_row)

    print(f"\n[CLEANING STATS] {split_name}")
    print(f"입력 행 수            : {total}")
    print(f"출력 행 수            : {len(cleaned)}")
    print(f"빈 텍스트 제거        : {dropped_empty}")
    print(f"이상 speech_act 제거  : {dropped_invalid_act}")
    print(f"짧은 텍스트 제거      : {dropped_short}")
    print(f"중복 제거             : {dropped_duplicate}")

    q_count = sum(int(r["is_question"]) for r in cleaned)
    non_q_count = len(cleaned) - q_count
    print(f"질문 수               : {q_count}")
    print(f"비질문 수             : {non_q_count}")

    return cleaned


def main() -> None:
    print("[START] cleaned csv 생성 시작")

    train_rows = load_csv(TRAIN_INPUT)
    valid_rows = load_csv(VALID_INPUT)

    train_cleaned = clean_rows(train_rows, "train")
    valid_cleaned = clean_rows(valid_rows, "validation")

    save_csv(train_cleaned, TRAIN_OUTPUT)
    save_csv(valid_cleaned, VALID_OUTPUT)

    print("\n[DONE] cleaned csv 생성 완료")


if __name__ == "__main__":
    main()
