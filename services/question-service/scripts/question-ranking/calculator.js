import { scoreClarity } from './clarity.js';
import { scoreSufficiency } from './sufficiency.js';
import { fetchAiScores } from './aiClient.js';
import { clamp } from './utils.js';

const WEIGHTS = {
  clarity:     0.18,
  sufficiency: 0.22,
  relevance:   0.25,
  flowFit:     0.20,
  expertise:   0.15,
  redundancyPenalty: 0.12,
};

function classifyPriorityGroup(score, qualityScore) {
  if (qualityScore < 0.35) return 'needs_context';
  if (score >= 0.75) return 'answer_now';
  if (score >= 0.62) return 'answer_soon';
  if (score >= 0.45) return 'collect_or_merge';
  return 'hold';
}

export async function computeAnswerability(input) {
  const {
    question,
    isPaid = false,
    sessionTopic = '',
    previousScriptSections = [],
    currentScriptSection = '',
    currentSlideTitle = '',
    nextScriptSection = '',
    recentMentorUtterances = [],
    menteeProfile = '',
    mentorProfile = '',
    mentorExpertiseEvidence = [],
    mentorPastScripts = [],
    answeredQuestions = [],
    queuedQuestions = [],
  } = input;

  const clarity     = scoreClarity(question);
  const sufficiency = scoreSufficiency(question, menteeProfile);

  const {
    relevance,
    flowFit,
    expertise,
    redundancyPenalty,
    rankingMode,
    warnings,
  } = await fetchAiScores({
    question,
    session_topic:             sessionTopic,
    previous_script_sections:  previousScriptSections,
    current_script_section:    currentScriptSection,
    current_slide_title:       currentSlideTitle,
    next_script_section:       nextScriptSection,
    recent_mentor_utterances:  recentMentorUtterances,
    mentor_profile:            mentorProfile,
    mentor_expertise_evidence: mentorExpertiseEvidence,
    mentor_past_scripts:       mentorPastScripts,
    answered_questions:        answeredQuestions,
    queued_questions:          queuedQuestions,
  });

  let answerabilityScore =
    WEIGHTS.clarity     * clarity     +
    WEIGHTS.sufficiency * sufficiency +
    WEIGHTS.relevance   * relevance   +
    WEIGHTS.flowFit     * flowFit     +
    WEIGHTS.expertise   * expertise   -
    WEIGHTS.redundancyPenalty * redundancyPenalty;

  const qualityScore = (clarity + sufficiency) / 2;

  // 질문 자체가 부족하면 라이브 중 바로 답하기 어렵다.
  if (qualityScore < 0.4) {
    answerabilityScore *= 0.5;
  }

  const normalizedAnswerabilityScore = clamp(answerabilityScore);
  const priorityScore = (isPaid ? 1 : 0) + normalizedAnswerabilityScore;

  return {
    priorityScore,
    answerabilityScore: normalizedAnswerabilityScore,
    priorityTier: isPaid ? 'paid' : 'free',
    priorityGroup: classifyPriorityGroup(normalizedAnswerabilityScore, qualityScore),
    rankingMode,
    warnings,
    scores: { clarity, sufficiency, relevance, flowFit, expertise, redundancyPenalty },
    weights: WEIGHTS,
  };
}

