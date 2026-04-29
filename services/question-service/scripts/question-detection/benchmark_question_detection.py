from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import classification_report

from preprocess_question_detection_for_tfidf import normalize_for_tfidf
from question_detection_rules import classify_question_by_rules, extract_rule_features
from run_hybrid_question_pipeline import (
    SAFE_NEGATIVE_RULE_REASONS,
    load_kc_electra_pipeline,
    load_tfidf_artifact,
    route_to_kc_electra,
    run_kc_electra_inference,
    run_tfidf_inference,
)

SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = SCRIPT_DIR.parent
CARPOOLINK_ROOT = SERVICE_ROOT.parent.parent
REPO_ROOT = CARPOOLINK_ROOT.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark question detection on a CSV and save predictions with latency."
    )
    parser.add_argument(
        "--test-path",
        type=str,
        default="carpoolink/data/processed/question_detection/test.csv",
        help="Path to test CSV",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="carpoolink/services/question-service/outputs/question_detection/benchmark",
        help="Directory to save benchmark outputs",
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["direct", "api"],
        default="direct",
        help="Benchmark direct Python inference or running HTTP API",
    )
    parser.add_argument(
        "--api-url",
        type=str,
        default="http://localhost:4003/api/question-detection/predict",
        help="Question-service API URL for mode=api",
    )
    parser.add_argument(
        "--tfidf-artifact-dir",
        type=str,
        default="carpoolink/services/model/question_detection/tfidf_lr_rule_filter_off",
        help="TF-IDF artifact directory",
    )
    parser.add_argument(
        "--kc-electra-dir",
        type=str,
        default="carpoolink/services/model/question_detection/kc_electra_question_detector",
        help="KC-ELECTRA artifact directory",
    )
    parser.add_argument(
        "--tfidf-low-confidence",
        type=float,
        default=0.15,
        help="Below this score, TF-IDF decides non-question directly",
    )
    parser.add_argument(
        "--tfidf-high-confidence",
        type=float,
        default=0.85,
        help="Above this score, TF-IDF decides question directly",
    )
    parser.add_argument(
        "--tfidf-margin",
        type=float,
        default=0.10,
        help="If abs(score-threshold) <= margin, route to KC-ELECTRA",
    )
    parser.add_argument(
        "--always-use-kc-electra-on-rule-question",
        action="store_true",
        help="Send strong rule-question cases to KC-ELECTRA instead of direct positive",
    )
    parser.add_argument(
        "--max-samples",
        type=int,
        default=None,
        help="Optional cap for faster smoke tests",
    )
    return parser.parse_args()


def load_test_df(path: Path, max_samples: int | None) -> pd.DataFrame:
    df = pd.read_csv(path)
    if "text" not in df.columns:
        raise ValueError("CSV must contain a 'text' column.")
    if max_samples is not None:
        df = df.head(max_samples).copy()
    return df.reset_index(drop=True)


def resolve_input_path(raw_path: str) -> Path:
    path = Path(raw_path)
    candidates = []

    if path.is_absolute():
        candidates.append(path)
    else:
        candidates.append(path)
        candidates.append(REPO_ROOT / path)
        candidates.append(CARPOOLINK_ROOT / path)

        raw_parts = path.parts
        if raw_parts and raw_parts[0].lower() == "carpoolink":
            candidates.append(CARPOOLINK_ROOT.joinpath(*raw_parts[1:]))

    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    return candidates[0].resolve() if candidates else path.resolve()


def build_direct_predictor(args: argparse.Namespace):
    tfidf_artifact = load_tfidf_artifact(resolve_input_path(args.tfidf_artifact_dir))
    tfidf_threshold = float(tfidf_artifact["best_threshold"])
    kc_pipeline = None
    kc_threshold = None

    class RoutingArgs:
        tfidf_low_confidence = args.tfidf_low_confidence
        tfidf_high_confidence = args.tfidf_high_confidence
        tfidf_margin = args.tfidf_margin
        always_use_kc_electra_on_rule_question = args.always_use_kc_electra_on_rule_question

    def predict(text: str) -> dict:
        nonlocal kc_pipeline, kc_threshold

        raw_text = text
        preprocessed_text = normalize_for_tfidf(raw_text)
        rule_label, rule_reason = classify_question_by_rules(raw_text)
        rule_features = extract_rule_features(raw_text)
        tfidf_score = run_tfidf_inference(preprocessed_text, tfidf_artifact)

        should_use_kc_electra, route_reason = route_to_kc_electra(
            text=preprocessed_text,
            tfidf_score=tfidf_score,
            tfidf_threshold=tfidf_threshold,
            rule_label=rule_label,
            rule_reason=rule_reason,
            args=RoutingArgs,
        )

        final_pred = None
        final_score = tfidf_score
        decision_source = "tfidf"
        kc_electra_score = None
        kc_electra_threshold = None

        if rule_label == 1 and not should_use_kc_electra and route_reason == "rule_direct_positive":
            final_pred = 1
            final_score = 1.0
            decision_source = route_reason
        elif rule_label == 0 and not should_use_kc_electra and route_reason == "rule_direct_negative":
            final_pred = 0
            final_score = 0.0
            decision_source = route_reason
        elif should_use_kc_electra:
            if kc_pipeline is None:
                kc_pipeline, kc_config = load_kc_electra_pipeline(resolve_input_path(args.kc_electra_dir))
                kc_threshold = float(kc_config["best_threshold"])
            kc_electra_threshold = kc_threshold
            final_pred, kc_electra_score, decision_source = run_kc_electra_inference(
                text=preprocessed_text,
                clf=kc_pipeline,
                threshold=kc_electra_threshold,
            )
            final_score = kc_electra_score
        else:
            final_pred = int(tfidf_score >= tfidf_threshold)
            decision_source = route_reason

        return {
            "text": raw_text,
            "text_preprocessed": preprocessed_text,
            "is_question": bool(final_pred),
            "score": round(float(final_score), 6),
            "decision_source": decision_source,
            "route_reason": route_reason,
            "rule_label": rule_label,
            "rule_reason": rule_reason,
            "rule_features": rule_features,
            "tfidf_score": round(float(tfidf_score), 6),
            "tfidf_threshold": round(float(tfidf_threshold), 6),
            "kc_electra_score": None if kc_electra_score is None else round(float(kc_electra_score), 6),
            "kc_electra_threshold": None if kc_electra_threshold is None else round(float(kc_electra_threshold), 6),
            "used_kc_electra": should_use_kc_electra,
        }

    return predict


