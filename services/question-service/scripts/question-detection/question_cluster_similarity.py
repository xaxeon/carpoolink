from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Iterable

from preprocess_question_detection_for_tfidf import normalize_for_tfidf
from question_detection_rules import extract_rule_features, safe_text


DEFAULT_STOPWORDS = {
    "이",
    "그",
    "저",
    "것",
    "거",
    "좀",
    "수",
    "때",
    "걸",
    "를",
    "을",
    "은",
    "는",
    "이요",
    "요",
    "좀요",
    "혹시",
    "약간",
    "그냥",
    "진짜",
    "정말",
}

QUESTION_ENDING_NORMALIZATION_RULES = (
    (r"(인가요|인가요\?|인가요??)$", "인가요"),
    (r"(일까요|일까요\?|일까여)$", "일까요"),
    (r"(되나요|되나요\?)$", "되나요"),
    (r"(할까요|할까요\?)$", "할까요"),
    (r"(해야 할까요|해야할까요|해야 할까)$", "해야할까요"),
    (r"(궁금합니다|궁금한데요|궁금해요)$", "궁금합니다"),
)

TOKEN_PATTERN = re.compile(r"[0-9a-zA-Z가-힣]+")


@dataclass(frozen=True)
class SimilaritySignals:
    original_text: str
    candidate_text: str
    original_canonical: str
    candidate_canonical: str
    exact_match: bool
    canonical_match: bool
    contains_other: bool
    sequence_ratio: float
    token_jaccard: float
    token_overlap_ratio: float
    shared_token_count: int
    score: float


def canonicalize_question_text(text: str) -> str:
    canonical = normalize_for_tfidf(safe_text(text))
    canonical = canonical.replace("[url]", " ").replace("[email]", " ")
    canonical = re.sub(r"[!?.,]+", " ", canonical)
    canonical = re.sub(r"\s+", " ", canonical).strip()

    for pattern, replacement in QUESTION_ENDING_NORMALIZATION_RULES:
        canonical = re.sub(pattern, replacement, canonical)

    return canonical


def extract_keyword_tokens(text: str) -> list[str]:
    canonical = canonicalize_question_text(text)
    tokens = TOKEN_PATTERN.findall(canonical)
    return [token for token in tokens if token not in DEFAULT_STOPWORDS and len(token) > 1]


def _jaccard_similarity(left: set[str], right: set[str]) -> float:
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def _overlap_ratio(left: Iterable[str], right: Iterable[str]) -> tuple[float, int]:
    left_list = list(left)
    right_list = list(right)
    if not left_list or not right_list:
        return 0.0, 0

    left_set = set(left_list)
    right_set = set(right_list)
    shared_count = len(left_set & right_set)
    denominator = min(len(left_set), len(right_set))
    return shared_count / denominator if denominator else 0.0, shared_count


def compute_similarity_signals(text: str, candidate_text: str) -> SimilaritySignals:
    source = safe_text(text)
    candidate = safe_text(candidate_text)
    source_canonical = canonicalize_question_text(source)
    candidate_canonical = canonicalize_question_text(candidate)

    source_tokens = extract_keyword_tokens(source)
    candidate_tokens = extract_keyword_tokens(candidate)
    source_token_set = set(source_tokens)
    candidate_token_set = set(candidate_tokens)

    exact_match = source == candidate and bool(source)
    canonical_match = source_canonical == candidate_canonical and bool(source_canonical)
    contains_other = bool(source_canonical) and bool(candidate_canonical) and (
        source_canonical in candidate_canonical or candidate_canonical in source_canonical
    )
    sequence_ratio = SequenceMatcher(None, source_canonical, candidate_canonical).ratio()
    token_jaccard = _jaccard_similarity(source_token_set, candidate_token_set)
    token_overlap_ratio, shared_token_count = _overlap_ratio(source_tokens, candidate_tokens)

    score = 0.0
    if exact_match:
        score += 1.0
    if canonical_match:
        score += 0.95
    elif contains_other:
        score += 0.2

    score += sequence_ratio * 0.35
    score += token_jaccard * 0.30
    score += token_overlap_ratio * 0.15

    if shared_token_count >= 3:
        score += 0.05

    score = min(score, 1.0)

    return SimilaritySignals(
        original_text=source,
        candidate_text=candidate,
        original_canonical=source_canonical,
        candidate_canonical=candidate_canonical,
        exact_match=exact_match,
        canonical_match=canonical_match,
        contains_other=contains_other,
        sequence_ratio=round(sequence_ratio, 4),
        token_jaccard=round(token_jaccard, 4),
        token_overlap_ratio=round(token_overlap_ratio, 4),
        shared_token_count=shared_token_count,
        score=round(score, 4),
    )


def is_cluster_match(signals: SimilaritySignals, threshold: float = 0.72) -> bool:
    if signals.exact_match or signals.canonical_match:
        return True

    if (
        signals.sequence_ratio >= 0.88
        and signals.token_overlap_ratio >= 0.6
        and signals.shared_token_count >= 2
    ):
        return True

    return signals.score >= threshold


def score_representative_question(text: str) -> float:
    normalized_text = safe_text(text)
    features = extract_rule_features(normalized_text)
    keyword_tokens = extract_keyword_tokens(normalized_text)

    score = 0.0
    score += min(features["char_len"], 60) / 60 * 0.25
    score += min(len(keyword_tokens), 8) / 8 * 0.25
    score += 0.2 if features["has_question_mark"] else 0.0
    score += 0.15 if features["has_question_ending"] else 0.0
    score += 0.10 if features["has_question_word"] else 0.0
    score += 0.05 if features["has_formal_request"] else 0.0
    score -= 0.10 if features["is_short_text"] else 0.0
    score -= 0.10 if features["has_reaction_like"] else 0.0

    return round(score, 4)

