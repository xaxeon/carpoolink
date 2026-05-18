import { clamp } from './utils.js';

const VAGUE_WORDS = [
  '좀', '약간', '뭔가', '그냥', '막', '대충',
  '어느정도', '어느 정도', '아무거나', '아무렇게나', '뭐든', '뭐든지',
];

const QUESTION_MARKERS = [
  '뭐', '왜', '어디', '언제', '누구', '얼마', '몇',
  '어떻게', '어떤', '무슨', '어느', '누가', '무엇',
];

export function scoreClarity(question) {
  const trimmed = question.trim();
  if (!trimmed) return 0;

  const tokens = trimmed.split(/\s+/);
  const vagueCount = tokens.filter(t => VAGUE_WORDS.some(vw => t.includes(vw))).length;
  const vagueWordRatio = vagueCount / tokens.length;

  const hasNumber = /\d+/.test(trimmed);
  const hasQuestionMarker = QUESTION_MARKERS.some(m => trimmed.includes(m));
  const hasQuestionEnding = /(나요|까요|인가요|한가요|되나요|싶어요|궁금합니다|알려\s*주세요|설명해\s*주세요)[?.!]*$/.test(trimmed);
  const sentenceCount = trimmed.split(/[?!.]+/).filter(Boolean).length;
  const clauseCount = (trimmed.match(/(그리고|또|혹은|아니면|이랑|랑|하고|및)/g) ?? []).length;
  const tooLongPenalty = tokens.length > 35 ? 0.15 : 0;
  const multiQuestionPenalty = sentenceCount > 2 || clauseCount > 3 ? 0.15 : 0;
  const specificityBonus = (hasNumber ? 0.08 : 0) + (hasQuestionMarker ? 0.08 : 0) + (hasQuestionEnding ? 0.08 : 0);

  return clamp(0.75 - vagueWordRatio + specificityBonus - tooLongPenalty - multiQuestionPenalty);
}
