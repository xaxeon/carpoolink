from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict, List, Optional


# =========================================================
# 경로 설정
# =========================================================
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent

EXTRACTED_ROOT = PROJECT_ROOT / "data" / "interim" / "question_detection" / "extracted" / "sns_multiturn"
OUTPUT_DIR = PROJECT_ROOT / "data" / "interim" / "question_detection" / "candidate"

TRAIN_DIR = EXTRACTED_ROOT / "Training"
VALID_DIR = EXTRACTED_ROOT / "Validation"


# =========================================================
# 유틸
# =========================================================
def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def find_json_files(base_dir: Path) -> List[Path]:
    if not base_dir.exists():
        print(f"[WARN] 폴더가 존재하지 않습니다: {base_dir}")
        return []
    return sorted(base_dir.rglob("*.json"))


def safe_get(d: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in d:
            return d[key]
    return default


def to_int_question_label(speech_act: Optional[str]) -> int:
    return 1 if speech_act == "정보 요청" else 0


def normalize_text(text: Any) -> str:
    if text is None:
        return ""
    return str(text).strip()


def normalize_folder_name(name: str) -> str:
    return name.replace(" ", "").strip()


# =========================================================
# 메타 추출
# =========================================================
def extract_top_meta(data: Dict[str, Any]) -> Dict[str, Any]:
    info = data.get("info", {}) if isinstance(data.get("info", {}), dict) else {}

    return {
        "doc_id": safe_get(info, "id", "doc_id", "document_id", default=""),
        "topic": safe_get(info, "topic", default=""),
        "keyword": safe_get(info, "keyword", default=""),
        "category": safe_get(info, "category", default=""),
        "subcategory": safe_get(info, "subcategory", "sub_category", default=""),
    }


# =========================================================
# JSON 1개 -> 발화 여러 행
# =========================================================
def flatten_single_json(data: Dict[str, Any], split_name: str, source_file: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    meta = extract_top_meta(data)
    utterances = data.get("utterances", [])

    if not isinstance(utterances, list):
        print(f"[WARN] utterances가 list가 아닙니다: {source_file}")
        return rows

    for idx, utt in enumerate(utterances):
        if not isinstance(utt, dict):
            continue

        text = normalize_text(safe_get(utt, "text", "utterance", "sentence", default=""))
        speaker = safe_get(utt, "speaker", "participant_id", "role", default="")
        speech_act = safe_get(utt, "speech_act", "dialog_act", "label", default="")
        turn_id = safe_get(utt, "turn_id", default=idx + 1)
        utterance_id = safe_get(utt, "utterance_id", "id", default=f"{meta['doc_id']}_{idx + 1}")

        row = {
            "split": split_name,
            "doc_id": meta["doc_id"],
            "topic": meta["topic"],
            "keyword": meta["keyword"],
            "category": meta["category"],
            "subcategory": meta["subcategory"],
            "speaker": speaker,
            "turn_id": turn_id,
            "utterance_id": utterance_id,
            "text": text,
            "speech_act": speech_act,
            "is_question": to_int_question_label(speech_act),
            "source_file": str(source_file),
        }
        rows.append(row)

    return rows


# =========================================================
# 라벨링 폴더 찾기
# =========================================================
def find_label_dirs(split_dir: Path) -> List[Path]:
    result: List[Path] = []

    for p in split_dir.rglob("*"):
        if not p.is_dir():
            continue

        normalized = normalize_folder_name(p.name)
        if normalized == "라벨링데이터":
            result.append(p)

    return sorted(result)


# =========================================================
# Training / Validation 처리
# =========================================================
def process_labeling_dir(split_name: str, split_dir: Path) -> List[Dict[str, Any]]:
    label_dir_candidates = find_label_dirs(split_dir)

    if not label_dir_candidates:
        print(f"[WARN] 라벨링데이터 폴더를 찾지 못했습니다: {split_dir}")
        return []

    all_rows: List[Dict[str, Any]] = []

    for label_dir in label_dir_candidates:
        json_files = find_json_files(label_dir)
        print(f"[INFO] {split_name} | 라벨링데이터 폴더: {label_dir}")
        print(f"[INFO] 찾은 json 파일 수: {len(json_files)}")

        for json_path in json_files:
            try:
                data = load_json(json_path)
                if not isinstance(data, dict):
                    print(f"[WARN] dict 형태 json이 아닙니다: {json_path}")
                    continue

                rows = flatten_single_json(data, split_name=split_name, source_file=json_path)
                all_rows.extend(rows)

            except Exception as e:
                print(f"[ERROR] 파일 처리 실패: {json_path}")
                print(f"        {e}")

    return all_rows


# =========================================================
# CSV 저장
# =========================================================
CSV_COLUMNS = [
    "split",
    "doc_id",
    "topic",
    "keyword",
    "category",
    "subcategory",
    "speaker",
    "turn_id",
    "utterance_id",
    "text",
    "speech_act",
    "is_question",
    "source_file",
]


def save_csv(rows: List[Dict[str, Any]], out_path: Path) -> None:
    ensure_dir(out_path.parent)

    with out_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"[SAVED] {out_path}")
    print(f"[ROWS] {len(rows)}")


# =========================================================
# 통계
# =========================================================
def print_basic_stats(rows: List[Dict[str, Any]], split_name: str) -> None:
    total = len(rows)
    q_count = sum(r["is_question"] for r in rows)
    non_q_count = total - q_count

    print(f"\n[STATS] {split_name}")
    print(f"총 행 수          : {total}")
    print(f"질문(정보 요청)   : {q_count}")
    print(f"비질문            : {non_q_count}")

    act_count: Dict[str, int] = {}
    for r in rows:
        act = r["speech_act"] or "(빈값)"
        act_count[act] = act_count.get(act, 0) + 1

    print("[speech_act 분포 상위 10개]")
    for act, cnt in sorted(act_count.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  - {act}: {cnt}")


# =========================================================
# 메인
# =========================================================
def main() -> None:
    ensure_dir(OUTPUT_DIR)

    print("[START] AIHub SNS 멀티턴 전처리 시작")
    print(f"[EXTRACTED_ROOT] {EXTRACTED_ROOT}")
    print(f"[OUTPUT_DIR] {OUTPUT_DIR}")

    train_rows = process_labeling_dir("train", TRAIN_DIR)
    valid_rows = process_labeling_dir("validation", VALID_DIR)

    train_out = OUTPUT_DIR / "sns_multiturn_train_flat.csv"
    valid_out = OUTPUT_DIR / "sns_multiturn_valid_flat.csv"

    save_csv(train_rows, train_out)
    save_csv(valid_rows, valid_out)

    print_basic_stats(train_rows, "train")
    print_basic_stats(valid_rows, "validation")

    print("\n[DONE] 전처리 완료")


if __name__ == "__main__":
    main()
