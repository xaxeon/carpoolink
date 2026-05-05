from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import asdict
from typing import Any

import pandas as pd

from question_cluster_similarity import EMBEDDING_MODEL_ALIASES, EmbeddingSimilarityEngine
from question_clustering_core import build_clusters


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


def normalize_questions(payload: dict[str, Any]) -> pd.DataFrame:
    questions = payload.get("questions")
    if not isinstance(questions, list):
        raise ValueError("`questions` must be a list.")

    rows = []
    for index, item in enumerate(questions, start=1):
        if isinstance(item, str):
            rows.append({"question_id": f"q_{index}", "text": item})
            continue

        if isinstance(item, dict):
            text = item.get("text")
            if not isinstance(text, str):
                raise ValueError("Each question object must include a string `text` field.")

            question_id = item.get("question_id") or item.get("id") or f"q_{index}"
            rows.append({"question_id": str(question_id), "text": text})
            continue

        raise ValueError("Each question must be either a string or an object.")

    return pd.DataFrame(rows)


def serialize_clusters(clusters) -> list[dict[str, Any]]:
    return [
        {
            "cluster_id": cluster.cluster_id,
            "representative_question_id": cluster.representative_question_id,
            "representative_question": cluster.representative_question,
            "representative_canonical_text": cluster.representative_canonical_text,
            "representative_score": cluster.representative_score,
            "best_match_score": round(cluster.best_match_score, 4),
            "member_count": len(cluster.member_questions),
            "member_questions": [asdict(member) for member in cluster.member_questions],
        }
        for cluster in clusters
    ]


def clean_json_value(value: Any) -> Any:
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: clean_json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_json_value(item) for item in value]
    return value


def main() -> None:
    args = parse_args()
    payload = load_request_payload()
    df = normalize_questions(payload)

    threshold = float(payload.get("threshold", args.threshold))
    similarity_mode = str(payload.get("similarity_mode", args.similarity_mode))
    embedding_model = str(payload.get("embedding_model", args.embedding_model))

    if similarity_mode not in {"rule", "hybrid", "embedding"}:
        raise ValueError("`similarity_mode` must be one of: rule, hybrid, embedding.")

    embedding_engine = None
    if similarity_mode in {"hybrid", "embedding"}:
        embedding_engine = EmbeddingSimilarityEngine(embedding_model)

    clusters, assignment_df = build_clusters(
        df=df,
        text_column="text",
        question_id_column="question_id",
        threshold=threshold,
        similarity_mode=similarity_mode,
        embedding_engine=embedding_engine,
    )

    response = {
        "question_count": int(len(assignment_df)),
        "cluster_count": int(len(clusters)),
        "threshold": threshold,
        "similarity_mode": similarity_mode,
        "embedding_model": embedding_model if embedding_engine is not None else None,
        "clusters": serialize_clusters(clusters),
        "assignments": clean_json_value(assignment_df.to_dict(orient="records")),
    }
    sys.stdout.buffer.write(
        json.dumps(response, ensure_ascii=False, allow_nan=False).encode("utf-8")
    )
    sys.stdout.buffer.write(b"\n")


if __name__ == "__main__":
    main()
