from __future__ import annotations

import json
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline

from preprocess_question_detection_for_tfidf import normalize_for_tfidf
from question_detection_rules import classify_question_by_rules, extract_rule_features


SAFE_NEGATIVE_RULE_REASONS = {
    "rule_empty_text",
    "rule_short_reaction",
    "rule_statement_ending",
}

SCRIPT_DIR = Path(__file__).resolve().parent
SCRIPTS_ROOT = SCRIPT_DIR.parent
SERVICE_ROOT = SCRIPTS_ROOT.parent
REPO_ROOT = SERVICE_ROOT.parent.parent


@dataclass(frozen=True)
class HybridQuestionDetectorConfig:
    tfidf_artifact_dir: Path
    kc_electra_dir: Path
    tfidf_low_confidence: float = 0.15
    tfidf_high_confidence: float = 0.85
    tfidf_margin: float = 0.10
    always_use_kc_electra_on_rule_question: bool = False


def load_tfidf_artifact(artifact_dir: Path) -> dict[str, Any]:
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


def resolve_kc_electra_model_dir(model_dir: Path, config: dict[str, Any]) -> Path:
    bundled_model_dir = model_dir / "model"
    if bundled_model_dir.exists():
        return bundled_model_dir

    local_model_dir = Path(config["local_model_dir"])
    if not local_model_dir.is_absolute():
        local_model_dir = (REPO_ROOT / local_model_dir).resolve()

    return local_model_dir


def load_kc_electra_pipeline(model_dir: Path):
    model_dir = resolve_kc_electra_dir(model_dir)
    config = json.loads((model_dir / "inference_config.json").read_text(encoding="utf-8-sig"))
    local_model_dir = resolve_kc_electra_model_dir(model_dir, config)

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


def run_tfidf_inference(text: str, tfidf_artifact: dict[str, Any]) -> float:
    model = tfidf_artifact["model"]
    prob = model.predict_proba([text])[0, 1]
    return float(prob)


def route_to_kc_electra(
    *,
    tfidf_score: float,
    tfidf_threshold: float,
    rule_label: int | None,
    rule_reason: str,
    config: HybridQuestionDetectorConfig,
) -> tuple[bool, str]:
    if rule_label == 1 and not config.always_use_kc_electra_on_rule_question:
        return False, "rule_direct_positive"

    if rule_label == 0 and rule_reason in SAFE_NEGATIVE_RULE_REASONS:
        return False, "rule_direct_negative"

    if tfidf_score <= config.tfidf_low_confidence:
        return False, "tfidf_low_confidence_negative"

    if tfidf_score >= config.tfidf_high_confidence:
        return False, "tfidf_high_confidence_positive"

    if abs(tfidf_score - tfidf_threshold) <= config.tfidf_margin:
        return True, "near_tfidf_threshold"

    if rule_label == 1 and config.always_use_kc_electra_on_rule_question:
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


class HybridQuestionDetector:
    def __init__(self, config: HybridQuestionDetectorConfig, *, preload_kc_electra: bool = False) -> None:
        self.config = config
        self.tfidf_artifact = load_tfidf_artifact(config.tfidf_artifact_dir)
        self.kc_pipeline = None
        self.kc_config = None

        if preload_kc_electra:
            self.load_kc_electra()

    def load_kc_electra(self) -> None:
        if self.kc_pipeline is None or self.kc_config is None:
            self.kc_pipeline, self.kc_config = load_kc_electra_pipeline(self.config.kc_electra_dir)

    def predict(self, raw_text: str) -> dict[str, Any]:
        preprocessed_text = normalize_for_tfidf(raw_text)
        rule_label, rule_reason = classify_question_by_rules(raw_text)
        rule_features = extract_rule_features(raw_text)

        tfidf_threshold = float(self.tfidf_artifact["best_threshold"])
        tfidf_score = run_tfidf_inference(preprocessed_text, self.tfidf_artifact)

        should_use_kc_electra, route_reason = route_to_kc_electra(
            tfidf_score=tfidf_score,
            tfidf_threshold=tfidf_threshold,
            rule_label=rule_label,
            rule_reason=rule_reason,
            config=self.config,
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
            self.load_kc_electra()
            kc_electra_threshold = float(self.kc_config["best_threshold"])
            final_pred, kc_electra_score, decision_source = run_kc_electra_inference(
                text=preprocessed_text,
                clf=self.kc_pipeline,
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


def predict_question(raw_text: str, config: HybridQuestionDetectorConfig) -> dict[str, Any]:
    return HybridQuestionDetector(config).predict(raw_text)
