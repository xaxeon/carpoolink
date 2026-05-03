import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(serviceRoot, '..', '..');

const DEFAULT_SCRIPT_PATH = path.join(
    serviceRoot,
    'scripts',
    'run_hybrid_question_pipeline.py',
);

const DEFAULT_TFIDF_ARTIFACT_DIR = path.join(
    repoRoot,
    'services',
    'model',
    'question_detection',
    'tfidf_lr_rule_filter_off',
);

const DEFAULT_KC_ELECTRA_DIR = path.join(
    repoRoot,
    'services',
    'model',
    'question_detection',
    'kc_electra_question_detector',
);

function getPythonExecutable() {
    return process.env.QUESTION_SERVICE_PYTHON || 'python';
}

function getScriptPath() {
    return process.env.QUESTION_DETECTION_SCRIPT_PATH || DEFAULT_SCRIPT_PATH;
}

function getTfidfArtifactDir() {
    return process.env.QUESTION_TFIDF_ARTIFACT_DIR || DEFAULT_TFIDF_ARTIFACT_DIR;
}

function getKcElectraDir() {
    if (process.env.QUESTION_KC_ELECTRA_DIR) {
        return process.env.QUESTION_KC_ELECTRA_DIR;
    }

    return DEFAULT_KC_ELECTRA_DIR;
}

function getExecutionTimeoutMs() {
    const rawValue = process.env.QUESTION_DETECTION_TIMEOUT_MS;
    const parsedValue = Number.parseInt(rawValue ?? '30000', 10);
    return Number.isFinite(parsedValue) ? parsedValue : 30000;
}

function shouldForceKcElectraOnRuleQuestion() {
    return process.env.QUESTION_ALWAYS_USE_KC_ELECTRA_ON_RULE_QUESTION === 'true';
}

export async function predictQuestion(text) {
    const command = getPythonExecutable();
    const args = [
        getScriptPath(),
        '--text',
        text,
        '--tfidf-artifact-dir',
        getTfidfArtifactDir(),
        '--kc-electra-dir',
        getKcElectraDir(),
    ];

    if (shouldForceKcElectraOnRuleQuestion()) {
        args.push('--always-use-kc-electra-on-rule-question');
    }

    const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: repoRoot,
        timeout: getExecutionTimeoutMs(),
        maxBuffer: 1024 * 1024 * 4,
    });

    if (stderr && stderr.trim()) {
        console.warn('[question-service] python stderr:', stderr.trim());
    }

    return JSON.parse(stdout);
}
