from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.pipeline import Pipeline

from question_detection_rules import classify_question_by_rules, export_rule_config


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train TF-IDF question detector and find best threshold on validation set."
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
        "--output-dir",
        type=str,
        default="services/question-service/outputs/question_detection/tfidf_lr_threshold",
        help="Directory to save reports and threshold search results",
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
    parser.add_argument(
        "--save-sample-size",
        type=int,
        default=200,
        help="Number of representative FP/FN samples to save separately",
    )
    parser.add_argument(
        "--disable-rule-filter",
        action="store_true",
        help="Disable rule-based pre-filter and use model-only predictions",
    )
    parser.add_argument(
        "--model-filename",
        type=str,
        default="question_detector_pipeline.pkl",
        help="Filename for serialized sklearn pipeline",
    )
    parser.add_argument(
        "--artifact-filename",
        type=str,
        default="question_detector_artifact.pkl",
        help="Filename for serialized inference artifact",
    )
    return parser.parse_args()


def load_dataset(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df[["text", "text_preprocessed", "label"]].copy()
    return df


def build_pipeline(
    max_features: int,
    ngram_max: int,
    c_value: float,
    max_iter: int,
    use_class_weight: bool,
) -> Pipeline:
    class_weight = "balanced" if use_class_weight else None

    return Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    max_features=max_features,
                    ngram_range=(1, ngram_max),
                    lowercase=False,
                ),
            ),
            (
                "clf",
                LogisticRegression(
                    C=c_value,
                    max_iter=max_iter,
                    class_weight=class_weight,
                    solver="liblinear",
                    random_state=42,
                ),
            ),
        ]
    )


def calculate_binary_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)

    tp = int(((y_true == 1) & (y_pred == 1)).sum())
    tn = int(((y_true == 0) & (y_pred == 0)).sum())
    fp = int(((y_true == 0) & (y_pred == 1)).sum())
    fn = int(((y_true == 1) & (y_pred == 0)).sum())

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )
    accuracy = (tp + tn) / len(y_true) if len(y_true) > 0 else 0.0

    return {
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "accuracy": accuracy,
    }


def search_best_threshold(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    threshold_start: float,
    threshold_end: float,
    threshold_step: float,
    optimize_metric: str,
) -> tuple[float, pd.DataFrame, pd.DataFrame]:
    rows = []
    thresholds = np.arange(
        threshold_start,
        threshold_end + 1e-9,
        threshold_step,
    )

    for threshold in thresholds:
        y_pred = (y_prob >= threshold).astype(int)
        metrics = calculate_binary_metrics(y_true, y_pred)
        rows.append({"threshold": round(float(threshold), 4), **metrics})

    raw_df = pd.DataFrame(rows)
    sorted_df = raw_df.sort_values(
        by=[optimize_metric, "precision", "threshold"],
        ascending=[False, False, False],
    ).reset_index(drop=True)
    best_threshold = float(sorted_df.iloc[0]["threshold"])
    return best_threshold, sorted_df, raw_df


def save_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8-sig")


def format_confusion_matrix(cm: np.ndarray) -> str:
    return (
        "         pred_0  pred_1\n"
        f"true_0   {cm[0, 0]:7d} {cm[0, 1]:7d}\n"
        f"true_1   {cm[1, 0]:7d} {cm[1, 1]:7d}\n"
    )


