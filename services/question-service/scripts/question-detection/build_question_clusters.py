from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from question_cluster_similarity import (
    SimilaritySignals,
    canonicalize_question_text,
    compute_similarity_signals,
    extract_keyword_tokens,
    is_cluster_match,
    score_representative_question,
)
from question_detection_rules import safe_text

SCRIPT_DIR = Path(__file__).resolve().parent
SCRIPTS_ROOT = SCRIPT_DIR.parent
SERVICE_ROOT = SCRIPTS_ROOT.parent
REPO_ROOT = SERVICE_ROOT.parent.parent


@dataclass
class ClusterMember:
    question_id: str
    text: str
    canonical_text: str
    representative_score: float


@dataclass
class QuestionCluster:
    cluster_id: str
    representative_question_id: str
    representative_question: str
    representative_canonical_text: str
    representative_score: float
    member_questions: list[ClusterMember] = field(default_factory=list)
    best_match_score: float = 0.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build question clusters with online incremental clustering."
    )
    parser.add_argument(
        "--input-path",
        type=str,
        required=True,
        help="Path to input CSV or JSONL file containing question texts.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="services/question-service/outputs/question_detection/question_clusters",
        help="Directory to save clustering outputs.",
    )
    parser.add_argument(
        "--text-column",
        type=str,
        default="text",
        help="Column name containing question text.",
    )
    parser.add_argument(
        "--question-id-column",
        type=str,
        default="question_id",
        help="Optional column name containing stable question id.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.60,
        help="Similarity threshold for assigning a question to an existing cluster.",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=None,
        help="Optional cap for quick smoke tests.",
    )
    return parser.parse_args()


