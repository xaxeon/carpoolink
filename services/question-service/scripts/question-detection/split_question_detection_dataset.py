from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create final train/valid/test dataset for question detection."
    )
    parser.add_argument(
        "--train-input",
        type=str,
        default="data/interim/question_detection/normalized/question_detection_train.csv",
    )
    parser.add_argument(
        "--valid-input",
        type=str,
        default="data/interim/question_detection/normalized/question_detection_valid.csv",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="data/processed/question_detection",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.1,
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=42,
    )
    return parser.parse_args()


def load_dataset(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df[["text", "is_question"]].rename(columns={"is_question": "label"})
    return df


def print_stats(name: str, df: pd.DataFrame) -> None:
    total = len(df)
    q_count = int((df["label"] == 1).sum())
    non_q_count = int((df["label"] == 0).sum())
    q_ratio = (q_count / total * 100) if total > 0 else 0.0

    print(f"\n[{name}]")
    print(f"총 행 수      : {total:,}")
    print(f"질문 수       : {q_count:,}")
    print(f"비질문 수     : {non_q_count:,}")
    print(f"질문 비율     : {q_ratio:.2f}%")


def save_dataset(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8-sig")
    print(f"[SAVED] {path}")


def main() -> None:
    args = parse_args()

    train_df = load_dataset(args.train_input)
    valid_df = load_dataset(args.valid_input)

    train_df, test_df = train_test_split(
        train_df,
        test_size=args.test_size,
        random_state=args.random_state,
        stratify=train_df["label"],
    )

    train_df = train_df.reset_index(drop=True)
    valid_df = valid_df.reset_index(drop=True)
    test_df = test_df.reset_index(drop=True)

    output_dir = Path(args.output_dir)

    save_dataset(train_df, output_dir / "train.csv")
    save_dataset(valid_df, output_dir / "valid.csv")
    save_dataset(test_df, output_dir / "test.csv")

    print_stats("train", train_df)
    print_stats("valid", valid_df)
    print_stats("test", test_df)


if __name__ == "__main__":
    main()