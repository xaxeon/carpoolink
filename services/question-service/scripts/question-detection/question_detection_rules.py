from __future__ import annotations

import re
from typing import Any


QUESTION_WORD_PATTERNS = [
    r"뭐",
    r"뭔데",
    r"뭐야",
    r"무슨",
    r"무엇",
    r"어떤",
    r"어디",
    r"언제",
    r"왜",
    r"어떻게",
    r"얼마",
    r"몇\s*부",
    r"몇\s*개",
    r"몇\s*명",
    r"누구",
    r"누가",
    r"누굴",
    r"어느",
    r"어때",
    r"어땠",
    r"가능할까",
    r"할\s*수\s*있을까",
    r"알\s*수\s*있을까",
]

QUESTION_ENDING_PATTERNS = [
    r"인가요\?$",
    r"인가\?$",
    r"인건가요\?$",
    r"거야\?$",
    r"거예요\?$",
    r"거야$",
    r"거예요$",
    r"건가\?$",
    r"건데\?$",
    r"는데\?$",
    r"을까\?$",
    r"ㄹ까\?$",
    r"있어\?$",
    r"없나\?$",
    r"맞나\?$",
    r"같아\?$",
    r"돼요\?$",
    r"되나요\?$",
    r"보여\?$",
    r"줘요\?$",
    r"있어요\?$",
    r"했어\?$",
    r"되는거예요\?$",
    r"일\s*수\s*있나요\?$",
    r"있나요\?$",
    r"있을까요\?$",
    r"될까요\?$",
    r"가능할까요\?$",
    r"맞을까요\?$",
    r"괜찮을까요\?$",
    r"좋을까요\?$",
    r"어떨까요\?$",
    r"보시나요\?$",
    r"생각하시나요\?$",
    r"도움이\s*될까요\?$",
    r"알\s*수\s*있을까요\?$",
]

FORMAL_REQUEST_PATTERNS = [
    r"알려줄\s*수\s*있어\??",
    r"알려줘",
    r"설명\s*좀",
    r"추천\s*좀",
    r"말해\s*줘",
    r"가르쳐\s*줘",
    r"보여줄\s*수\s*있어\??",
    r"정리\s*좀",
    r"설명해\s*주실\s*수\s*있나요\??",
    r"말씀해\s*주실\s*수\s*있나요\??",
    r"알려주실\s*수\s*있나요\??",
    r"도와주실\s*수\s*있나요\??",
    r"확인해\s*주실\s*수\s*있나요\??",
    r"검토해\s*주실\s*수\s*있나요\??",
    r"봐주실\s*수\s*있나요\??",
    r"피드백\s*주실\s*수\s*있나요\??",
    r"첨삭해\s*주실\s*수\s*있나요\??",
    r"조언해\s*주실\s*수\s*있나요\??",
    r"추천해\s*주실\s*수\s*있나요\??",
    r"말씀\s*부탁드립니다",
    r"조언\s*부탁드립니다",
    r"피드백\s*부탁드립니다",
    r"검토\s*부탁드립니다",
    r"확인\s*부탁드립니다",
]

CHAT_STYLE_PATTERNS = [
    r"머임",
    r"뭔가",
    r"실화냐",
    r"있냐\??",
    r"되냐\??",
    r"뭐임",
    r"몇\s*부작인",
    r"누군데",
    r"어디임",
    r"뭔데",
]

REACTION_PATTERNS = [
    r"아하+",
    r"오호+",
    r"헐+",
    r"앗+",
    r"음",
    r"대박",
    r"오케",
    r"아+",
    r"오+",
    r"하하",
    r"좋아",
    r"응",
    r"맞아",
    r"그렇구나",
    r"글쿤",
    r"글쿠나",
    r"신기하다",
    r"좋겠네",
    r"대단하네",
    r"웃기네",
]

NON_QUESTION_START_PATTERNS = [
    r"^뭐야[,.! ]",
    r"^아니[,.! ]",
    r"^대박[,.! ]",
    r"^오[,.! ]",
    r"^오케[,.! ]",
    r"^아[~.! ]",
    r"^오[~.! ]",
    r"^하하[,.! ]",
    r"^그렇구나",
    r"^글쿤",
    r"^글쿠나",
    r"^처음\s*봤어",
    r"^처음\s*들어봐",
    r"^신기하다",
    r"^대단하네",
    r"^좋겠네",
    r"^웃기네",
]

