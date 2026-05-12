import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildQuestionRecommendationPayload,
    parseSessionId,
    QuestionRecommendationProxyError,
    requestQuestionRecommendations,
    selectMenteeParticipant,
} from './questionRecommendationProxy.js';

const currentUserId = 20n;

const mentoring = {
    mentoringId: 1n,
    title: 'React 상태 관리',
    hostMentor: {
        userId: 3n,
        nickname: '이준호',
        role: 'MENTOR',
        mentorProfile: {
            mentorId: 30n,
            info: {
                role: 'senior frontend engineer',
                expertise: ['architecture'],
            },
            fields: [
                { fieldName: 'CAREER' },
                { fieldName: 'GROWTH' },
            ],
        },
    },
    participants: [
        {
            userId: currentUserId,
            user: {
                userId: currentUserId,
                nickname: '김민지',
                role: 'MENTEE',
                menteeProfile: {
                    menteeId: 10n,
                    surveyResult: {
                        title: '취업 준비형',
                    },
                },
            },
        },
    ],
};

test('parses sessionId as bigint', () => {
    assert.equal(parseSessionId('123'), 123n);
});

test('rejects missing sessionId', () => {
    assert.throws(
        () => parseSessionId(null),
        error => error instanceof QuestionRecommendationProxyError
            && error.code === 'QUESTION_RECOMMENDATION_SESSION_REQUIRED'
            && error.status === 400,
    );
});

test('selects current mentee participant first', () => {
    const mentee = selectMenteeParticipant(mentoring, currentUserId);

    assert.equal(mentee.userId, currentUserId);
});

test('builds question-service recommendation payload from mentoring data', () => {
    const payload = buildQuestionRecommendationPayload({
        body: {
            topic: '',
            context: 'useReducer를 언제 써야 할지 고민 중입니다.',
            count: 3,
            answerabilityContext: {
                currentSlideTitle: '상태 관리 복잡도',
                recentMentorUtterances: ['useReducer는 상태 변경 규칙이 복잡할 때 고려할 수 있어요.'],
                answeredQuestions: ['useReducer와 useState의 기본 차이는 무엇인가요?'],
            },
        },
        mentoring,
        currentUserId,
    });

    assert.deepEqual(payload, {
        sessionId: '1',
        topic: 'React 상태 관리',
        context: 'useReducer를 언제 써야 할지 고민 중입니다.',
        count: 3,
        mentee: {
            id: '10',
            name: '김민지',
            level: '취업 준비형',
            interests: [],
            goals: ['취업 준비형'],
        },
        mentor: {
            id: '30',
            name: '이준호',
            expertise: ['CAREER', 'GROWTH', 'architecture'],
            role: 'senior frontend engineer',
        },
        answerabilityContext: {
            sessionTopic: 'React 상태 관리',
            previousScriptSections: [],
            currentScriptSection: '',
            currentSlideTitle: '상태 관리 복잡도',
            nextScriptSection: '',
            recentMentorUtterances: ['useReducer는 상태 변경 규칙이 복잡할 때 고려할 수 있어요.'],
            menteeProfile: 'MENTEE, 취업 준비형',
            mentorProfile: 'MENTOR, senior frontend engineer, CAREER, GROWTH',
            mentorExpertiseEvidence: [],
            mentorPastScripts: [],
            answeredQuestions: ['useReducer와 useState의 기본 차이는 무엇인가요?'],
            queuedQuestions: [],
        },
    });
});

test('forwards recommendation request to question-service', async () => {
    const calls = [];
    const result = await requestQuestionRecommendations(
        { context: 'hello' },
        {
            baseUrl: 'http://question-service',
            fetchImpl: async (url, options) => {
                calls.push({ url, options });
                return {
                    ok: true,
                    json: async () => ({
                        service: 'question-service',
                        questions: [
                            {
                                content: '무엇을 먼저 확인하면 좋을까요?',
                                category: 'concept',
                                reason: '맥락 확인 질문입니다.',
                            },
                        ],
                    }),
                };
            },
        },
    );

    assert.equal(calls[0].url, 'http://question-service/api/questions/recommendations');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { context: 'hello' });
    assert.equal(result.questions.length, 1);
});

test('propagates question-service errors', async () => {
    await assert.rejects(
        requestQuestionRecommendations(
            { context: 'hello' },
            {
                baseUrl: 'http://question-service',
                fetchImpl: async () => ({
                    ok: false,
                    status: 502,
                    json: async () => ({
                        code: 'QUESTION_RECOMMENDATION_GENERATION_FAILED',
                        message: 'failed to generate question recommendations',
                    }),
                }),
            },
        ),
        error => error instanceof QuestionRecommendationProxyError
            && error.status === 502
            && error.code === 'QUESTION_RECOMMENDATION_GENERATION_FAILED',
    );
});