def predict_prob_with_rule_filter(
    model: Pipeline,
    df: pd.DataFrame,
    use_rule_filter: bool,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    base_prob = model.predict_proba(df["text_preprocessed"])[:, 1]

    if not use_rule_filter:
        return base_prob, base_prob.copy(), ["model"] * len(df)

    final_prob = base_prob.copy()
    decision_sources = ["model"] * len(df)

    for index, text in enumerate(df["text"].astype(str).tolist()):
        rule_label, rule_reason = classify_question_by_rules(text)
        if rule_label is None:
            continue

        final_prob[index] = 1.0 if rule_label == 1 else 0.0
        decision_sources[index] = rule_reason

    return base_prob, final_prob, decision_sources


def save_error_files(
    result_df: pd.DataFrame,
    split_name: str,
    output_dir: Path,
    save_sample_size: int,
) -> None:
    error_df = result_df[result_df["correct"] == 0].copy()
    fn_df = error_df[(error_df["label"] == 1) & (error_df["pred"] == 0)].copy()
    fp_df = error_df[(error_df["label"] == 0) & (error_df["pred"] == 1)].copy()

    fn_df = fn_df.sort_values(by="score", ascending=True)
    fp_df = fp_df.sort_values(by="score", ascending=False)

    fn_df.to_csv(
        output_dir / f"{split_name}_false_negative_samples.csv",
        index=False,
        encoding="utf-8-sig",
    )
    fp_df.to_csv(
        output_dir / f"{split_name}_false_positive_samples.csv",
        index=False,
        encoding="utf-8-sig",
    )

    fn_df.head(save_sample_size).to_csv(
        output_dir / f"{split_name}_false_negative_samples_topk.csv",
        index=False,
        encoding="utf-8-sig",
    )
    fp_df.head(save_sample_size).to_csv(
        output_dir / f"{split_name}_false_positive_samples_topk.csv",
        index=False,
        encoding="utf-8-sig",
    )


def evaluate_with_threshold(
    model: Pipeline,
    df: pd.DataFrame,
    split_name: str,
    threshold: float,
    output_dir: Path,
    save_sample_size: int,
    use_rule_filter: bool,
) -> None:
    y_true = df["label"].to_numpy()
    base_prob, y_prob, decision_sources = predict_prob_with_rule_filter(
        model=model,
        df=df,
        use_rule_filter=use_rule_filter,
    )
    y_pred = (y_prob >= threshold).astype(int)

    report = classification_report(
        y_true,
        y_pred,
        digits=4,
        zero_division=0,
    )
    cm = confusion_matrix(y_true, y_pred)

    print(f"\n===== [{split_name.upper()} @ threshold={threshold:.2f}] =====")
    print(report)
    print(cm)

    save_text(output_dir / f"{split_name}_classification_report.txt", report)
    save_text(output_dir / f"{split_name}_confusion_matrix.txt", format_confusion_matrix(cm))

    result_df = df.copy()
    result_df["base_model_score"] = base_prob
    result_df["score"] = y_prob
    result_df["pred"] = y_pred
    result_df["correct"] = (result_df["label"] == result_df["pred"]).astype(int)
    result_df["decision_source"] = decision_sources

    result_df.to_csv(
        output_dir / f"{split_name}_predictions_with_scores.csv",
        index=False,
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
        output_dir / f"{split_name}_decision_source_counts.csv",
        index=False,
        encoding="utf-8-sig",
    )

    save_error_files(
        result_df=result_df,
        split_name=split_name,
        output_dir=output_dir,
        save_sample_size=save_sample_size,
    )


def save_model_artifacts(
    model: Pipeline,
    best_threshold: float,
    output_dir: Path,
    args: argparse.Namespace,
    use_rule_filter: bool,
) -> None:
    pipeline_path = output_dir / args.model_filename
    artifact_path = output_dir / args.artifact_filename
    config_path = output_dir / "inference_config.json"

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
        "model_filename": args.model_filename,
        "artifact_filename": args.artifact_filename,
        "rule_config": export_rule_config(),
    }
    config_path.write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8-sig",
    )


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    use_rule_filter = not args.disable_rule_filter

    train_df = load_dataset(args.train_path)
    valid_df = load_dataset(args.valid_path)
    test_df = load_dataset(args.test_path)

    print("[INFO] train size:", len(train_df))
    print("[INFO] valid size:", len(valid_df))
    print("[INFO] test size :", len(test_df))
    print("[INFO] use_class_weight:", args.use_class_weight)
    print("[INFO] use_rule_filter:", use_rule_filter)

    model = build_pipeline(
        max_features=args.max_features,
        ngram_max=args.ngram_max,
        c_value=args.c_value,
        max_iter=args.max_iter,
        use_class_weight=args.use_class_weight,
    )

    print("\n[INFO] Training model...")
    model.fit(train_df["text_preprocessed"], train_df["label"])
    print("[INFO] Training completed.")

    _, valid_prob, _ = predict_prob_with_rule_filter(
        model=model,
        df=valid_df,
        use_rule_filter=use_rule_filter,
    )
    valid_true = valid_df["label"].to_numpy()

    best_threshold, threshold_sorted_df, threshold_raw_df = search_best_threshold(
        y_true=valid_true,
        y_prob=valid_prob,
        threshold_start=args.threshold_start,
        threshold_end=args.threshold_end,
        threshold_step=args.threshold_step,
        optimize_metric=args.optimize_metric,
    )

    print(f"\n[INFO] Best threshold on valid ({args.optimize_metric}): {best_threshold:.2f}")

    threshold_sorted_df.to_csv(
        output_dir / "threshold_search_results_sorted.csv",
        index=False,
        encoding="utf-8-sig",
    )
    threshold_raw_df.to_csv(
        output_dir / "threshold_search_results_raw.csv",
        index=False,
        encoding="utf-8-sig",
    )

    save_text(
        output_dir / "best_threshold.txt",
        (
            f"best_threshold={best_threshold:.4f}\n"
            f"optimize_metric={args.optimize_metric}\n"
            f"use_class_weight={args.use_class_weight}\n"
            f"use_rule_filter={use_rule_filter}\n"
        ),
    )

    save_model_artifacts(
        model=model,
        best_threshold=best_threshold,
        output_dir=output_dir,
        args=args,
        use_rule_filter=use_rule_filter,
    )

    evaluate_with_threshold(
        model=model,
        df=valid_df,
        split_name="valid",
        threshold=best_threshold,
        output_dir=output_dir,
        save_sample_size=args.save_sample_size,
        use_rule_filter=use_rule_filter,
    )
    evaluate_with_threshold(
        model=model,
        df=test_df,
        split_name="test",
        threshold=best_threshold,
        output_dir=output_dir,
        save_sample_size=args.save_sample_size,
        use_rule_filter=use_rule_filter,
    )

    print("\n[DONE] Threshold search, artifact save, and evaluation completed.")


if __name__ == "__main__":
    main()
