import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(serviceRoot, '..', '..');

const DEFAULT_SCRIPT_PATH = path.join(
    serviceRoot,
    'scripts',
    'question-clustering',
    'run_question_clustering_api.py',
);

function getPythonExecutable() {
    return process.env.QUESTION_SERVICE_PYTHON || 'python';
}

function getScriptPath() {
    return process.env.QUESTION_CLUSTERING_SCRIPT_PATH || DEFAULT_SCRIPT_PATH;
}

function getExecutionTimeoutMs() {
    const rawValue = process.env.QUESTION_CLUSTERING_TIMEOUT_MS;
    const parsedValue = Number.parseInt(rawValue ?? '120000', 10);
    return Number.isFinite(parsedValue) ? parsedValue : 120000;
}

function getDefaultThreshold() {
    const parsedValue = Number.parseFloat(process.env.QUESTION_CLUSTERING_THRESHOLD ?? '0.72');
    return Number.isFinite(parsedValue) ? parsedValue : 0.72;
}

function getDefaultSimilarityMode() {
    return process.env.QUESTION_CLUSTERING_SIMILARITY_MODE || 'hybrid';
}

function getDefaultEmbeddingModel() {
    return process.env.QUESTION_CLUSTERING_EMBEDDING_MODEL || 'distiluse';
}

function getModelApiUrl() {
    const rawValue = process.env.QUESTION_MODEL_API_URL;
    return rawValue && rawValue.trim() ? rawValue.trim().replace(/\/+$/, '') : null;
}

function runPythonJson(scriptPayload) {
    return new Promise((resolve, reject) => {
        const child = spawn(getPythonExecutable(), [getScriptPath()], {
            cwd: repoRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timeout = setTimeout(() => {
            settled = true;
            child.kill('SIGTERM');
            reject(new Error(`Question clustering timed out after ${getExecutionTimeoutMs()}ms.`));
        }, getExecutionTimeoutMs());

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });

        child.on('error', (error) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);
            reject(error);
        });

        child.on('close', (code) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);

            if (code !== 0) {
                reject(new Error(stderr.trim() || `Question clustering exited with code ${code}.`));
                return;
            }

            if (stderr.trim()) {
                console.warn('[question-service] clustering python stderr:', stderr.trim());
            }

            try {
                resolve(JSON.parse(stdout));
            } catch (error) {
                reject(new Error(`Invalid clustering JSON response: ${error.message}`));
            }
        });

        child.stdin.end(JSON.stringify(scriptPayload));
    });
}

export async function clusterQuestions({
    questions,
    threshold = getDefaultThreshold(),
    similarityMode = getDefaultSimilarityMode(),
    embeddingModel = getDefaultEmbeddingModel(),
}) {
    const scriptPayload = {
        questions,
        threshold,
        similarity_mode: similarityMode,
        embedding_model: embeddingModel,
    };

    const modelApiUrl = getModelApiUrl();
    if (modelApiUrl) {
        return clusterQuestionsViaModelApi(scriptPayload, modelApiUrl);
    }

    return runPythonJson(scriptPayload);
}

async function clusterQuestionsViaModelApi(scriptPayload, modelApiUrl) {
    const response = await fetch(`${modelApiUrl}/question-clustering/cluster`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(scriptPayload),
        signal: AbortSignal.timeout(getExecutionTimeoutMs()),
    });

    if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(
            `Question clustering model API failed with status ${response.status}: ${responseBody}`,
        );
    }

    return response.json();
}
