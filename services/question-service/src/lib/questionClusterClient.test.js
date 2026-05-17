import assert from 'node:assert/strict';
import test from 'node:test';
import { clusterQuestions } from './questionClusterClient.js';

const originalFetch = globalThis.fetch;
const originalQuestionModelApiUrl = process.env.QUESTION_MODEL_API_URL;

test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalQuestionModelApiUrl === undefined) {
        delete process.env.QUESTION_MODEL_API_URL;
    } else {
        process.env.QUESTION_MODEL_API_URL = originalQuestionModelApiUrl;
    }
});

test('clusters questions through the configured model API', async () => {
    const requests = [];
    process.env.QUESTION_MODEL_API_URL = 'http://localhost:8000/';
    globalThis.fetch = async (url, options) => {
        requests.push({ url, options });
        return Response.json({
            question_count: 2,
            cluster_count: 1,
            clusters: [],
            assignments: [],
        });
    };

    const result = await clusterQuestions({
        questions: [{ id: 'q1', text: '다시 설명해주실 수 있나요?' }],
        threshold: 0.7,
        similarityMode: 'rule',
        embeddingModel: 'distiluse',
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://localhost:8000/question-clustering/cluster');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
        questions: [{ id: 'q1', text: '다시 설명해주실 수 있나요?' }],
        threshold: 0.7,
        similarity_mode: 'rule',
        embedding_model: 'distiluse',
    });
    assert.equal(result.cluster_count, 1);
});

test('raises a useful error when the clustering model API rejects a request', async () => {
    process.env.QUESTION_MODEL_API_URL = 'http://localhost:8000';
    globalThis.fetch = async () => new Response('bad request', { status: 400 });

    await assert.rejects(
        clusterQuestions({ questions: [], similarityMode: 'rule' }),
        /Question clustering model API failed with status 400: bad request/,
    );
});