NON_QUESTION_END_PATTERNS = [
    r"좋겠네[.!]?$",
    r"신기하다[.!]?$",
    r"대단하네[.!]?$",
    r"웃기네[.!]?$",
    r"처음\s*들어봐[.!]?$",
    r"처음\s*봤어[.!]?$",
]

SPECIAL_ONLY_PATTERN = r"^[\W_]+$"


def safe_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() == "nan":
        return ""
    return text


def contains_any_pattern(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def extract_rule_features(text: str) -> dict[str, Any]:
    text = safe_text(text)
    has_question_mark = "?" in text
    has_question_word = contains_any_pattern(text, QUESTION_WORD_PATTERNS)
    has_question_ending = contains_any_pattern(text, QUESTION_ENDING_PATTERNS)
    has_formal_request = contains_any_pattern(text, FORMAL_REQUEST_PATTERNS)
    has_chat_style_question = contains_any_pattern(text, CHAT_STYLE_PATTERNS)
    has_reaction_like = contains_any_pattern(text, REACTION_PATTERNS)
    has_non_question_start = contains_any_pattern(text, NON_QUESTION_START_PATTERNS)
    has_non_question_ending = contains_any_pattern(text, NON_QUESTION_END_PATTERNS)
    char_len = len(text)

    question_signal_count = sum(
        [
            has_question_mark,
            has_question_word,
            has_question_ending,
            has_formal_request,
            has_chat_style_question,
        ]
    )

    return {
        "text": text,
        "char_len": char_len,
        "token_len_by_space": len(text.split()) if text else 0,
        "has_question_mark": has_question_mark,
        "has_question_word": has_question_word,
        "has_question_ending": has_question_ending,
        "has_formal_request": has_formal_request,
        "has_chat_style_question": has_chat_style_question,
        "has_reaction_like": has_reaction_like,
        "has_non_question_start": has_non_question_start,
        "has_non_question_ending": has_non_question_ending,
        "is_short_text": char_len <= 6,
        "is_very_short_text": char_len <= 3,
        "is_special_only": bool(re.fullmatch(SPECIAL_ONLY_PATTERN, text)) if text else False,
        "question_signal_count": question_signal_count,
    }


def classify_question_by_rules(text: str) -> tuple[int | None, str]:
    features = extract_rule_features(text)

    if not features["text"]:
        return 0, "rule_empty_text"

    if (
        features["has_formal_request"]
        or (
            features["has_question_mark"]
            and (
                features["has_question_word"]
                or features["has_question_ending"]
                or features["has_chat_style_question"]
            )
        )
        or (features["has_question_mark"] and features["question_signal_count"] >= 2)
    ):
        return 1, "rule_strong_question"

    if (
        not features["has_question_mark"]
        and features["has_non_question_start"]
        and features["question_signal_count"] <= 1
    ):
        return 0, "rule_reaction_statement"

    if (
        not features["has_question_mark"]
        and features["has_non_question_ending"]
        and features["question_signal_count"] == 0
    ):
        return 0, "rule_statement_ending"

    if (
        features["is_very_short_text"]
        and features["has_reaction_like"]
        and not features["has_question_mark"]
    ):
        return 0, "rule_short_reaction"

    return None, "model"


def build_pattern_combo_label(features: dict[str, Any]) -> str:
    tags = []

    if features["has_question_mark"]:
        tags.append("qmark")
    if features["has_question_word"]:
        tags.append("qword")
    if features["has_question_ending"]:
        tags.append("qending")
    if features["has_formal_request"]:
        tags.append("request")
    if features["has_chat_style_question"]:
        tags.append("chatq")
    if features["has_reaction_like"]:
        tags.append("reaction")
    if features["has_non_question_start"]:
        tags.append("nonqstart")
    if features["has_non_question_ending"]:
        tags.append("nonqend")
    if features["is_short_text"]:
        tags.append("short")
    if features["is_special_only"]:
        tags.append("special")

    if not tags:
        return "no_signal"

    return "+".join(tags)


def export_rule_config() -> dict[str, Any]:
    return {
        "question_word_patterns": QUESTION_WORD_PATTERNS,
        "question_ending_patterns": QUESTION_ENDING_PATTERNS,
        "formal_request_patterns": FORMAL_REQUEST_PATTERNS,
        "chat_style_patterns": CHAT_STYLE_PATTERNS,
        "reaction_patterns": REACTION_PATTERNS,
        "non_question_start_patterns": NON_QUESTION_START_PATTERNS,
        "non_question_end_patterns": NON_QUESTION_END_PATTERNS,
        "special_only_pattern": SPECIAL_ONLY_PATTERN,
    }
