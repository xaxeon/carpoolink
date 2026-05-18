import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clamp } from './utils.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, '..', '..');

const DEFAULT_SCRIPT_PATH = path.join(
    serviceRoot,
    'scripts',
    'question-ranking',
    'compute_embedding_scores.py',
);

const FALLBACK = {
    relevance: 0.5,
    flowFit: 0.5,
    expertise: 0.5,
    redundancyPenalty: 0,
    rankingMode: 'fallback',
    warnings: ['AI embedding scores unavailable; fallback scores applied.'],
};
const TIMEOUT_MS = 60_000;  // 모델 로딩 포함

function getPythonExecutable() {
    return process.env.QUESTION_SERVICE_PYTHON || 'python';
}

export async function fetchAiScores(request) {
    try {
        const { stdout, stderr } = await execFileAsync(
            getPythonExecutable(),
            [DEFAULT_SCRIPT_PATH, '--input', JSON.stringify(request)],
            { cwd: serviceRoot, timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
        );

        if (stderr && stderr.trim()) {
            console.warn('[answerability] python stderr:', stderr.trim());
        }

        const data = JSON.parse(stdout);
        return {
            relevance:   clamp(data.relevance),
            flowFit:     clamp(data.flow_fit),
            expertise:   clamp(data.expertise),
            redundancyPenalty: clamp(data.redundancy_penalty ?? 0),
            rankingMode: 'hybrid',
            warnings: [],
        };
    } catch (err) {
        console.warn('[answerability] Python 추론 실패, fallback 적용:', err.message);
        return FALLBACK;
    }
}
