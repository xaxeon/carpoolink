import { clamp } from './utils.js';

const VAGUE_PRONOUNS = [
  '이거', '그거', '저거', '이것', '그것', '저것',
  '그 방법', '이 방법', '이렇게', '그렇게', '저렇게',
];

const CONTEXT_KEYWORDS = [
  '개발자', '디자이너', '기획자', '마케터', '엔지니어', 'PM', 'PO',
  '백엔드', '프론트엔드', '풀스택', '데이터',
  '년차', '연차', '신입', '주니어', '시니어', '인턴', '취준', '이직',
  '현재', '저는', '제가', '했는데', '해봤는데', '있는데', '고민', '준비',
];

export function scoreSufficiency(question, menteeProfile = '') {
  const trimmed = question.trim();
  if (!trimmed) return 0;

  const tokens = trimmed.split(/\s+/);
  const lengthFactor = tokens.length < 5 ? 0.45 : Math.min(1, tokens.length / 18);
  const enrichedContext = `${trimmed} ${menteeProfile}`.trim();
  const questionContextCount = CONTEXT_KEYWORDS.filter(kw => trimmed.includes(kw)).length;
  const enrichedContextCount = CONTEXT_KEYWORDS.filter(kw => enrichedContext.includes(kw)).length;
  const contextCoverage = Math.min(1, (questionContextCount + enrichedContextCount) / 5);
  const profileResolvesContext = questionContextCount < 2 && enrichedContextCount >= 2;
  const contextBonus = profileResolvesContext ? 0.12 : 0;
  const vaguePenalty = VAGUE_PRONOUNS.some(p => trimmed.includes(p)) && !profileResolvesContext ? 0.25 : 0.08;

  return clamp(contextCoverage * lengthFactor + contextBonus - vaguePenalty);
}
