import { computeAnswerability } from './calculator.js';

// CLI?ì„œ ì§ì ‘ ?¤í–‰?????¬ìš©
// ?¬ìš©ë²? node scripts/question-ranking/run_answerability.js '<JSON>'
//
// ?ˆì‹œ:
// node scripts/question-ranking/run_answerability.js '{
//   "question": "3?„ì°¨ ë°±ì—”??ê°œë°œ?ì¸???¬íŠ¸?´ë¦¬???´ë–»ê²??˜ë©´ ? ê¹Œ??",
//   "isPaid": false,
//   "sessionTopic": "ê°œë°œ???´ì§",
//   "recentMentorUtterances": ["?¬íŠ¸?´ë¦¬?¤ëŠ” ?„ë¡œ?íŠ¸ ?„ì£¼ë¡?],
//   "mentorProfile": "5?„ì°¨ ë°±ì—”???”ì??ˆì–´",
//   "mentorPastScripts": []
// }'

const raw = process.argv[2];

if (!raw) {
  console.error('?…ë ¥ JSON??ì²?ë²ˆì§¸ ?¸ìë¡??„ë‹¬?´ì£¼?¸ìš”.');
  process.exit(1);
}

const input = JSON.parse(raw);
const result = await computeAnswerability(input);
console.log(JSON.stringify(result, null, 2));