def build_api_predictor(args: argparse.Namespace):
    api_url = args.api_url

    def predict(text: str) -> dict:
        body = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            api_url,
            data=body,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            payload = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"API request failed: {error.code} {payload}") from error
        except urllib.error.URLError as error:
            raise RuntimeError(f"API request failed: {error.reason}") from error
        return json.loads(payload)

    return predict


def summarize_results(result_df: pd.DataFrame, has_label: bool) -> dict:
    latency_ms = result_df["latency_ms"].to_numpy(dtype=float)
    summary = {
        "sample_count": int(len(result_df)),
        "avg_latency_ms": round(float(np.mean(latency_ms)), 3),
        "median_latency_ms": round(float(np.median(latency_ms)), 3),
        "p95_latency_ms": round(float(np.percentile(latency_ms, 95)), 3),
        "min_latency_ms": round(float(np.min(latency_ms)), 3),
        "max_latency_ms": round(float(np.max(latency_ms)), 3),
        "question_positive_ratio": round(float(result_df["pred"].mean()), 4),
    }

    if has_label:
        y_true = result_df["label"].astype(int).to_numpy()
        y_pred = result_df["pred"].astype(int).to_numpy()
        report = classification_report(y_true, y_pred, digits=4, zero_division=0, output_dict=True)
        summary["accuracy"] = round(float(report["accuracy"]), 4)
        summary["precision_1"] = round(float(report["1"]["precision"]), 4)
        summary["recall_1"] = round(float(report["1"]["recall"]), 4)
        summary["f1_1"] = round(float(report["1"]["f1-score"]), 4)

    return summary


def main() -> None:
    args = parse_args()
    test_path = resolve_input_path(args.test_path)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    df = load_test_df(test_path, args.max_samples)
    predictor = build_direct_predictor(args) if args.mode == "direct" else build_api_predictor(args)

    rows: list[dict] = []
    started_all = time.perf_counter()

    for index, row in df.iterrows():
        text = "" if pd.isna(row["text"]) else str(row["text"])
        started = time.perf_counter()
        result = predictor(text)
        elapsed_ms = (time.perf_counter() - started) * 1000.0

        item = {
            "row_index": int(index),
            "text": text,
            "label": row["label"] if "label" in df.columns and pd.notna(row["label"]) else None,
            "pred": int(bool(result["is_question"])),
            "correct": None,
            "latency_ms": round(elapsed_ms, 3),
            "score": result.get("score"),
            "decision_source": result.get("decision_source"),
            "route_reason": result.get("route_reason"),
            "rule_reason": result.get("rule_reason"),
            "used_kc_electra": result.get("used_kc_electra"),
            "text_preprocessed": result.get("text_preprocessed"),
        }
        if item["label"] is not None:
            item["label"] = int(item["label"])
            item["correct"] = int(item["label"] == item["pred"])

        rows.append(item)

    total_elapsed_ms = (time.perf_counter() - started_all) * 1000.0
    result_df = pd.DataFrame(rows)
    has_label = "label" in result_df.columns and result_df["label"].notna().any()
    summary = summarize_results(result_df, has_label=has_label)
    summary["mode"] = args.mode
    summary["test_path"] = str(test_path.resolve())
    summary["total_elapsed_ms"] = round(float(total_elapsed_ms), 3)

    result_csv_path = output_dir / "test_predictions_with_latency.csv"
    summary_json_path = output_dir / "benchmark_summary.json"
    report_txt_path = output_dir / "classification_report.txt"

    result_df.to_csv(result_csv_path, index=False, encoding="utf-8-sig")
    summary_json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8-sig")

    if has_label:
        report_text = classification_report(
            result_df["label"].astype(int),
            result_df["pred"].astype(int),
            digits=4,
            zero_division=0,
        )
        report_txt_path.write_text(report_text, encoding="utf-8-sig")

    print("[DONE] benchmark completed")
    print(f"mode={summary['mode']}")
    print(f"samples={summary['sample_count']}")
    print(f"avg_latency_ms={summary['avg_latency_ms']}")
    print(f"median_latency_ms={summary['median_latency_ms']}")
    print(f"p95_latency_ms={summary['p95_latency_ms']}")
    if has_label:
        print(f"accuracy={summary['accuracy']}")
        print(f"precision_1={summary['precision_1']}")
        print(f"recall_1={summary['recall_1']}")
        print(f"f1_1={summary['f1_1']}")
    print(f"results={result_csv_path}")
    print(f"summary={summary_json_path}")
    if has_label:
        print(f"report={report_txt_path}")


if __name__ == "__main__":
    main()
