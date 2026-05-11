from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

import pandas as pd

from question_detection_rules import (
    build_pattern_combo_label,
    classify_question_by_rules,
    export_rule_config,
    extract_rule_features,
    safe_text,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze false positive / false negative samples for question detection."
    )
    parser.add_argument(
        "--input-path",
        type=str,
        required=True,
        help="Path to false positive / false negative csv",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        required=True,
        help="Directory to save analysis outputs",
    )
    parser.add_argument(
        "--top-k-samples",
        type=int,
        default=30,
        help="Number of representative samples to save per pattern",
    )
    return parser.parse_args()


def get_text_column(df: pd.DataFrame) -> str:
    if "text" in df.columns:
        return "text"
    if "text_preprocessed" in df.columns:
        return "text_preprocessed"
    raise ValueError("[ERROR] Neither 'text' nor 'text_preprocessed' column exists.")


def add_pattern_flags(df: pd.DataFrame, text_col: str) -> pd.DataFrame:
    out = df.copy()
    out[text_col] = out[text_col].apply(safe_text)

    feature_df = out[text_col].apply(lambda text: pd.Series(extract_rule_features(text)))
    out = pd.concat([out, feature_df.drop(columns=["text"])], axis=1)

    rule_results = out[text_col].apply(classify_question_by_rules)
    out["rule_label"] = rule_results.apply(lambda item: item[0] if item[0] is not None else -1)
    out["rule_reason"] = rule_results.apply(lambda item: item[1])
    out["is_rule_question"] = out["rule_label"] == 1
    out["is_rule_non_question"] = out["rule_label"] == 0
    out["needs_model"] = out["rule_label"] == -1
    out["pattern_combo"] = out.apply(
        lambda row: build_pattern_combo_label(row.to_dict()),
        axis=1,
    )
    return out


def build_summary(df: pd.DataFrame) -> pd.DataFrame:
    summary_rows = [
        ("num_samples", len(df)),
        ("avg_char_len", round(df["char_len"].mean(), 2)),
        ("median_char_len", round(df["char_len"].median(), 2)),
        ("question_mark_ratio", round(df["has_question_mark"].mean(), 4)),
        ("question_word_ratio", round(df["has_question_word"].mean(), 4)),
        ("question_ending_ratio", round(df["has_question_ending"].mean(), 4)),
        ("formal_request_ratio", round(df["has_formal_request"].mean(), 4)),
        ("chat_style_question_ratio", round(df["has_chat_style_question"].mean(), 4)),
        ("reaction_like_ratio", round(df["has_reaction_like"].mean(), 4)),
        ("non_question_start_ratio", round(df["has_non_question_start"].mean(), 4)),
        ("non_question_ending_ratio", round(df["has_non_question_ending"].mean(), 4)),
        ("short_text_ratio", round(df["is_short_text"].mean(), 4)),
        ("special_only_ratio", round(df["is_special_only"].mean(), 4)),
        ("avg_question_signal_count", round(df["question_signal_count"].mean(), 4)),
        ("rule_question_ratio", round(df["is_rule_question"].mean(), 4)),
        ("rule_non_question_ratio", round(df["is_rule_non_question"].mean(), 4)),
        ("needs_model_ratio", round(df["needs_model"].mean(), 4)),
    ]
    return pd.DataFrame(summary_rows, columns=["metric", "value"])


def build_flag_count_table(df: pd.DataFrame) -> pd.DataFrame:
    flag_cols = [
        "has_question_mark",
        "has_question_word",
        "has_question_ending",
        "has_formal_request",
        "has_chat_style_question",
        "has_reaction_like",
        "has_non_question_start",
        "has_non_question_ending",
        "is_short_text",
        "is_very_short_text",
        "is_special_only",
        "is_rule_question",
        "is_rule_non_question",
        "needs_model",
    ]

    rows = []
    total = len(df)
    for col in flag_cols:
        count = int(df[col].sum())
        rows.append(
            {
                "flag": col,
                "count": count,
                "ratio": round(count / total, 4) if total else 0.0,
            }
        )

    return pd.DataFrame(rows).sort_values(by="count", ascending=False).reset_index(drop=True)


def build_pattern_combo_table(df: pd.DataFrame) -> pd.DataFrame:
    combo_counter = Counter(df["pattern_combo"])
    rows = [{"pattern_combo": key, "count": value} for key, value in combo_counter.items()]
    out = pd.DataFrame(rows).sort_values(by="count", ascending=False).reset_index(drop=True)
    out["ratio"] = (out["count"] / len(df)).round(4)
    return out


def build_rule_reason_table(df: pd.DataFrame) -> pd.DataFrame:
    reason_counter = Counter(df["rule_reason"])
    rows = [{"rule_reason": key, "count": value} for key, value in reason_counter.items()]
    out = pd.DataFrame(rows).sort_values(by="count", ascending=False).reset_index(drop=True)
    out["ratio"] = (out["count"] / len(df)).round(4)
    return out


