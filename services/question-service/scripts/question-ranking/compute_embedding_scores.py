"""
SBERT 기반 Answerability 임베딩 점수 계산
- relevance  : 질문 ↔ 세션 주제 + 최근 발화 + 이전 스크립트 구간 유사도
- flow_fit   : 질문 ↔ 이전/현재/다음 스크립트 구간 + 현재 슬라이드 유사도
- expertise  : 질문 ↔ 멘토 프로필 + 전문성 근거 스크립트 유사도

사용법:
  python compute_embedding_scores.py --input '<JSON>'
"""

import sys
import json
import argparse
import numpy as np
from sentence_transformers import SentenceTransformer, util

MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'

_model = None

def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def cos_sim(a, b) -> float:
    """코사인 유사도를 0~1로 정규화"""
    raw = float(util.cos_sim(a, b))
    return (raw + 1) / 2


def normalize_text_list(value) -> list:
    if not value:
        return []
    if isinstance(value, str):
        return [value] if value.strip() else []
    return [str(item) for item in value if str(item).strip()]


def top_average_similarity(model, q_emb, texts: list, top_k: int = 3) -> float:
    normalized = normalize_text_list(texts)
    if not normalized:
        return 0.5

    embeddings = model.encode(normalized)
    similarities = sorted((cos_sim(q_emb, emb) for emb in embeddings), reverse=True)
    top_scores = similarities[:top_k]
    return sum(top_scores) / max(len(top_scores), 1)


def compute_relevance(
    model,
    question: str,
    session_topic: str,
    recent_utterances: list,
    previous_script_sections: list,
) -> float:
    q_emb = model.encode(question)

    scores = []
    if session_topic:
        t_emb = model.encode(session_topic)
        scores.append((0.15, cos_sim(q_emb, t_emb)))

    if recent_utterances:
        recent_text = ' '.join(recent_utterances[-5:])
        r_emb = model.encode(recent_text)
        scores.append((0.55, cos_sim(q_emb, r_emb)))

    if previous_script_sections:
        previous_score = top_average_similarity(model, q_emb, previous_script_sections[-5:])
        scores.append((0.30, previous_score))

    if not scores:
        return 0.5

    total_weight = sum(w for w, _ in scores)
    return float(np.clip(sum(w * s for w, s in scores) / total_weight, 0, 1))


def compute_flow_fit(
    model,
    question: str,
    previous_script_sections: list,
    current_script_section: str,
    current_slide_title: str,
    next_script_section: str,
) -> float:
    q_emb = model.encode(question)

    scores = []
    if previous_script_sections:
        previous_score = top_average_similarity(model, q_emb, previous_script_sections[-3:])
        scores.append((0.18, previous_score))

    if current_script_section:
        section_emb = model.encode(current_script_section)
        scores.append((0.47, cos_sim(q_emb, section_emb)))

    if current_slide_title:
        slide_emb = model.encode(current_slide_title)
        scores.append((0.20, cos_sim(q_emb, slide_emb)))

    if next_script_section:
        next_emb = model.encode(next_script_section)
        scores.append((0.15, cos_sim(q_emb, next_emb)))

    if not scores:
        return 0.5

    total_weight = sum(w for w, _ in scores)
    return float(np.clip(sum(w * s for w, s in scores) / total_weight, 0, 1))


def compute_expertise(
    model,
    question: str,
    mentor_profile: str,
    mentor_expertise_evidence: list,
    previous_script_sections: list,
    mentor_past_scripts: list,
) -> float:
    if not mentor_profile and not mentor_expertise_evidence and not previous_script_sections and not mentor_past_scripts:
        return 0.5

    q_emb = model.encode(question)
    scores = []

    if mentor_profile:
        p_emb = model.encode(mentor_profile)
        scores.append((0.40, cos_sim(q_emb, p_emb)))

    if mentor_expertise_evidence:
        evidence_score = top_average_similarity(model, q_emb, mentor_expertise_evidence, top_k=4)
        scores.append((0.40, evidence_score))

    if previous_script_sections:
        previous_score = top_average_similarity(model, q_emb, previous_script_sections[-5:])
        scores.append((0.15, previous_score))

    if mentor_past_scripts:
        past_script_score = top_average_similarity(model, q_emb, mentor_past_scripts, top_k=4)
        scores.append((0.15, past_script_score))

    total_weight = sum(w for w, _ in scores)
    return float(np.clip(sum(w * s for w, s in scores) / total_weight, 0, 1))


def compute_redundancy_penalty(model, question: str, answered_questions: list, queued_questions: list) -> float:
    q_emb = model.encode(question)
    penalties = []

    if answered_questions:
        answered_embs = model.encode(answered_questions)
        answered_max = max(cos_sim(q_emb, emb) for emb in answered_embs)
        penalties.append(0.8 if answered_max > 0.82 else max(0, (answered_max - 0.68) / 0.32))

    if queued_questions:
        queued_embs = model.encode(queued_questions)
        queued_similar = sum(1 for emb in queued_embs if cos_sim(q_emb, emb) > 0.80)
        if queued_similar:
            penalties.append(min(0.5, queued_similar * 0.12))

    if not penalties:
        return 0

    return float(np.clip(max(penalties), 0, 1))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='JSON 형태의 입력')
    args = parser.parse_args()

    data = json.loads(args.input)
    question              = data.get('question', '')
    session_topic         = data.get('session_topic', '')
    previous_script_sections = normalize_text_list(data.get('previous_script_sections', []))
    current_script_section = data.get('current_script_section', '')
    current_slide_title    = data.get('current_slide_title', '')
    next_script_section    = data.get('next_script_section', '')
    recent_utterances     = normalize_text_list(data.get('recent_mentor_utterances', []))
    mentor_profile        = data.get('mentor_profile', '')
    expertise_evidence    = normalize_text_list(data.get('mentor_expertise_evidence', []))
    past_scripts          = normalize_text_list(data.get('mentor_past_scripts', []))
    answered_questions    = normalize_text_list(data.get('answered_questions', []))
    queued_questions      = normalize_text_list(data.get('queued_questions', []))

    model = get_model()

    result = {
        'relevance':   compute_relevance(
            model,
            question,
            session_topic,
            recent_utterances,
            previous_script_sections,
        ),
        'flow_fit':    compute_flow_fit(
            model,
            question,
            previous_script_sections,
            current_script_section,
            current_slide_title,
            next_script_section,
        ),
        'expertise':   compute_expertise(
            model,
            question,
            mentor_profile,
            expertise_evidence,
            previous_script_sections,
            past_scripts,
        ),
        'redundancy_penalty': compute_redundancy_penalty(
            model,
            question,
            answered_questions,
            queued_questions,
        ),
    }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
