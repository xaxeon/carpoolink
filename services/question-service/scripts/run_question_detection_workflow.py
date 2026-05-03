from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run question detection workflow by calling existing scripts in order."
    )
    parser.add_argument(
        "--python-executable",
        type=str,
        default=sys.executable,
        help="Python executable to use",
    )
    parser.add_argument(
        "--project-root",
        type=str,
        default=".",
        help="Project root path",
    )
    parser.add_argument(
        "--skip-preprocess",
        action="store_true",
        help="Skip preprocessing TF-IDF-ready data",
    )
    parser.add_argument(
        "--skip-tfidf-compare",
        action="store_true",
        help="Skip TF-IDF variant comparison",
    )
    parser.add_argument(
        "--skip-kc-electra",
        action="store_true",
        help="Skip KC-ELECTRA training",
    )
    parser.add_argument(
        "--kc-electra-model-name",
        type=str,
        default="beomi/KcELECTRA-base-v2022",
        help="KC-ELECTRA model name",
    )
    parser.add_argument(
        "--kc-electra-max-train-samples",
        type=int,
        default=None,
        help="Optional train sample cap for KC-ELECTRA smoke runs",
    )
    parser.add_argument(
        "--kc-electra-max-valid-samples",
        type=int,
        default=None,
        help="Optional valid sample cap for KC-ELECTRA smoke runs",
    )
    parser.add_argument(
        "--kc-electra-max-test-samples",
        type=int,
        default=None,
        help="Optional test sample cap for KC-ELECTRA smoke runs",
    )
    parser.add_argument(
        "--use-cpu",
        action="store_true",
        help="Force CPU training for KC-ELECTRA",
    )
    return parser.parse_args()


def run_command(command: list[str], cwd: Path) -> None:
    print("\n[RUN]", " ".join(command))
    subprocess.run(command, cwd=str(cwd), check=True)


def main() -> None:
    args = parse_args()
    root = Path(args.project_root).resolve()
    scripts_dir = root / "carpoolink" / "services" / "question-service" / "scripts"

    if not args.skip_preprocess:
        run_command(
            [
                args.python_executable,
                str(scripts_dir / "preprocess_question_detection_for_tfidf.py"),
                "--train-path",
                "carpoolink/data/processed/question_detection/train.csv",
                "--valid-path",
                "carpoolink/data/processed/question_detection/valid.csv",
                "--test-path",
                "carpoolink/data/processed/question_detection/test.csv",
                "--output-dir",
                "carpoolink/data/processed/question_detection/tfidf_ready",
            ],
            cwd=root,
        )

    if not args.skip_tfidf_compare:
        run_command(
            [
                args.python_executable,
                str(scripts_dir / "compare_question_detector_variants.py"),
                "--train-path",
                "carpoolink/data/processed/question_detection/tfidf_ready/train.csv",
                "--valid-path",
                "carpoolink/data/processed/question_detection/tfidf_ready/valid.csv",
                "--test-path",
                "carpoolink/data/processed/question_detection/tfidf_ready/test.csv",
                "--model-root-dir",
                "carpoolink/services/model/question_detection",
                "--report-dir",
                "carpoolink/services/question-service/outputs/question_detection/variant_comparison",
            ],
            cwd=root,
        )

    if not args.skip_kc_electra:
        command = [
            args.python_executable,
            str(scripts_dir / "train_kc_electra_question_detector.py"),
            "--train-path",
            "carpoolink/data/processed/question_detection/train.csv",
            "--valid-path",
            "carpoolink/data/processed/question_detection/valid.csv",
            "--test-path",
            "carpoolink/data/processed/question_detection/test.csv",
            "--model-name",
            args.kc_electra_model_name,
            "--output-dir",
            "carpoolink/services/model/question_detection/kc_electra_question_detector",
        ]

        if args.kc_electra_max_train_samples is not None:
            command += ["--max-train-samples", str(args.kc_electra_max_train_samples)]
        if args.kc_electra_max_valid_samples is not None:
            command += ["--max-valid-samples", str(args.kc_electra_max_valid_samples)]
        if args.kc_electra_max_test_samples is not None:
            command += ["--max-test-samples", str(args.kc_electra_max_test_samples)]
        if args.use_cpu:
            command += ["--use-cpu"]

        run_command(command, cwd=root)

    print("\n[DONE] Question detection workflow completed.")


if __name__ == "__main__":
    main()
