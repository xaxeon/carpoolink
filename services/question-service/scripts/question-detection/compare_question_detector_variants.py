from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path

import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix

from question_detection_rules import export_rule_config
from train_tfidf_question_detector_with_threshold import (
    build_pipeline,
    calculate_binary_metrics,
    load_dataset,
    predict_prob_with_rule_filter,
    search_best_threshold,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train and compare question detector variants with and without rule filter."
    )
    parser.add_argument(
        "--train-path",
        type=str,
        default="data/processed/question_detection/tfidf_ready/train.csv",
        help="Path to train csv",
    )
    parser.add_argument(
        "--valid-path",
        type=str,
        default="data/processed/question_detection/tfidf_ready/valid.csv",
        help="Path to valid csv",
    )
    parser.add_argument(
        "--test-path",
        type=str,
        default="data/processed/question_detection/tfidf_ready/test.csv",
        help="Path to test csv",
    )
    parser.add_argument(
        "--model-root-dir",
        type=str,
        default="services/model/question_detection",
        help="Directory to save trained artifacts for each variant",
    )
    parser.add_argument(
        "--report-dir",
        type=str,
        default="services/question-service/outputs/question_detection/variant_comparison",
        help="Directory to save comparison reports",
    )
    parser.add_argument(
        "--max-features",
        type=int,
        default=50000,
        help="Maximum number of TF-IDF features",
    )
    parser.add_argument(
        "--ngram-max",
        type=int,
        default=2,
        help="Use ngram_range=(1, ngram_max)",
    )
    parser.add_argument(
        "--c-value",
        type=float,
        default=1.0,
        help="Inverse regularization strength for Logistic Regression",
    )
    parser.add_argument(
        "--max-iter",
        type=int,
        default=1000,
        help="Maximum iterations for Logistic Regression",
    )
    parser.add_argument(
        "--use-class-weight",
        action="store_true",
        help="Use class_weight='balanced'",
    )
    parser.add_argument(
        "--threshold-start",
        type=float,
        default=0.05,
        help="Threshold sweep start",
    )
    parser.add_argument(
        "--threshold-end",
        type=float,
        default=0.95,
        help="Threshold sweep end",
    )
    parser.add_argument(
        "--threshold-step",
        type=float,
        default=0.05,
        help="Threshold sweep step",
    )
    parser.add_argument(
        "--optimize-metric",
        type=str,
        default="f1",
        choices=["f1", "recall", "precision"],
        help="Metric to optimize on validation set",
    )
    return parser.parse_args()


def save_variant_artifact(
    model,
    variant_dir: Path,
    best_threshold: float,
    use_rule_filter: bool,
    args: argparse.Namespace,
) -> None:
    variant_dir.mkdir(parents=True, exist_ok=True)

    pipeline_path = variant_dir / "question_detector_pipeline.pkl"
    artifact_path = variant_dir / "question_detector_artifact.pkl"
    config_path = variant_dir / "inference_config.json"

    with pipeline_path.open("wb") as file:
        pickle.dump(model, file)

    artifact = {
        "model": model,
        "best_threshold": best_threshold,
        "use_rule_filter": use_rule_filter,
        "rule_config": export_rule_config(),
        "train_args": {
            "max_features": args.max_features,
            "ngram_max": args.ngram_max,
            "c_value": args.c_value,
            "max_iter": args.max_iter,
            "use_class_weight": args.use_class_weight,
            "optimize_metric": args.optimize_metric,
        },
    }
    with artifact_path.open("wb") as file:
        pickle.dump(artifact, file)

    config = {
        "best_threshold": round(best_threshold, 4),
        "use_rule_filter": use_rule_filter,
        "model_filename": pipeline_path.name,
        "artifact_filename": artifact_path.name,
        "rule_config": export_rule_config(),
    }
    config_path.write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8-sig",
    )


