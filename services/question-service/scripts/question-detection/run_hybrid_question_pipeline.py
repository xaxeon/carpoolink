from __future__ import annotations

import argparse
import json
from pathlib import Path

from question_detection_inference import (
    HybridQuestionDetector,
    HybridQuestionDetectorConfig,
)


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


def main() -> None:
    args = parse_args()
    config = HybridQuestionDetectorConfig(
        tfidf_artifact_dir=Path(args.tfidf_artifact_dir),
        kc_electra_dir=Path(args.kc_electra_dir),
        tfidf_low_confidence=args.tfidf_low_confidence,
        tfidf_high_confidence=args.tfidf_high_confidence,
        tfidf_margin=args.tfidf_margin,
        always_use_kc_electra_on_rule_question=args.always_use_kc_electra_on_rule_question,
    )
    detector = HybridQuestionDetector(config)
    result = detector.predict(args.text)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
