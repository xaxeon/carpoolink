from __future__ import annotations

import argparse

from question_cluster_similarity import EMBEDDING_MODEL_ALIASES, EmbeddingSimilarityEngine
from question_clustering_core import (
    build_clusters,
    load_input_dataframe,
    print_summary,
    resolve_cli_path,
    save_outputs,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build question clusters with embedding-only or hybrid similarity."
    )
    parser.add_argument("--input-path", type=str, required=True, help="Path to input CSV or JSONL file.")
    parser.add_argument(
        "--output-dir",
        type=str,
        default="services/question-service/outputs/question_clustering/embedding_based",
        help="Directory to save embedding-based clustering outputs.",
    )
    parser.add_argument("--text-column", type=str, default="text", help="Column name containing question text.")
    parser.add_argument(
        "--question-id-column",
        type=str,
        default="question_id",
        help="Optional column name containing stable question id.",
    )
    parser.add_argument(
        "--similarity-mode",
        type=str,
        choices=["hybrid", "embedding"],
        default="hybrid",
        help="Use hybrid rule+embedding similarity or embedding-only similarity.",
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
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.72,
        help="Similarity threshold for cluster assignment.",
    )
    parser.add_argument("--max-rows", type=int, default=None, help="Optional cap for quick smoke tests.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = resolve_cli_path(args.input_path)
    output_dir = resolve_cli_path(args.output_dir)

    df = load_input_dataframe(input_path)
    if args.text_column not in df.columns:
        raise ValueError(f"Column '{args.text_column}' does not exist in input data.")

    if args.max_rows is not None:
        df = df.head(args.max_rows).copy()

    embedding_engine = EmbeddingSimilarityEngine(args.embedding_model)
    clusters, assignment_df = build_clusters(
        df=df,
        text_column=args.text_column,
        question_id_column=args.question_id_column,
        threshold=args.threshold,
        similarity_mode=args.similarity_mode,
        embedding_engine=embedding_engine,
    )
    save_outputs(output_dir=output_dir, clusters=clusters, assignment_df=assignment_df)
    print_summary(clusters=clusters, assignment_df=assignment_df)


if __name__ == "__main__":
    main()
