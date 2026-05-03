from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path

import numpy as np
from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline

from preprocess_question_detection_for_tfidf import normalize_for_tfidf
from question_detection_rules import classify_question_by_rules, extract_rule_features


SAFE_NEGATIVE_RULE_REASONS = {
    "rule_empty_text",
    "rule_short_reaction",
    "rule_statement_ending",
}

SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = SCRIPT_DIR.parent
CARPOOLINK_ROOT = SERVICE_ROOT.parent.parent
REPO_ROOT = CARPOOLINK_ROOT.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run hybrid question detection pipeline: preprocess -> rules -> TF-IDF -> KC-ELECTRA."
    )
    parser.add_argument(
        "--text",
        type=str,
        required=True,
        help="Chat text to classify",
    )
    parser.add_argument(
        "--tfidf-artifact-dir",
        type=str,
        default="services/model/question_detection/tfidf_lr_rule_filter_off",
        help="Directory containing TF-IDF artifact files",
    )
    parser.add_argument(
        "--kc-electra-dir",
        type=str,
        default="services/model/question_detection/kc_electra_question_detector",
        help="Directory containing KC-ELECTRA model files",
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
    return parser.parse_args()


def load_tfidf_artifact(artifact_dir: Path) -> dict:
    artifact_path = artifact_dir / "question_detector_artifact.pkl"
    with artifact_path.open("rb") as file:
        return pickle.load(file)


def resolve_kc_electra_dir(model_dir: Path) -> Path:
    if model_dir.exists():
        return model_dir

    smoke_dir = Path(f"{model_dir}_smoke")
    if smoke_dir.exists():
        return smoke_dir

    return model_dir


def load_kc_electra_pipeline(model_dir: Path):
    model_dir = resolve_kc_electra_dir(model_dir)
    config = json.loads((model_dir / "inference_config.json").read_text(encoding="utf-8-sig"))
    local_model_dir = Path(config["local_model_dir"])
    if not local_model_dir.is_absolute():
        if local_model_dir.parts and local_model_dir.parts[0].lower() == "carpoolink":
            local_model_dir = REPO_ROOT.joinpath(*local_model_dir.parts)
        else:
            local_model_dir = (REPO_ROOT / local_model_dir).resolve()
    tokenizer = AutoTokenizer.from_pretrained(str(local_model_dir))
    model = AutoModelForSequenceClassification.from_pretrained(str(local_model_dir))
    clf = pipeline(
        "text-classification",
        model=model,
        tokenizer=tokenizer,
        return_all_scores=True,
        truncation=True,
    )
    return clf, config


def run_tfidf_inference(text: str, tfidf_artifact: dict) -> float:
    model = tfidf_artifact["model"]
    prob = model.predict_proba([text])[0, 1]
    return float(prob)


def route_to_kc_electra(
    text: str,
    tfidf_score: float,
    tfidf_threshold: float,
    rule_label: int | None,
    rule_reason: str,
    args: argparse.Namespace,
) -> tuple[bool, str]:
    if rule_label == 1 and not args.always_use_kc_electra_on_rule_question:
        return False, "rule_direct_positive"

    if rule_label == 0 and rule_reason in SAFE_NEGATIVE_RULE_REASONS:
        return False, "rule_direct_negative"

    if tfidf_score <= args.tfidf_low_confidence:
        return False, "tfidf_low_confidence_negative"

    if tfidf_score >= args.tfidf_high_confidence:
        return False, "tfidf_high_confidence_positive"

    if abs(tfidf_score - tfidf_threshold) <= args.tfidf_margin:
        return True, "near_tfidf_threshold"

    if rule_label == 1 and args.always_use_kc_electra_on_rule_question:
        return True, "rule_question_requires_confirmation"

    if rule_label is None:
        return True, "rule_uncertain"

    return False, "tfidf_direct_decision"


def run_kc_electra_inference(text: str, clf, threshold: float) -> tuple[int, float, str]:
    outputs = clf(text)
    if outputs and isinstance(outputs, list) and outputs and isinstance(outputs[0], dict):
        scores = outputs
    else:
        scores = outputs[0]
    label_to_score = {item["label"]: float(item["score"]) for item in scores}

    positive_score = None
    for label_key in ["LABEL_1", "1", "question"]:
        if label_key in label_to_score:
            positive_score = label_to_score[label_key]
            break

    if positive_score is None:
        positive_score = max(scores, key=lambda item: item["score"])["score"]

    pred = int(positive_score >= threshold)
    return pred, float(positive_score), "kc_electra"


def main() -> None:
    args = parse_args()

    raw_text = args.text
    preprocessed_text = normalize_for_tfidf(raw_text)
    rule_label, rule_reason = classify_question_by_rules(raw_text)
    rule_features = extract_rule_features(raw_text)

    tfidf_artifact = load_tfidf_artifact(Path(args.tfidf_artifact_dir))
    tfidf_threshold = float(tfidf_artifact["best_threshold"])
    tfidf_score = run_tfidf_inference(preprocessed_text, tfidf_artifact)

    should_use_kc_electra, route_reason = route_to_kc_electra(
        text=preprocessed_text,
        tfidf_score=tfidf_score,
        tfidf_threshold=tfidf_threshold,
        rule_label=rule_label,
        rule_reason=rule_reason,
        args=args,
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
        kc_pipeline, kc_config = load_kc_electra_pipeline(Path(args.kc_electra_dir))
        kc_electra_threshold = float(kc_config["best_threshold"])
        final_pred, kc_electra_score, decision_source = run_kc_electra_inference(
            text=preprocessed_text,
            clf=kc_pipeline,
            threshold=kc_electra_threshold,
        )
        final_score = kc_electra_score
    else:
        final_pred = int(tfidf_score >= tfidf_threshold)
        decision_source = route_reason

    result = {
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

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