def resolve_cli_path(raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return (REPO_ROOT / path).resolve()


def load_input_dataframe(input_path: Path) -> pd.DataFrame:
    if input_path.suffix.lower() == ".jsonl":
        rows = [json.loads(line) for line in input_path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
        return pd.DataFrame(rows)

    if input_path.suffix.lower() == ".json":
        payload = json.loads(input_path.read_text(encoding="utf-8-sig"))
        if isinstance(payload, list):
            return pd.DataFrame(payload)
        raise ValueError("JSON input must be a list of question objects.")

    encodings = ("utf-8-sig", "utf-8", "cp949", "utf-16")
    last_error = None
    for encoding in encodings:
        try:
            return pd.read_csv(input_path, encoding=encoding)
        except UnicodeDecodeError as error:
            last_error = error

    if last_error is not None:
        raise last_error

    return pd.read_csv(input_path)


def build_member(question_id: str, text: str) -> ClusterMember:
    normalized_text = safe_text(text)
    return ClusterMember(
        question_id=question_id,
        text=normalized_text,
        canonical_text=canonicalize_question_text(normalized_text),
        representative_score=score_representative_question(normalized_text),
    )


def maybe_update_representative(cluster: QuestionCluster) -> None:
    best_member = max(
        cluster.member_questions,
        key=lambda member: (member.representative_score, len(member.text), member.question_id),
    )
    cluster.representative_question_id = best_member.question_id
    cluster.representative_question = best_member.text
    cluster.representative_canonical_text = best_member.canonical_text
    cluster.representative_score = best_member.representative_score


def find_best_cluster(
    text: str,
    clusters: list[QuestionCluster],
    threshold: float,
) -> tuple[QuestionCluster | None, SimilaritySignals | None]:
    best_cluster = None
    best_signals = None

    for cluster in clusters:
        signals = compute_similarity_signals(text, cluster.representative_question)
        if best_signals is None or signals.score > best_signals.score:
            best_cluster = cluster
            best_signals = signals

    if best_cluster is None or best_signals is None:
        return None, None

    if not is_cluster_match(best_signals, threshold=threshold):
        return None, best_signals

    return best_cluster, best_signals


def build_clusters(
    df: pd.DataFrame,
    text_column: str,
    question_id_column: str,
    threshold: float,
) -> tuple[list[QuestionCluster], pd.DataFrame]:
    clusters: list[QuestionCluster] = []
    assignment_rows: list[dict[str, Any]] = []

    for index, row in df.reset_index(drop=True).iterrows():
        text = safe_text(row.get(text_column, ""))
        if not text:
            continue

        raw_question_id = row.get(question_id_column)
        question_id = str(raw_question_id) if pd.notna(raw_question_id) else f"q_{index + 1}"
        member = build_member(question_id=question_id, text=text)

        matched_cluster, signals = find_best_cluster(
            text=member.text,
            clusters=clusters,
            threshold=threshold,
        )

        if matched_cluster is None:
            cluster_id = f"cluster_{len(clusters) + 1}"
            cluster = QuestionCluster(
                cluster_id=cluster_id,
                representative_question_id=member.question_id,
                representative_question=member.text,
                representative_canonical_text=member.canonical_text,
                representative_score=member.representative_score,
                member_questions=[member],
                best_match_score=signals.score if signals else 0.0,
            )
            clusters.append(cluster)
            assigned_cluster = cluster
            decision = "new_cluster"
            similarity_score = signals.score if signals else 0.0
        else:
            matched_cluster.member_questions.append(member)
            matched_cluster.best_match_score = max(matched_cluster.best_match_score, signals.score)
            maybe_update_representative(matched_cluster)
            assigned_cluster = matched_cluster
            decision = "append_to_cluster"
            similarity_score = signals.score

        assignment_rows.append(
            {
                "question_id": member.question_id,
                "text": member.text,
                "canonical_text": member.canonical_text,
                "cluster_id": assigned_cluster.cluster_id,
                "representative_question": assigned_cluster.representative_question,
                "cluster_member_count": len(assigned_cluster.member_questions),
                "decision": decision,
                "similarity_score": round(float(similarity_score), 4),
                "keyword_tokens": " | ".join(extract_keyword_tokens(member.text)),
            }
        )

    assignment_df = pd.DataFrame(assignment_rows)
    return clusters, assignment_df


def save_outputs(
    output_dir: Path,
    clusters: list[QuestionCluster],
    assignment_df: pd.DataFrame,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    assignment_df.to_csv(
        output_dir / "question_cluster_assignments.csv",
        index=False,
        encoding="utf-8-sig",
    )

    cluster_summary_rows = []
    cluster_payload = []
    for cluster in clusters:
        cluster_summary_rows.append(
            {
                "cluster_id": cluster.cluster_id,
                "representative_question_id": cluster.representative_question_id,
                "representative_question": cluster.representative_question,
                "representative_canonical_text": cluster.representative_canonical_text,
                "representative_score": cluster.representative_score,
                "member_count": len(cluster.member_questions),
                "best_match_score": round(cluster.best_match_score, 4),
            }
        )
        cluster_payload.append(
            {
                "cluster_id": cluster.cluster_id,
                "representative_question_id": cluster.representative_question_id,
                "representative_question": cluster.representative_question,
                "representative_canonical_text": cluster.representative_canonical_text,
                "representative_score": cluster.representative_score,
                "member_questions": [asdict(member) for member in cluster.member_questions],
            }
        )

    pd.DataFrame(cluster_summary_rows).to_csv(
        output_dir / "question_cluster_summary.csv",
        index=False,
        encoding="utf-8-sig",
    )
    (output_dir / "question_clusters.json").write_text(
        json.dumps(cluster_payload, ensure_ascii=False, indent=2),
        encoding="utf-8-sig",
    )


def print_summary(clusters: list[QuestionCluster], assignment_df: pd.DataFrame) -> None:
    print(f"[QUESTIONS] {len(assignment_df)}")
    print(f"[CLUSTERS] {len(clusters)}")
    if not assignment_df.empty:
        new_cluster_count = int((assignment_df["decision"] == "new_cluster").sum())
        append_count = int((assignment_df["decision"] == "append_to_cluster").sum())
        print(f"[NEW CLUSTERS] {new_cluster_count}")
        print(f"[APPENDS] {append_count}")


def main() -> None:
    args = parse_args()
    input_path = resolve_cli_path(args.input_path)
    output_dir = resolve_cli_path(args.output_dir)

    df = load_input_dataframe(input_path)
    if args.text_column not in df.columns:
        raise ValueError(f"Column '{args.text_column}' does not exist in input data.")

    if args.max_rows is not None:
        df = df.head(args.max_rows).copy()

    clusters, assignment_df = build_clusters(
        df=df,
        text_column=args.text_column,
        question_id_column=args.question_id_column,
        threshold=args.threshold,
    )
    save_outputs(output_dir=output_dir, clusters=clusters, assignment_df=assignment_df)
    print_summary(clusters=clusters, assignment_df=assignment_df)


if __name__ == "__main__":
    main()
