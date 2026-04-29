from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np
import pandas as pd
from datasets import Dataset
from sklearn.metrics import classification_report, confusion_matrix
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
    TrainerCallback,
)

from preprocess_question_detection_for_tfidf import normalize_for_tfidf
from train_tfidf_question_detector_with_threshold import (
    calculate_binary_metrics,
    search_best_threshold,
)

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train KC-ELECTRA question detector with validation threshold search."
    )
    parser.add_argument(
        "--train-path",
        type=str,
        default="data/processed/question_detection/train.csv",
        help="Path to train csv",
    )
    parser.add_argument(
        "--valid-path",
        type=str,
        default="data/processed/question_detection/valid.csv",
        help="Path to valid csv",
    )
    parser.add_argument(
        "--test-path",
        type=str,
        default="data/processed/question_detection/test.csv",
        help="Path to test csv",
    )
    parser.add_argument(
        "--model-name",
        type=str,
        default="beomi/KcELECTRA-base-v2022",
        help="Hugging Face model name",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="services/model/question_detection/kc_electra_question_detector",
        help="Directory to save trained model and reports",
    )
    parser.add_argument(
        "--max-length",
        type=int,
        default=96,
        help="Maximum token length",
    )
    parser.add_argument(
        "--num-train-epochs",
        type=float,
        default=2.0,
        help="Number of training epochs",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=2e-5,
        help="Learning rate",
    )
    parser.add_argument(
        "--train-batch-size",
        type=int,
        default=16,
        help="Per-device train batch size",
    )
    parser.add_argument(
        "--eval-batch-size",
        type=int,
        default=32,
        help="Per-device eval batch size",
    )
    parser.add_argument(
        "--weight-decay",
        type=float,
        default=0.01,
        help="Weight decay",
    )
    parser.add_argument(
        "--warmup-ratio",
        type=float,
        default=0.1,
        help="Warmup ratio",
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
        "--max-train-samples",
        type=int,
        default=None,
        help="Optional train sample cap for smoke runs",
    )
    parser.add_argument(
        "--max-valid-samples",
        type=int,
        default=None,
        help="Optional valid sample cap for smoke runs",
    )
    parser.add_argument(
        "--max-test-samples",
        type=int,
        default=None,
        help="Optional test sample cap for smoke runs",
    )
    parser.add_argument(
        "--use-cpu",
        action="store_true",
        help="Force CPU training",
    )
    parser.add_argument(
        "--gradient-accumulation-steps",
        type=int,
        default=1,
        help="Gradient accumulation steps",
    )
    parser.add_argument(
        "--logging-steps",
        type=int,
        default=100,
        help="Logging step interval",
    )
    parser.add_argument(
        "--save-total-limit",
        type=int,
        default=2,
        help="Maximum number of checkpoints to keep",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed",
    )
    parser.add_argument(
        "--resume-from-checkpoint",
        type=str,
        default=None,
        help="Checkpoint path to resume from",
    )
    parser.add_argument(
        "--use-fp16",
        action="store_true",
        help="Enable fp16 training when GPU is available",
    )
    parser.add_argument(
        "--use-bf16",
        action="store_true",
        help="Enable bf16 training when GPU is available",
    )
    parser.add_argument(
        "--gradient-checkpointing",
        action="store_true",
        help="Enable gradient checkpointing for long training runs",
    )
    return parser.parse_args()


def load_dataset(path: str, sample_cap: int | None = None) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df[["text", "label"]].copy()
    df["text"] = df["text"].astype(str).apply(normalize_for_tfidf)
    df = df[df["text"] != ""].reset_index(drop=True)
    if sample_cap is not None:
        df = df.head(sample_cap).reset_index(drop=True)
    return df


def build_hf_dataset(df: pd.DataFrame) -> Dataset:
    return Dataset.from_pandas(
        pd.DataFrame(
            {
                "text": df["text"].tolist(),
                "labels": df["label"].astype(int).tolist(),
            }
        ),
        preserve_index=False,
    )


def save_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8-sig")