def save_representative_samples(
    df: pd.DataFrame,
    output_dir: Path,
    top_k_samples: int,
) -> None:
    sample_dir = output_dir / "pattern_samples"
    sample_dir.mkdir(parents=True, exist_ok=True)

    pattern_values = df["pattern_combo"].value_counts().index.tolist()
    for pattern in pattern_values:
        sub_df = df[df["pattern_combo"] == pattern].copy()

        if "score" in sub_df.columns:
            sub_df = sub_df.sort_values(by="score", ascending=False)
        else:
            sub_df = sub_df.sort_values(by="char_len", ascending=False)

        save_cols = [
            col
            for col in [
                "text",
                "text_preprocessed",
                "label",
                "pred",
                "score",
                "correct",
                "pattern_combo",
                "rule_label",
                "rule_reason",
            ]
            if col in sub_df.columns
        ]
        save_cols += [
            "char_len",
            "token_len_by_space",
            "has_question_mark",
            "has_question_word",
            "has_question_ending",
            "has_formal_request",
            "has_chat_style_question",
            "has_reaction_like",
            "has_non_question_start",
            "has_non_question_ending",
            "is_short_text",
            "is_special_only",
            "question_signal_count",
        ]

        sub_df[save_cols].head(top_k_samples).to_csv(
            sample_dir / f"{pattern}.csv",
            index=False,
            encoding="utf-8-sig",
        )


def save_pattern_reference(output_dir: Path) -> None:
    rule_config = export_rule_config()
    lines = ["# Rule Pattern Reference", ""]

    for key, values in rule_config.items():
        lines.append(f"## {key}")
        if isinstance(values, list):
            for value in values:
                lines.append(f"- `{value}`")
        else:
            lines.append(f"- `{values}`")
        lines.append("")

    (output_dir / "rule_pattern_reference.md").write_text(
        "\n".join(lines),
        encoding="utf-8-sig",
    )


def save_markdown_report(
    summary_df: pd.DataFrame,
    flag_count_df: pd.DataFrame,
    combo_df: pd.DataFrame,
    rule_reason_df: pd.DataFrame,
    output_path: Path,
) -> None:
    lines = []
    lines.append("# Error Analysis Summary")
    lines.append("")

    lines.append("## 1. Basic Summary")
    lines.append("")
    for _, row in summary_df.iterrows():
        lines.append(f"- {row['metric']}: {row['value']}")
    lines.append("")

    lines.append("## 2. Flag Counts")
    lines.append("")
    for _, row in flag_count_df.iterrows():
        lines.append(f"- {row['flag']}: {row['count']} ({row['ratio']})")
    lines.append("")

    lines.append("## 3. Rule Reasons")
    lines.append("")
    for _, row in rule_reason_df.head(20).iterrows():
        lines.append(f"- {row['rule_reason']}: {row['count']} ({row['ratio']})")
    lines.append("")

    lines.append("## 4. Pattern Combos (Top 20)")
    lines.append("")
    for _, row in combo_df.head(20).iterrows():
        lines.append(f"- {row['pattern_combo']}: {row['count']} ({row['ratio']})")
    lines.append("")

    output_path.write_text("\n".join(lines), encoding="utf-8-sig")


def main() -> None:
    args = parse_args()
    input_path = Path(args.input_path)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(input_path)
    text_col = get_text_column(df)
    analyzed_df = add_pattern_flags(df, text_col=text_col)

    analyzed_df.to_csv(
        output_dir / "analyzed_errors.csv",
        index=False,
        encoding="utf-8-sig",
    )

    summary_df = build_summary(analyzed_df)
    flag_count_df = build_flag_count_table(analyzed_df)
    combo_df = build_pattern_combo_table(analyzed_df)
    rule_reason_df = build_rule_reason_table(analyzed_df)

    summary_df.to_csv(output_dir / "summary.csv", index=False, encoding="utf-8-sig")
    flag_count_df.to_csv(output_dir / "flag_counts.csv", index=False, encoding="utf-8-sig")
    combo_df.to_csv(output_dir / "pattern_combo_counts.csv", index=False, encoding="utf-8-sig")
    rule_reason_df.to_csv(output_dir / "rule_reason_counts.csv", index=False, encoding="utf-8-sig")

    save_representative_samples(
        df=analyzed_df,
        output_dir=output_dir,
        top_k_samples=args.top_k_samples,
    )
    save_pattern_reference(output_dir=output_dir)
    save_markdown_report(
        summary_df=summary_df,
        flag_count_df=flag_count_df,
        combo_df=combo_df,
        rule_reason_df=rule_reason_df,
        output_path=output_dir / "analysis_report.md",
    )

    print(f"[DONE] Analysis saved to: {output_dir}")


if __name__ == "__main__":
    main()
