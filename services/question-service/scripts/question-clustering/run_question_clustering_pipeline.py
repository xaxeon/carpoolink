from __future__ import annotations

import argparse

from question_cluster_similarity import EMBEDDING_MODEL_ALIASES, EmbeddingSimilarityEngine
from question_clustering_core import (
    build_clusters,
    load_input_dataframe,
    print_summary,
    resolve_cli_path,
    save_input_dataframe,
    save_outputs,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run question clustering pipeline: rule-based stage -> embedding stage."
    )
    parser.add_argument("--input-path", type=str, required=True, help="Path to input CSV or JSONL file.")
    parser.add_argument(
        "--output-dir",
        type=str,
        default="services/question-service/outputs/question_clustering/pipeline",
        help="Directory to save pipeline outputs.",
    )
    parser.add_argument("--text-column", type=str, default="text", help="Column name containing question text.")
    parser.add_argument(
        "--question-id-column",
        type=str,
        default="question_id",
        help="Optional column name containing stable question id.",
    )
    parser.add_argument(
        "--rule-threshold",
        type=float,
        default=0.72,
        help="Rule-based threshold for stage 1.",
    )
    parser.add_argument(
        "--embedding-threshold",
        type=float,
        default=0.72,
        help="Embedding or hybrid threshold for stage 2.",
    )
    parser.add_argument(
        "--similarity-mode",
        type=str,
        choices=["hybrid", "embedding"],
        default="hybrid",
        help="Similarity mode to use in stage 2.",
    )
    parser.add_argument(
        "--embedding-model",
        type=str,
        default="distiluse",
        help=(
            "Embedding model alias or Hugging Face model id. "
            f"Built-in aliases: {', '.join(sorted(EMBEDDING_MODEL_ALIASES))}"
        ),
    )
    parser.add_argument("--max-rows", type=int, default=None, help="Optional cap for quick smoke tests.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = resolve_cli_path(args.input_path)
    output_dir = resolve_cli_path(args.output_dir)
    stage1_dir = output_dir / "stage1_rule_based"
    stage2_dir = output_dir / "stage2_embedding"

    df = load_input_dataframe(input_path)
    if args.text_column not in df.columns:
        raise ValueError(f"Column '{args.text_column}' does not exist in input data.")

    if args.max_rows is not None:
        df = df.head(args.max_rows).copy()

    stage1_clusters, stage1_assignments = build_clusters(
        df=df,
        text_column=args.text_column,
        question_id_column=args.question_id_column,
        threshold=args.rule_threshold,
        similarity_mode="rule",
        embedding_engine=None,
    )
    save_outputs(output_dir=stage1_dir, clusters=stage1_clusters, assignment_df=stage1_assignments)

    stage2_input_path = stage1_dir / "rule_stage_input.csv"
    save_input_dataframe(stage1_assignments, stage2_input_path)

    embedding_engine = EmbeddingSimilarityEngine(args.embedding_model)
    stage2_clusters, stage2_assignments = build_clusters(
        df=stage1_assignments,
        text_column="representative_question",
        question_id_column="cluster_id",
        threshold=args.embedding_threshold,
        similarity_mode=args.similarity_mode,
        embedding_engine=embedding_engine,
    )
    save_outputs(output_dir=stage2_dir, clusters=stage2_clusters, assignment_df=stage2_assignments)
    print_summary(clusters=stage2_clusters, assignment_df=stage2_assignments)


if __name__ == "__main__":
    main()