def logits_to_positive_probabilities(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=1, keepdims=True)
    exp_logits = np.exp(shifted)
    probs = exp_logits / exp_logits.sum(axis=1, keepdims=True)
    return probs[:, 1]


def save_prediction_outputs(
    df: pd.DataFrame,
    probabilities: np.ndarray,
    threshold: float,
    split_name: str,
    output_dir: Path,
) -> dict:
    y_true = df["label"].to_numpy()
    y_pred = (probabilities >= threshold).astype(int)

    report = classification_report(y_true, y_pred, digits=4, zero_division=0)
    cm = confusion_matrix(y_true, y_pred)
    metrics = calculate_binary_metrics(y_true, y_pred)

    save_text(output_dir / f"{split_name}_classification_report.txt", report)
    save_text(output_dir / f"{split_name}_confusion_matrix.txt", str(cm))

    result_df = df.copy()
    result_df["score"] = probabilities
    result_df["pred"] = y_pred
    result_df["correct"] = (result_df["label"] == result_df["pred"]).astype(int)
    result_df.to_csv(
        output_dir / f"{split_name}_predictions_with_scores.csv",
        index=False,
        encoding="utf-8-sig",
    )

    metrics["split"] = split_name
    metrics["threshold"] = threshold
    return metrics

class ConsoleProgressCallback(TrainerCallback):
    def __init__(self):
        self.train_start_time = None
        self.last_log_time = None

    def on_train_begin(self, args, state, control, **kwargs):
        self.train_start_time = time.time()
        self.last_log_time = self.train_start_time
        print(
            f"[TRAIN START] total_steps={state.max_steps}, "
            f"epochs={args.num_train_epochs}, "
            f"train_batch_size={args.per_device_train_batch_size}, "
            f"grad_accum={args.gradient_accumulation_steps}"
        )

    def on_log(self, args, state, control, logs=None, **kwargs):
        if not logs:
            return

        now = time.time()
        elapsed = now - self.train_start_time if self.train_start_time else 0.0
        current_step = max(1, state.global_step)
        total_steps = max(1, state.max_steps)

        pct = (current_step / total_steps) * 100.0
        sec_per_step = elapsed / current_step
        eta_sec = max(0.0, (total_steps - current_step) * sec_per_step)

        def fmt(sec: float) -> str:
            sec = int(sec)
            h = sec // 3600
            m = (sec % 3600) // 60
            s = sec % 60
            if h > 0:
                return f"{h:02d}:{m:02d}:{s:02d}"
            return f"{m:02d}:{s:02d}"

        loss_str = f"{logs['loss']:.4f}" if "loss" in logs else "-"
        lr_str = f"{logs['learning_rate']:.8f}" if "learning_rate" in logs else "-"

        print(
            f"[PROGRESS] step={current_step}/{total_steps} "
            f"({pct:.2f}%) | loss={loss_str} | lr={lr_str} | "
            f"elapsed={fmt(elapsed)} | eta={fmt(eta_sec)}"
        )

        self.last_log_time = now

    def on_train_end(self, args, state, control, **kwargs):
        total = time.time() - self.train_start_time if self.train_start_time else 0.0

        def fmt(sec: float) -> str:
            sec = int(sec)
            h = sec // 3600
            m = (sec % 3600) // 60
            s = sec % 60
            if h > 0:
                return f"{h:02d}:{m:02d}:{s:02d}"
            return f"{m:02d}:{s:02d}"

        print(f"[TRAIN END] total_elapsed={fmt(total)}")

