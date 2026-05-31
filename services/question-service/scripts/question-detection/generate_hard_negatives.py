"""
OpenAI API를 사용해 멘토링 채팅 hard negative(비질문) 데이터를 생성합니다.

생성 카테고리 (총 8종):
  1. 반응/감탄         : "아하 이해됐어요", "오 신기하네요"
  2. 이해/확인 표현    : "방금 이해한 것 같아요", "아 그런 거군요"
  3. 상황 서술         : "화면이 안 보여요", "소리가 잘 안 들려요"
  4. 자기 상태 서술    : "이 부분이 어렵네요", "잘 모르겠어요"
  5. 동의/공감         : "맞는 것 같아요", "저도 그렇게 생각해요"
  6. 감사/응원         : "감사합니다", "열심히 들을게요"
  7. 짧은 반응         : "네", "ㅎㅎ", "오케이", "ㅇㅇ"
  8. 서술형 질문어 포함 : "이게 뭔지 이제 알겠어요", "어떻게 하는지 찾아봐야겠어요"
     (질문어가 있지만 의문문이 아닌 케이스 — 가장 중요한 hard negative)

출력:
  data/processed/question_detection/augmentation/mentoring_hard_negatives.csv
  컬럼: text, label(=0), category
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import pandas as pd
from openai import OpenAI


OUTPUT_DIR = (
    Path(__file__).resolve().parent.parent.parent.parent.parent
    / "data" / "processed" / "question_detection" / "augmentation"
)

# 카테고리별 생성 목표 수량 (합계 약 500건)
CATEGORY_TARGETS = {
    "반응_감탄":          60,
    "이해_확인":          70,
    "상황_서술":          60,
    "자기_상태_서술":      70,
    "동의_공감":          50,
    "감사_응원":          40,
    "짧은_반응":          50,
    "서술형_질문어_포함":  100,  # 가장 중요, 많이 생성
}

# 카테고리별 프롬프트 정의
CATEGORY_PROMPTS: dict[str, dict] = {
    "반응_감탄": {
        "description": "무언가를 듣거나 보고 나서 즉각적으로 나오는 감탄·놀람·흥미 표현",
        "examples": [
            "아하 이해됐어요!", "오 신기하네요", "헐 진짜요", "와 대박이다",
            "오호 그렇군요", "아 그런 거구나", "헉 몰랐어요", "오케 이해했어요",
            "와 너무 신기하네요", "아 맞다", "ㅎㅎ 재밌네요", "오 좋은데요",
        ],
        "avoid": "질문 형태(~나요?, ~인가요?, ~는지?)가 되면 안 됩니다. 순수한 감탄/반응 표현만.",
    },
    "이해_확인": {
        "description": "강의 내용을 이해했음을 표현하거나, 방금 이해가 된 순간을 표현하는 발화",
        "examples": [
            "방금 이해됐어요", "아 이제 알겠어요", "그게 그런 의미였군요",
            "이해했습니다", "아 그렇게 하면 되는 거군요", "이제 이해가 가네요",
            "아 맞다 그거였구나", "오 이제 연결이 되네요", "그래서 그랬던 거군요",
            "아하 그래서 그렇게 하는 거였군요", "이제 말씀하시는 게 이해가 가요",
        ],
        "avoid": "이해를 '요청'하는 표현(설명해 주세요, 다시 말해줘)은 제외. 이해 '완료'를 표현하는 것만.",
    },
    "상황_서술": {
        "description": "현재 발생한 기술적 상황이나 자신의 상태를 서술하는 발화. 해결을 요청하지 않음.",
        "examples": [
            "화면이 안 보여요", "소리가 잘 안 들려요", "인터넷이 잠깐 끊겼어요",
            "화면이 멈췄어요", "로딩이 느리네요", "슬라이드가 안 넘어가네요",
            "방금 잠깐 끊겼어요", "화면 공유가 안 되네요", "버퍼링이 심하네요",
            "영상이 끊기네요", "마이크가 안 되나봐요", "연결이 불안정하네요",
        ],
        "avoid": "~해주세요, ~해줄 수 있나요 같은 요청문은 제외. 상황을 서술만 하는 것.",
    },
    "자기_상태_서술": {
        "description": "수강생이 자신의 이해도·감정·어려움을 서술하는 발화. 해결 요청 없음.",
        "examples": [
            "이 부분이 좀 어렵네요", "잘 모르겠어요", "아직 헷갈려요",
            "이해하려고 노력 중이에요", "열심히 따라가고 있어요",
            "이 개념이 아직 낯설어요", "복잡하게 느껴지네요",
            "조금 더 생각해봐야 할 것 같아요", "메모하면서 듣고 있어요",
            "처음 들어보는 내용이라 집중해서 듣고 있어요",
            "이 부분은 다시 찾아봐야겠어요",
        ],
        "avoid": "질문 형태나 해결 요청은 제외. '~모르겠어요'(서술)는 OK, '~알려주세요'(요청)는 NG.",
    },
    "동의_공감": {
        "description": "강사나 다른 수강생의 말에 동의하거나 공감을 표현하는 발화",
        "examples": [
            "맞는 것 같아요", "저도 그렇게 생각해요", "그게 더 나을 것 같아요",
            "동의해요", "그렇죠", "저도요", "공감돼요",
            "저도 그 부분이 그랬어요", "맞아요 저도 그렇게 느꼈어요",
            "역시 그게 맞는 것 같네요", "저도 비슷한 경험이 있어요",
        ],
        "avoid": "동의를 구하는 질문(~맞죠?, ~그렇죠?)는 제외. 동의 '표명'만.",
    },
    "감사_응원": {
        "description": "강사에게 감사 인사를 전하거나, 강의에 긍정적 반응을 보이는 발화",
        "examples": [
            "감사합니다", "정말 도움이 됐어요", "좋은 강의 감사해요",
            "열심히 듣겠습니다", "잘 배우고 있어요", "이해하기 쉽게 설명해 주시네요",
            "오늘도 좋은 강의 감사합니다", "이렇게 자세히 설명해 주셔서 감사해요",
            "많이 배우고 가요", "도움이 많이 됐어요", "다음에도 기대돼요",
        ],
        "avoid": "질문 형태는 제외.",
    },
    "짧은_반응": {
        "description": "실시간 채팅에서 자주 나오는 1~6글자 이내의 짧은 반응 발화",
        "examples": [
            "네", "ㅎㅎ", "ㅋㅋ", "오", "아", "오케이", "알겠어요",
            "넵", "웅", "ㅇㅇ", "감사해요", "ㅎㅎㅎ", "맞아요",
            "진짜요", "대박", "오케", "넹",
        ],
        "avoid": "6글자 초과 제외. ? 포함 제외.",
    },
    "서술형_질문어_포함": {
        "description": (
            "가장 중요한 카테고리. '왜', '어떻게', '뭔지', '언제' 같은 질문어가 포함되어 있지만 "
            "의문문이 아니라 서술문인 발화. 이런 표현이 질문으로 오탐될 수 있어서 "
            "모델이 반드시 구분할 수 있어야 합니다."
        ),
        "examples": [
            "이게 뭔지 이제 알겠어요",
            "어떻게 하는지 찾아봐야겠어요",
            "왜 그런지 이유를 알게 됐어요",
            "언제 쓰는 건지 이제 이해됐어요",
            "어디에 쓰는 건지 감이 오네요",
            "왜 이렇게 되는지 이제 납득이 가요",
            "어떻게 작동하는지 대충 알 것 같아요",
            "뭘 해야 하는지 이제 알겠어요",
            "누가 만든 건지 방금 찾아봤어요",
            "얼마나 걸리는지 생각해보고 있었어요",
            "이게 왜 필요한지 이제 이해가 돼요",
            "어떤 경우에 쓰는지 감이 잡혔어요",
        ],
        "avoid": (
            "의문문이 되면 안 됩니다. '이게 뭔가요?'(의문문) → NG. "
            "'이게 뭔지 알겠어요'(서술문) → OK. "
            "문장 끝이 서술어(-어요, -네요, -겠어요, -같아요 등)로 끝나야 합니다."
        ),
    },
}


SYSTEM_PROMPT = """당신은 한국어 NLP 훈련 데이터 생성 전문가입니다.
멘토링 플랫폼의 실시간 라이브 강의 채팅창에서 수강생이 보내는 실제 발화를 생성합니다.

