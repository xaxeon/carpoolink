import assert from 'node:assert/strict';
import test from 'node:test';
import {
    generateQuestionRecommendations,
    normalizeRecommendationRequest,
    QuestionRecommendationError,
} from './questionRecommendationClient.js';

const validRequest = {
    sessionId: 1,
    topic: 'React 상태 관리',
    context: 'useState와 useReducer의 차이를 학습 중입니다.',
    count: 3,
    mentee: {
        id: 10,
        level: 'beginner',
        interests: ['frontend', 'React'],
        goals: ['React 상태 관리 이해'],
    },
    mentor: {
        id: 3,
        expertise: ['frontend', 'React'],
        role: 'senior frontend engineer',
    },
};

test('normalizes recommendation requests with default count', () => {
    const request = normalizeRecommendationRequest({
        ...validRequest,
        count: undefined,
    });

    assert.equal(request.count, 3);
    assert.equal(request.context, validRequest.context);
    assert.equal(request.mentee.id, '10');
    assert.equal(request.mentor.id, '3');
});

test('caps recommendation count at five', () => {
    const request = normalizeRecommendationRequest({
        ...validRequest,
        count: 10,
    });

    assert.equal(request.count, 5);
});

test('rejects missing context', () => {
    assert.throws(
        () => normalizeRecommendationRequest({ ...validRequest, context: '' }),
        error => error instanceof QuestionRecommendationError
            && error.code === 'QUESTION_RECOMMENDATION_INVALID_INPUT'
            && error.status === 400,
    );
});

test('rejects missing participant information', () => {
    assert.throws(
        () => normalizeRecommendationRequest({ ...validRequest, mentor: null }),
        error => error instanceof QuestionRecommendationError
            && error.code === 'QUESTION_RECOMMENDATION_PARTICIPANT_REQUIRED'
            && error.status === 400,
    );
});

test('generates and deduplicates AI recommendations', async () => {
    const createCalls = [];
    const fakeClient = {
        responses: {
            create: async payload => {
                createCalls.push(payload);
                return {
                    output_text: JSON.stringify({
                        questions: [
                            {
                                content: 'useReducer를 사용하는 기준은 무엇인가요?',
                                category: 'concept',
                                reason: '멘티 수준에 맞는 핵심 개념 질문입니다.',
                            },
                            {
                                content: 'useReducer를 사용하는 기준은 무엇인가요?',
                                category: 'concept',
                                reason: '중복 질문입니다.',
                            },
                            {
                                content: '프로젝트에서 useReducer가 적합한 상황은 무엇인가요?',
                                category: 'application',
                                reason: '멘토의 실무 경험을 끌어낼 수 있습니다.',
                            },
                        ],
                    }),
                };
            },
        },
    };

    const result = await generateQuestionRecommendations(validRequest, {
        client: fakeClient,
        model: 'test-model',
    });

    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].model, 'test-model');
    assert.equal(createCalls[0].text.format.type, 'json_schema');
    assert.match(createCalls[0].instructions, /Answerability/);
    const promptPayload = JSON.parse(createCalls[0].input);
    assert.equal(promptPayload.answerabilityGuidance.scoringDimensions.relevance.weight, 0.25);
    assert.deepEqual(result.questions, [
        {
            content: 'useReducer를 사용하는 기준은 무엇인가요?',
            category: 'concept',
            reason: '멘티 수준에 맞는 핵심 개념 질문입니다.',
        },
        {
            content: '프로젝트에서 useReducer가 적합한 상황은 무엇인가요?',
            category: 'application',
            reason: '멘토의 실무 경험을 끌어낼 수 있습니다.',
        },
    ]);
});

test('wraps AI failures with recommendation error code', async () => {
    const fakeClient = {
        responses: {
            create: async () => {
                throw new Error('network failed');
            },
        },
    };

    await assert.rejects(
        generateQuestionRecommendations(validRequest, { client: fakeClient }),
        error => error instanceof QuestionRecommendationError
            && error.code === 'QUESTION_RECOMMENDATION_GENERATION_FAILED'
            && error.status === 502,
    );
});
