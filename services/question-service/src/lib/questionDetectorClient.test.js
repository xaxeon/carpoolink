import assert from 'node:assert/strict';
import test from 'node:test';
import { predictQuestion } from './questionDetectorClient.js';

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

test('predicts questions through the configured model API', async () => {
    const requests = [];
    process.env.QUESTION_MODEL_API_URL = 'http://localhost:8000/';
    globalThis.fetch = async (url, options) => {
        requests.push({ url, options });
        return Response.json({
            text: '이 부분 다시 설명해주실 수 있나요?',
            is_question: true,
            score: 1,
        });
    };

    const result = await predictQuestion('이 부분 다시 설명해주실 수 있나요?');

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://localhost:8000/question-detection/predict');
    assert.equal(requests[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
        text: '이 부분 다시 설명해주실 수 있나요?',
    });
    assert.equal(result.is_question, true);
});

test('raises a useful error when the model API rejects a request', async () => {
    process.env.QUESTION_MODEL_API_URL = 'http://localhost:8000';
    globalThis.fetch = async () => new Response('model unavailable', { status: 503 });

    await assert.rejects(
        predictQuestion('테스트 문장입니다'),
        /Question model API failed with status 503: model unavailable/,
    );
});