def evaluate_variant(
    model,
    df: pd.DataFrame,
    threshold: float,
    use_rule_filter: bool,
    split_name: str,
    variant_dir: Path,
) -> dict:
    y_true = df["label"].to_numpy()
    base_prob, final_prob, decision_sources = predict_prob_with_rule_filter(
        model=model,
        df=df,
        use_rule_filter=use_rule_filter,
    )
    y_pred = (final_prob >= threshold).astype(int)

    metrics = calculate_binary_metrics(y_true, y_pred)
    metrics["threshold"] = threshold
    metrics["variant"] = variant_dir.name
    metrics["split"] = split_name

    result_df = df.copy()
    result_df["base_model_score"] = base_prob
    result_df["score"] = final_prob
    result_df["pred"] = y_pred
    result_df["correct"] = (result_df["label"] == result_df["pred"]).astype(int)
    result_df["decision_source"] = decision_sources
    result_df.to_csv(
        variant_dir / f"{split_name}_predictions_with_scores.csv",
        index=False,
        encoding="utf-8-sig",
    )

    report_text = classification_report(y_true, y_pred, digits=4, zero_division=0)
    cm = confusion_matrix(y_true, y_pred)
    (variant_dir / f"{split_name}_classification_report.txt").write_text(
        report_text,
        encoding="utf-8-sig",
    )
    (variant_dir / f"{split_name}_confusion_matrix.txt").write_text(
        str(cm),
        encoding="utf-8-sig",
    )

    decision_source_df = (
        pd.Series(decision_sources, name="decision_source")
        .value_counts()
        .rename_axis("decision_source")
        .reset_index(name="count")
    )
    decision_source_df["ratio"] = (decision_source_df["count"] / len(df)).round(4)
    decision_source_df.to_csv(
        variant_dir / f"{split_name}_decision_source_counts.csv",
        index=False,
        encoding="utf-8-sig",
    )

    return metrics


def train_and_evaluate_variant(
    variant_name: str,
    use_rule_filter: bool,
    train_df: pd.DataFrame,
    valid_df: pd.DataFrame,
    test_df: pd.DataFrame,
    args: argparse.Namespace,
    model_root_dir: Path,
) -> tuple[dict, dict]:
    variant_dir = model_root_dir / variant_name
    variant_dir.mkdir(parents=True, exist_ok=True)

    model = build_pipeline(
        max_features=args.max_features,
        ngram_max=args.ngram_max,
        c_value=args.c_value,
        max_iter=args.max_iter,
        use_class_weight=args.use_class_weight,
    )

    print(f"\n[INFO] Training variant: {variant_name}")
    model.fit(train_df["text_preprocessed"], train_df["label"])

    _, valid_prob, _ = predict_prob_with_rule_filter(
        model=model,
        df=valid_df,
        use_rule_filter=use_rule_filter,
    )
    best_threshold, threshold_sorted_df, threshold_raw_df = search_best_threshold(
        y_true=valid_df["label"].to_numpy(),
        y_prob=valid_prob,
        threshold_start=args.threshold_start,
        threshold_end=args.threshold_end,
        threshold_step=args.threshold_step,
        optimize_metric=args.optimize_metric,
    )

    threshold_sorted_df.to_csv(
        variant_dir / "threshold_search_results_sorted.csv",
        index=False,
        encoding="utf-8-sig",
    )
    threshold_raw_df.to_csv(
        variant_dir / "threshold_search_results_raw.csv",
        index=False,
        encoding="utf-8-sig",
    )

    (variant_dir / "best_threshold.txt").write_text(
        (
            f"best_threshold={best_threshold:.4f}\n"
            f"optimize_metric={args.optimize_metric}\n"
            f"use_rule_filter={use_rule_filter}\n"
        ),
        encoding="utf-8-sig",
    )

    save_variant_artifact(
        model=model,
        variant_dir=variant_dir,
        best_threshold=best_threshold,
        use_rule_filter=use_rule_filter,
        args=args,
    )

    valid_metrics = evaluate_variant(
        model=model,
        df=valid_df,
        threshold=best_threshold,
        use_rule_filter=use_rule_filter,
        split_name="valid",
        variant_dir=variant_dir,
    )
    test_metrics = evaluate_variant(
        model=model,
        df=test_df,
        threshold=best_threshold,
        use_rule_filter=use_rule_filter,
        split_name="test",
        variant_dir=variant_dir,
    )

    return valid_metrics, test_metrics