[중요 규칙]
1. 생성하는 모든 발화는 반드시 '비질문'이어야 합니다 — 의문문, 간접 의문문, 요청문 모두 제외
2. 각 발화는 한 줄에 하나씩, 번호나 기호 없이 텍스트만 출력하세요
3. 다양한 길이와 표현 방식을 사용하세요 (너무 획일적이면 안 됩니다)
4. 실제 채팅에서 쓸 법한 자연스러운 한국어로 작성하세요
5. 중복되는 표현은 최대한 피하세요
6. ? 를 절대 사용하지 마세요"""


def build_user_prompt(category: str, config: dict, target_count: int) -> str:
    return f"""카테고리: {category}
설명: {config['description']}

예시 (참고용, 그대로 복사하지 말고 다양하게 변형하세요):
{chr(10).join(f'- {e}' for e in config['examples'])}

주의사항: {config['avoid']}

위 조건에 맞는 발화를 {target_count}개 생성하세요.
한 줄에 하나씩, 번호 없이, 텍스트만 출력하세요."""


def call_openai(client: OpenAI, category: str, config: dict, target_count: int, model: str) -> list[str]:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(category, config, target_count)},
        ],
        temperature=1.0,
        max_tokens=target_count * 40,
    )
    raw = response.choices[0].message.content or ""
    lines = [line.strip() for line in raw.splitlines()]
    # 번호/기호 제거, 빈 줄 제거, ? 포함된 줄 제거
    results = []
    for line in lines:
        line = line.lstrip("0123456789.-) ").strip()
        if not line:
            continue
        if "?" in line:
            continue
        results.append(line)
    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="멘토링 채팅 Hard Negative 생성")
    parser.add_argument("--output-dir", type=str, default=str(OUTPUT_DIR))
    parser.add_argument("--model", type=str, default="gpt-4o-mini", help="OpenAI 모델")
    parser.add_argument("--env-file", type=str, default=None, help=".env 파일 경로 (미지정 시 환경변수 사용)")
    parser.add_argument("--dry-run", action="store_true", help="API 호출 없이 프롬프트만 출력")
    return parser.parse_args()


def load_api_key(env_file: str | None) -> str:
    if env_file:
        for line in Path(env_file).read_text(encoding="utf-8").splitlines():
            if line.startswith("OPENAI_API_KEY="):
                return line.split("=", 1)[1].strip()
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise ValueError("OPENAI_API_KEY가 설정되어 있지 않습니다. --env-file 옵션을 사용하세요.")
    return api_key


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.dry_run:
        print("=== DRY RUN: 프롬프트 미리보기 ===\n")
        for category, config in CATEGORY_PROMPTS.items():
            target = CATEGORY_TARGETS[category]
            print(f"[{category}] 목표: {target}건")
            print(build_user_prompt(category, config, target))
            print("-" * 60)
        return

    api_key = load_api_key(args.env_file)
    client = OpenAI(api_key=api_key)

    all_rows: list[dict] = []
    total_target = sum(CATEGORY_TARGETS.values())
    print(f"총 {total_target}건 생성 시작 (모델: {args.model})\n")

    for i, (category, config) in enumerate(CATEGORY_PROMPTS.items(), 1):
        target = CATEGORY_TARGETS[category]
        print(f"[{i}/{len(CATEGORY_PROMPTS)}] {category} ({target}건 목표)...", end=" ", flush=True)

        try:
            texts = call_openai(client, category, config, target, args.model)
            print(f"{len(texts)}건 생성됨")
            for text in texts:
                all_rows.append({"text": text, "label": 0, "category": category})
        except Exception as e:
            print(f"실패: {e}")

        if i < len(CATEGORY_PROMPTS):
            time.sleep(1)

    df = pd.DataFrame(all_rows)
    df = df.drop_duplicates(subset=["text"]).reset_index(drop=True)

    output_path = output_dir / "mentoring_hard_negatives.csv"
    df.to_csv(output_path, index=False, encoding="utf-8-sig")

    print(f"\n=== 생성 완료 ===")
    print(f"총 {len(df):,}건 저장: {output_path}")
    print("\n카테고리별 생성 수:")
    print(df["category"].value_counts().to_string())
    print("\n샘플 (카테고리별 2개):")
    for cat in df["category"].unique():
        samples = df[df["category"] == cat]["text"].head(2).tolist()
        print(f"\n  [{cat}]")
        for s in samples:
            print(f"    {s}")


if __name__ == "__main__":
    main()
