from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, List


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent

INPUT_DIR = PROJECT_ROOT / "data" / "interim" / "question_detection" / "merged"
OUTPUT_DIR = PROJECT_ROOT / "data" / "interim" / "question_detection" / "normalized"

TRAIN_INPUT = INPUT_DIR / "sns_multiturn_train_cleaned.csv"
VALID_INPUT = INPUT_DIR / "sns_multiturn_valid_cleaned.csv"

TRAIN_OUTPUT = OUTPUT_DIR / "question_detection_train.csv"
VALID_OUTPUT = OUTPUT_DIR / "question_detection_valid.csv"

COLUMNS = ["text", "is_question"]


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_csv(path: Path) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def save_csv(rows: List[Dict[str, str]], path: Path) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"[SAVED] {path}")
    print(f"[ROWS] {len(rows)}")


def build_dataset(rows: List[Dict[str, str]], split_name: str) -> List[Dict[str, str]]:
    output: List[Dict[str, str]] = []

    for row in rows:
        text = (row.get("text", "") or "").strip()
        is_question = str(row.get("is_question", "0")).strip()

        output.append({
            "text": text,
            "is_question": is_question,
        })

    q_count = sum(int(r["is_question"]) for r in output)
    non_q_count = len(output) - q_count

    print(f"\n[DATASET STATS] {split_name}")
    print(f"총 행 수    : {len(output)}")
    print(f"질문 수     : {q_count}")
    print(f"비질문 수   : {non_q_count}")

    return output


def main() -> None:
    print("[START] question detection final dataset 생성 시작")

    train_rows = load_csv(TRAIN_INPUT)
    valid_rows = load_csv(VALID_INPUT)

    train_dataset = build_dataset(train_rows, "train")
    valid_dataset = build_dataset(valid_rows, "validation")

    save_csv(train_dataset, TRAIN_OUTPUT)
    save_csv(valid_dataset, VALID_OUTPUT)

    print("\n[DONE] final dataset 생성 완료")


if __name__ == "__main__":
    main()
