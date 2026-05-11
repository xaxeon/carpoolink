from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import pandas as pd

from question_clustering_core import REPO_ROOT, resolve_cli_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run threshold sweep for question clustering and aggregate benchmark summaries."
    )
    parser.add_argument(
        "--output-root",
        type=str,
        required=True,
        help="Root directory to save per-threshold outputs and aggregated summary.",
    )
    parser.add_argument(
        "--python-executable",
        type=str,
        default=sys.executable,
        help="Python executable used to run the benchmark script.",
    )
    parser.add_argument(
        "--input-paths",
        nargs="+",
        default=[
            "data/processed/question_detection/train.csv",
            "data/processed/question_detection/valid.csv",
            "data/processed/question_detection/test.csv",
        ],
        help="Input CSV paths merged before clustering.",
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["rule", "embedding", "pipeline"],
        default="pipeline",
        help="Clustering runner mode used for each threshold trial.",
    )
    parser.add_argument(
        "--similarity-mode",
        type=str,
        choices=["hybrid", "embedding"],
        default="hybrid",
        help="Similarity mode for embedding stage.",
    )
    parser.add_argument(
        "--embedding-model",
        type=str,
        default="distiluse",
        help="Embedding model alias or Hugging Face model id.",
    )
    parser.add_argument(
        "--thresholds",
        nargs="+",
        type=float,
        default=[0.72, 0.68, 0.64, 0.60],
        help="Threshold values to test. Applied to both rule and embedding stages by default.",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Optional sample cap for dry-run threshold sweeps.",
    )
    parser.add_argument(
        "--random-seed",
        type=int,
        default=42,
        help="Random seed used when sample-size is provided.",
    )
    return parser.parse_args()


def threshold_label(threshold: float) -> str:
    return str(threshold).replace(".", "_")


def build_benchmark_command(
    *,
    python_executable: str,
    output_dir: Path,
    input_paths: list[str],
    mode: str,
    similarity_mode: str,
    embedding_model: str,
    threshold: float,
    sample_size: int | None,
    random_seed: int,
) -> list[str]:
    command = [
        python_executable,
        str(REPO_ROOT / "services" / "question-service" / "scripts" / "question-clustering" / "benchmark_question_clustering.py"),
        "--output-dir",
        str(output_dir),
        "--python-executable",
        python_executable,
        "--mode",
        mode,
        "--similarity-mode",
        similarity_mode,
        "--embedding-model",
        embedding_model,
        "--rule-threshold",
        str(threshold),
        "--embedding-threshold",
        str(threshold),
        "--random-seed",
        str(random_seed),
        "--input-paths",
        *input_paths,
    ]

    if sample_size is not None:
        command.extend(["--sample-size", str(sample_size)])

    return command


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    args = parse_args()
    output_root = resolve_cli_path(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    aggregate_rows: list[dict[str, object]] = []
    benchmark_commands: list[dict[str, object]] = []

    for threshold in args.thresholds:
        run_dir = output_root / f"threshold_{threshold_label(threshold)}"
        command = build_benchmark_command(
            python_executable=args.python_executable,
            output_dir=run_dir,
            input_paths=args.input_paths,
            mode=args.mode,
            similarity_mode=args.similarity_mode,
            embedding_model=args.embedding_model,
            threshold=threshold,
            sample_size=args.sample_size,
            random_seed=args.random_seed,
        )
        print("[RUN]", " ".join(command))
        subprocess.run(command, cwd=str(REPO_ROOT), check=True)

        summary_path = run_dir / "benchmark_run_summary.json"
        summary = load_json(summary_path)
        aggregate_rows.append(
            {
                "threshold": threshold,
                "mode": summary.get("mode"),
                "similarity_mode": summary.get("similarity_mode"),
                "embedding_model": summary.get("embedding_model"),
                "prepared_question_rows": summary.get("prepared_question_rows"),
                "cluster_count": summary.get("cluster_count"),
                "new_cluster_count": summary.get("new_cluster_count"),
                "append_to_cluster_count": summary.get("append_to_cluster_count"),
                "multi_question_cluster_count": summary.get("multi_question_cluster_count"),
                "result_assignment_path": summary.get("result_assignment_path"),
                "run_directory": str(run_dir.relative_to(REPO_ROOT)),
            }
        )
        benchmark_commands.append(
            {
                "threshold": threshold,
                "command": command,
                "run_directory": str(run_dir.relative_to(REPO_ROOT)),
            }
        )

    aggregate_df = pd.DataFrame(aggregate_rows).sort_values("threshold", ascending=False)
    aggregate_csv_path = output_root / "threshold_sweep_summary.csv"
    aggregate_json_path = output_root / "threshold_sweep_summary.json"
    command_log_path = output_root / "threshold_sweep_commands.json"

    aggregate_df.to_csv(aggregate_csv_path, index=False, encoding="utf-8-sig")
    aggregate_json_path.write_text(
        json.dumps(aggregate_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    command_log_path.write_text(
        json.dumps(benchmark_commands, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"[SUMMARY_CSV] {aggregate_csv_path}")
    print(f"[SUMMARY_JSON] {aggregate_json_path}")
    print(f"[COMMAND_LOG] {command_log_path}")


if __name__ == "__main__":
    main()
