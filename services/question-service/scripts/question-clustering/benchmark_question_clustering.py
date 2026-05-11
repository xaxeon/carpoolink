from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import pandas as pd

from question_clustering_core import REPO_ROOT, resolve_cli_path, save_input_dataframe


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare question-only clustering dataset and run clustering benchmark."
    )
    parser.add_argument(
        "--input-paths",
        nargs="+",
        default=[
            "data/processed/question_detection/train.csv",
            "data/processed/question_detection/valid.csv",
            "data/processed/question_detection/test.csv",
        ],
        help="One or more CSV paths to merge before clustering.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        required=True,
        help="Directory to save benchmark inputs and clustering outputs.",
    )
    parser.add_argument(
        "--python-executable",
        type=str,
        default=sys.executable,
        help="Python executable to use for downstream clustering scripts.",
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["rule", "embedding", "pipeline"],
        default="pipeline",
        help="Which clustering runner to execute.",
    )
    parser.add_argument(
        "--similarity-mode",
        type=str,
        choices=["hybrid", "embedding"],
        default="hybrid",
        help="Similarity mode for embedding stage or embedding-only runner.",
    )
    parser.add_argument(
        "--embedding-model",
        type=str,
        default="distiluse",
        help="Embedding model alias or Hugging Face model id.",
    )
    parser.add_argument(
        "--rule-threshold",
        type=float,
        default=0.72,
        help="Rule-based threshold for stage 1 or rule-only mode.",
    )
    parser.add_argument(
        "--embedding-threshold",
        type=float,
        default=0.72,
        help="Embedding or hybrid threshold.",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Optional cap after filtering question rows for smoke runs.",
    )
    parser.add_argument(
        "--random-seed",
        type=int,
        default=42,
        help="Random seed used when sampling rows.",
    )
    return parser.parse_args()


def load_and_merge_question_rows(input_paths: list[str]) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for raw_path in input_paths:
        path = resolve_cli_path(raw_path)
        df = pd.read_csv(path)
        if "text" not in df.columns or "label" not in df.columns:
            raise ValueError(f"{path} must include 'text' and 'label' columns.")

        question_df = df[df["label"] == 1][["text", "label"]].copy()
        question_df["source_path"] = str(path.relative_to(REPO_ROOT))
        frames.append(question_df)

    merged_df = pd.concat(frames, ignore_index=True)
    merged_df = merged_df.drop_duplicates(subset=["text"]).reset_index(drop=True)
    merged_df["question_id"] = [f"question_{index + 1}" for index in range(len(merged_df))]
    return merged_df[["question_id", "text", "label", "source_path"]]


def sample_question_rows(df: pd.DataFrame, sample_size: int | None, random_seed: int) -> pd.DataFrame:
    if sample_size is None or sample_size >= len(df):
        return df.reset_index(drop=True)
    return df.sample(n=sample_size, random_state=random_seed).reset_index(drop=True)


def build_result_assignment_path(output_dir: Path, mode: str) -> Path:
    if mode == "pipeline":
        return output_dir / "stage2_embedding" / "question_cluster_assignments.csv"
    return output_dir / "question_cluster_assignments.csv"


def write_benchmark_summary(
    *,
    output_dir: Path,
    args: argparse.Namespace,
    merged_df: pd.DataFrame,
    prepared_df: pd.DataFrame,
    command: list[str],
) -> None:
    source_counts = (
        merged_df.groupby("source_path")
        .size()
        .sort_values(ascending=False)
        .to_dict()
    )

    summary: dict[str, object] = {
        "mode": args.mode,
        "similarity_mode": args.similarity_mode,
        "embedding_model": args.embedding_model,
        "rule_threshold": args.rule_threshold,
        "embedding_threshold": args.embedding_threshold,
        "sample_size": args.sample_size,
        "random_seed": args.random_seed,
        "input_paths": args.input_paths,
        "prepared_question_rows": int(len(prepared_df)),
        "distinct_question_rows_before_sampling": int(len(merged_df)),
        "source_question_counts": {key: int(value) for key, value in source_counts.items()},
        "runner_command": command,
    }

    assignment_path = build_result_assignment_path(output_dir=output_dir, mode=args.mode)
    if assignment_path.exists():
        assignment_df = pd.read_csv(assignment_path)
        summary["result_assignment_path"] = str(assignment_path.relative_to(REPO_ROOT))
        summary["cluster_count"] = int(assignment_df["cluster_id"].nunique())
        summary["new_cluster_count"] = int((assignment_df["decision"] == "new_cluster").sum())
        summary["append_to_cluster_count"] = int((assignment_df["decision"] == "append_to_cluster").sum())
        summary["multi_question_cluster_count"] = int((assignment_df.groupby("cluster_id").size() > 1).sum())

    summary_path = output_dir / "benchmark_run_summary.json"
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[SUMMARY] {summary_path}")


def build_runner_command(args: argparse.Namespace, prepared_input_path: Path, output_dir: Path) -> list[str]:
    scripts_dir = REPO_ROOT / "services" / "question-service" / "scripts" / "question-clustering"

    if args.mode == "rule":
        return [
            args.python_executable,
            str(scripts_dir / "build_rule_based_question_clusters.py"),
            "--input-path",
            str(prepared_input_path),
            "--output-dir",
            str(output_dir),
            "--text-column",
            "text",
            "--question-id-column",
            "question_id",
            "--threshold",
            str(args.rule_threshold),
        ]

    if args.mode == "embedding":
        return [
            args.python_executable,
            str(scripts_dir / "build_embedding_question_clusters.py"),
            "--input-path",
            str(prepared_input_path),
            "--output-dir",
            str(output_dir),
            "--text-column",
            "text",
            "--question-id-column",
            "question_id",
            "--similarity-mode",
            args.similarity_mode,
            "--embedding-model",
            args.embedding_model,
            "--threshold",
            str(args.embedding_threshold),
        ]

    return [
        args.python_executable,
        str(scripts_dir / "run_question_clustering_pipeline.py"),
        "--input-path",
        str(prepared_input_path),
        "--output-dir",
        str(output_dir),
        "--text-column",
        "text",
        "--question-id-column",
        "question_id",
        "--rule-threshold",
        str(args.rule_threshold),
        "--embedding-threshold",
        str(args.embedding_threshold),
        "--similarity-mode",
        args.similarity_mode,
        "--embedding-model",
        args.embedding_model,
    ]


def main() -> None:
    args = parse_args()
    output_dir = resolve_cli_path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    merged_df = load_and_merge_question_rows(args.input_paths)
    prepared_df = sample_question_rows(
        df=merged_df,
        sample_size=args.sample_size,
        random_seed=args.random_seed,
    )

    prepared_input_path = output_dir / "question_only_input.csv"
    save_input_dataframe(prepared_df, prepared_input_path)

    print(f"[QUESTION ROWS] {len(prepared_df)}")
    print(f"[MODE] {args.mode}")
    print(f"[INPUT] {prepared_input_path}")

    command = build_runner_command(
        args=args,
        prepared_input_path=prepared_input_path,
        output_dir=output_dir,
    )
    print("[RUN]", " ".join(command))
    subprocess.run(command, cwd=str(REPO_ROOT), check=True)
    write_benchmark_summary(
        output_dir=output_dir,
        args=args,
        merged_df=merged_df,
        prepared_df=prepared_df,
        command=command,
    )


if __name__ == "__main__":
    main()