def save_comparison_report(
    comparison_df: pd.DataFrame,
    report_path: Path,
    issue_status_lines: list[str],
) -> None:
    lines = ["# Question Detector Variant Comparison", ""]
    lines.append("## Issue #2 Status")
    lines.append("")
    for line in issue_status_lines:
        lines.append(f"- {line}")
    lines.append("")

    lines.append("## Test Metrics")
    lines.append("")
    for _, row in comparison_df.iterrows():
        lines.append(
            "- "
            f"{row['variant']}: "
            f"precision={row['precision']:.4f}, "
            f"recall={row['recall']:.4f}, "
            f"f1={row['f1']:.4f}, "
            f"accuracy={row['accuracy']:.4f}, "
            f"threshold={row['threshold']:.2f}"
        )
    lines.append("")

    best_row = comparison_df.sort_values(
        by=["f1", "precision", "recall"],
        ascending=[False, False, False],
    ).iloc[0]
    lines.append("## Winner")
    lines.append("")
    lines.append(
        f"- Best test variant by f1: {best_row['variant']} "
        f"(f1={best_row['f1']:.4f}, precision={best_row['precision']:.4f}, recall={best_row['recall']:.4f})"
    )
    lines.append("")

    report_path.write_text("\n".join(lines), encoding="utf-8-sig")


def main() -> None:
    args = parse_args()

    train_df = load_dataset(args.train_path)
    valid_df = load_dataset(args.valid_path)
    test_df = load_dataset(args.test_path)

    model_root_dir = Path(args.model_root_dir)
    report_dir = Path(args.report_dir)
    model_root_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    issue_status_lines = [
        "데이터 수집/정리/분할 스크립트는 존재한다.",
        "채팅체 정규화와 TF-IDF 입력 전처리 스크립트가 존재한다.",
        "질문 후보 선별 규칙 초안은 공용 규칙 모듈로 정리되었다.",
        "남은 작업은 규칙 기반과 모델 기반을 함께 비교해 실제 추론 전략을 결정하는 것이다.",
    ]

    valid_rule_metrics, test_rule_metrics = train_and_evaluate_variant(
        variant_name="tfidf_lr_rule_filter_on",
        use_rule_filter=True,
        train_df=train_df,
        valid_df=valid_df,
        test_df=test_df,
        args=args,
        model_root_dir=model_root_dir,
    )
    valid_plain_metrics, test_plain_metrics = train_and_evaluate_variant(
        variant_name="tfidf_lr_rule_filter_off",
        use_rule_filter=False,
        train_df=train_df,
        valid_df=valid_df,
        test_df=test_df,
        args=args,
        model_root_dir=model_root_dir,
    )

    comparison_df = pd.DataFrame(
        [
            test_rule_metrics,
            test_plain_metrics,
        ]
    )[
        [
            "variant",
            "split",
            "threshold",
            "tp",
            "tn",
            "fp",
            "fn",
            "precision",
            "recall",
            "f1",
            "accuracy",
        ]
    ]
    comparison_df.to_csv(
        report_dir / "test_variant_comparison.csv",
        index=False,
        encoding="utf-8-sig",
    )

    valid_comparison_df = pd.DataFrame(
        [
            valid_rule_metrics,
            valid_plain_metrics,
        ]
    )[
        [
            "variant",
            "split",
            "threshold",
            "tp",
            "tn",
            "fp",
            "fn",
            "precision",
            "recall",
            "f1",
            "accuracy",
        ]
    ]
    valid_comparison_df.to_csv(
        report_dir / "valid_variant_comparison.csv",
        index=False,
        encoding="utf-8-sig",
    )

    save_comparison_report(
        comparison_df=comparison_df,
        report_path=report_dir / "comparison_report.md",
        issue_status_lines=issue_status_lines,
    )

    print("\n[DONE] Variant comparison completed.")
    print(f"[SAVED] Models: {model_root_dir}")
    print(f"[SAVED] Reports: {report_dir}")


if __name__ == "__main__":
    main()
