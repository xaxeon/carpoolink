from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

import pandas as pd

from question_cluster_similarity import EmbeddingSimilarityEngine
from question_clustering_core import build_clusters


@dataclass(frozen=True)
class QuestionClusteringConfig:
    threshold: float = 0.72
    similarity_mode: str = "hybrid"
    embedding_model: str = "distiluse"


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


class QuestionClusterer:
    def __init__(self) -> None:
        self.embedding_engines: dict[str, EmbeddingSimilarityEngine] = {}

    def get_embedding_engine(self, embedding_model: str) -> EmbeddingSimilarityEngine:
        if embedding_model not in self.embedding_engines:
            self.embedding_engines[embedding_model] = EmbeddingSimilarityEngine(embedding_model)
        return self.embedding_engines[embedding_model]

    def cluster(self, payload: dict[str, Any], config: QuestionClusteringConfig) -> dict[str, Any]:
        df = normalize_questions(payload)
        threshold = float(payload.get("threshold", config.threshold))
        similarity_mode = str(payload.get("similarity_mode", config.similarity_mode))
        embedding_model = str(payload.get("embedding_model", config.embedding_model))

        if similarity_mode not in {"rule", "hybrid", "embedding"}:
            raise ValueError("`similarity_mode` must be one of: rule, hybrid, embedding.")

        embedding_engine = None
        if similarity_mode in {"hybrid", "embedding"}:
            embedding_engine = self.get_embedding_engine(embedding_model)

        clusters, assignment_df = build_clusters(
            df=df,
            text_column="text",
            question_id_column="question_id",
            threshold=threshold,
            similarity_mode=similarity_mode,
            embedding_engine=embedding_engine,
        )

        return {
            "question_count": int(len(assignment_df)),
            "cluster_count": int(len(clusters)),
            "threshold": threshold,
            "similarity_mode": similarity_mode,
            "embedding_model": embedding_model if embedding_engine is not None else None,
            "clusters": serialize_clusters(clusters),
            "assignments": clean_json_value(assignment_df.to_dict(orient="records")),
        }
