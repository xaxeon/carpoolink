from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from question_cluster_similarity import EMBEDDING_MODEL_ALIASES
from question_clustering_inference import QuestionClusterer, QuestionClusteringConfig


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Cluster question texts from a JSON request and write JSON to stdout."
    )
    parser.add_argument("--threshold", type=float, default=0.72)
    parser.add_argument(
        "--similarity-mode",
        type=str,
        choices=["rule", "hybrid", "embedding"],
        default="hybrid",
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
    return parser.parse_args()


def load_request_payload() -> dict[str, Any]:
    raw_payload = sys.stdin.buffer.read().decode("utf-8")
    if not raw_payload.strip():
        raise ValueError("Request payload is empty.")

    payload = json.loads(raw_payload)
    if not isinstance(payload, dict):
        raise ValueError("Request payload must be a JSON object.")

    return payload


def main() -> None:
    args = parse_args()
    payload = load_request_payload()
    config = QuestionClusteringConfig(
        threshold=args.threshold,
        similarity_mode=args.similarity_mode,
        embedding_model=args.embedding_model,
    )
    response = QuestionClusterer().cluster(payload, config)
    sys.stdout.buffer.write(
        json.dumps(response, ensure_ascii=False, allow_nan=False).encode("utf-8")
    )
    sys.stdout.buffer.write(b"\n")


if __name__ == "__main__":
    main()