def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    train_df = load_dataset(args.train_path, sample_cap=args.max_train_samples)
    valid_df = load_dataset(args.valid_path, sample_cap=args.max_valid_samples)
    test_df = load_dataset(args.test_path, sample_cap=args.max_test_samples)

    print("[INFO] train size:", len(train_df))
    print("[INFO] valid size:", len(valid_df))
    print("[INFO] test size :", len(test_df))
    print("[INFO] model name:", args.model_name)

    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=2,
    )

    train_ds = build_hf_dataset(train_df)
    valid_ds = build_hf_dataset(valid_df)
    test_ds = build_hf_dataset(test_df)

    def tokenize_batch(batch: dict) -> dict:
        return tokenizer(
            batch["text"],
            truncation=True,
            max_length=args.max_length,
        )

    train_ds = train_ds.map(tokenize_batch, batched=True)
    valid_ds = valid_ds.map(tokenize_batch, batched=True)
    test_ds = test_ds.map(tokenize_batch, batched=True)

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    training_args = TrainingArguments(
        output_dir=str(output_dir / "trainer_runs"),
        num_train_epochs=args.num_train_epochs,
        per_device_train_batch_size=args.train_batch_size,
        per_device_eval_batch_size=args.eval_batch_size,
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        warmup_ratio=args.warmup_ratio,
        logging_strategy="steps",
        logging_steps=args.logging_steps,
        save_strategy="epoch",
        eval_strategy="no",
        report_to="none",
        load_best_model_at_end=False,
        use_cpu=args.use_cpu,
        do_train=True,
        do_predict=True,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        save_total_limit=args.save_total_limit,
        seed=args.seed,
        fp16=args.use_fp16,
        bf16=args.use_bf16,
        gradient_checkpointing=args.gradient_checkpointing,
        disable_tqdm=False,   # 추가
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=valid_ds,
        processing_class=tokenizer,
        data_collator=data_collator,
        callbacks=[ConsoleProgressCallback()],   # 추가
    )

    print("\n[INFO] Training KC-ELECTRA...")
    trainer.train(resume_from_checkpoint=args.resume_from_checkpoint)
    print("[INFO] Training completed.")

    valid_logits = trainer.predict(valid_ds).predictions
    valid_prob = logits_to_positive_probabilities(valid_logits)
    best_threshold, threshold_sorted_df, threshold_raw_df = search_best_threshold(
        y_true=valid_df["label"].to_numpy(),
        y_prob=valid_prob,
        threshold_start=args.threshold_start,
        threshold_end=args.threshold_end,
        threshold_step=args.threshold_step,
        optimize_metric=args.optimize_metric,
    )

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
            f"model_name={args.model_name}\n"
        ),
    )

    test_logits = trainer.predict(test_ds).predictions
    test_prob = logits_to_positive_probabilities(test_logits)

    valid_metrics = save_prediction_outputs(
        df=valid_df,
        probabilities=valid_prob,
        threshold=best_threshold,
        split_name="valid",
        output_dir=output_dir,
    )
    test_metrics = save_prediction_outputs(
        df=test_df,
        probabilities=test_prob,
        threshold=best_threshold,
        split_name="test",
        output_dir=output_dir,
    )

    trainer.save_model(str(output_dir / "model"))
    tokenizer.save_pretrained(str(output_dir / "model"))

    inference_config = {
        "model_name": args.model_name,
        "local_model_dir": str(output_dir / "model"),
        "best_threshold": round(best_threshold, 4),
        "max_length": args.max_length,
        "train_args": {
            "num_train_epochs": args.num_train_epochs,
            "learning_rate": args.learning_rate,
            "train_batch_size": args.train_batch_size,
            "eval_batch_size": args.eval_batch_size,
            "weight_decay": args.weight_decay,
            "warmup_ratio": args.warmup_ratio,
            "gradient_accumulation_steps": args.gradient_accumulation_steps,
            "logging_steps": args.logging_steps,
            "save_total_limit": args.save_total_limit,
            "seed": args.seed,
            "use_fp16": args.use_fp16,
            "use_bf16": args.use_bf16,
            "gradient_checkpointing": args.gradient_checkpointing,
        },
        "valid_metrics": valid_metrics,
        "test_metrics": test_metrics,
    }
    save_text(
        output_dir / "inference_config.json",
        json.dumps(inference_config, ensure_ascii=False, indent=2),
    )

    print("\n[DONE] KC-ELECTRA training and evaluation completed.")


if __name__ == "__main__":
    main()
