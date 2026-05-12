import OpenAI from 'openai';

export const QUESTION_RECOMMENDATION_CATEGORIES = [
    'concept',
    'reasoning',
    'application',
    'comparison',
    'follow_up',
];

const DEFAULT_RECOMMENDATION_COUNT = 3;
const MAX_RECOMMENDATION_COUNT = 5;
const DEFAULT_MODEL = 'gpt-5.2';
const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high'];

const ANSWERABILITY_GUIDANCE = {
    goal: 'Generate questions that the mentor can answer well in the current mentoring flow.',
    priorityGroups: ['answer_now', 'answer_soon', 'collect_or_merge', 'hold', 'needs_context'],
    scoringDimensions: {
        clarity: {
            weight: 0.18,
            guidance: 'Prefer one clear question with concrete wording. Avoid vague pronouns and overloaded multi-part questions.',
        },
        sufficiency: {
            weight: 0.22,
            guidance: 'Include enough context from the mentee situation so the mentor can answer without asking for basic clarification.',
        },
        relevance: {
            weight: 0.25,
            guidance: 'Stay tightly connected to the session topic and the current mentoring context.',
        },
        flowFit: {
            weight: 0.20,
            guidance: 'Prefer questions that naturally follow recent mentor explanations and current script/slide content.',
        },
        expertise: {
            weight: 0.15,
            guidance: 'Aim at areas supported by the mentor profile, evidence, and past scripts.',
        },
        redundancyPenalty: {
            weight: -0.12,
            guidance: 'Avoid questions already answered or already waiting in the queue.',
        },
    },
    outputRules: [
        'Each recommendation should be likely to rank as answer_now or answer_soon.',
        'Do not generate questions that need more context before they can be answered.',
        'Do not repeat answeredQuestions or queuedQuestions semantically.',
        'Prefer practical, session-specific questions over generic study questions.',
        'Write each question as one concise Korean sentence from the mentee perspective.',
        'Ask for guidance, review, examples, or criteria that the mentor can provide; do not ask the mentor to share their own private files or artifacts.',
    ],
};

const recommendationResponseFormat = {
    type: 'json_schema',
    name: 'question_recommendations',
    description: 'Recommended mentoring questions tailored to the mentee, mentor, and session context.',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['questions'],
        properties: {
            questions: {
                type: 'array',
                minItems: 1,
                maxItems: MAX_RECOMMENDATION_COUNT,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['content', 'category', 'reason'],
                    properties: {
                        content: {
                            type: 'string',
                            minLength: 1,
                        },
                        category: {
                            type: 'string',
                            enum: QUESTION_RECOMMENDATION_CATEGORIES,
                        },
                        reason: {
                            type: 'string',
                            minLength: 1,
                        },
                    },
                },
            },
        },
    },
};

export class QuestionRecommendationError extends Error {
    constructor(message, code, status = 500) {
        super(message);
        this.name = 'QuestionRecommendationError';
        this.code = code;
        this.status = status;
    }
}

function toTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map(item => toTrimmedString(item))
        .filter(Boolean);
}

function normalizeCount(value) {
    if (value === undefined || value === null) {
        return DEFAULT_RECOMMENDATION_COUNT;
    }

    const count = Number(value);
    if (!Number.isInteger(count) || count < 1) {
        throw new QuestionRecommendationError(
            '`count` must be an integer between 1 and 5.',
            'QUESTION_RECOMMENDATION_INVALID_INPUT',
            400,
        );
    }

    return Math.min(count, MAX_RECOMMENDATION_COUNT);
}

function normalizeParticipant(value, role) {
    if (!value || typeof value !== 'object') {
        throw new QuestionRecommendationError(
            'mentee and mentor information are required',
            'QUESTION_RECOMMENDATION_PARTICIPANT_REQUIRED',
            400,
        );
    }

    const id = value.id ?? value.userId ?? value.mentorId ?? value.menteeId;
    if (id === undefined || id === null || String(id).trim() === '') {
        throw new QuestionRecommendationError(
            `${role}.id is required`,
            'QUESTION_RECOMMENDATION_PARTICIPANT_REQUIRED',
            400,
        );
    }

    if (role === 'mentee') {
        return {
            id: String(id),
            level: toTrimmedString(value.level),
            interests: normalizeStringArray(value.interests),
            goals: normalizeStringArray(value.goals),
        };
    }

    return {
        id: String(id),
        expertise: normalizeStringArray(value.expertise),
        role: toTrimmedString(value.role),
    };
}

function normalizeAnswerabilityContext(value = {}) {
    if (!value || typeof value !== 'object') {
        return {};
    }

    return {
        sessionTopic: toTrimmedString(value.sessionTopic),
        previousScriptSections: normalizeStringArray(value.previousScriptSections),
        currentScriptSection: toTrimmedString(value.currentScriptSection),
        currentSlideTitle: toTrimmedString(value.currentSlideTitle),
        nextScriptSection: toTrimmedString(value.nextScriptSection),
        recentMentorUtterances: normalizeStringArray(value.recentMentorUtterances),
        menteeProfile: toTrimmedString(value.menteeProfile),
        mentorProfile: toTrimmedString(value.mentorProfile),
        mentorExpertiseEvidence: normalizeStringArray(value.mentorExpertiseEvidence),
        mentorPastScripts: normalizeStringArray(value.mentorPastScripts),
        answeredQuestions: normalizeStringArray(value.answeredQuestions),
        queuedQuestions: normalizeStringArray(value.queuedQuestions),
    };
}

export function normalizeRecommendationRequest(input = {}) {
    const context = toTrimmedString(input.context);
    if (!context) {
        throw new QuestionRecommendationError(
            'context is required',
            'QUESTION_RECOMMENDATION_INVALID_INPUT',
            400,
        );
    }

    return {
        sessionId: input.sessionId ?? null,
        topic: toTrimmedString(input.topic),
        context,
        count: normalizeCount(input.count),
        mentee: normalizeParticipant(input.mentee, 'mentee'),
        mentor: normalizeParticipant(input.mentor, 'mentor'),
        answerabilityContext: normalizeAnswerabilityContext(input.answerabilityContext),
    };
}

function buildPromptPayload(request) {
    return {
        sessionId: request.sessionId,
        topic: request.topic || null,
        context: request.context,
        count: request.count,
        mentee: request.mentee,
        mentor: request.mentor,
        categories: QUESTION_RECOMMENDATION_CATEGORIES,
        answerabilityGuidance: ANSWERABILITY_GUIDANCE,
        answerabilityContext: request.answerabilityContext,
    };
}

function createOpenAIClient() {
    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
}

function parseRecommendationResponse(response) {
    const rawText = response?.output_text;
    if (typeof rawText !== 'string' || !rawText.trim()) {
        throw new QuestionRecommendationError(
            'invalid recommendation response format',
            'QUESTION_RECOMMENDATION_INVALID_AI_RESPONSE',
            502,
        );
    }

    try {
        return JSON.parse(rawText);
    } catch {
        throw new QuestionRecommendationError(
            'invalid recommendation response format',
            'QUESTION_RECOMMENDATION_INVALID_AI_RESPONSE',
            502,
        );
    }
}

function normalizeGeneratedQuestions(parsedResponse, count) {
    if (!parsedResponse || !Array.isArray(parsedResponse.questions)) {
        throw new QuestionRecommendationError(
            'invalid recommendation response format',
            'QUESTION_RECOMMENDATION_INVALID_AI_RESPONSE',
            502,
        );
    }

    const seenContents = new Set();
    const questions = [];

    for (const question of parsedResponse.questions) {
        const content = toTrimmedString(question?.content);
        const category = toTrimmedString(question?.category);
        const reason = toTrimmedString(question?.reason);
        const normalizedContentKey = content.replace(/\s+/g, ' ').toLowerCase();

        if (
            !content
            || !reason
            || !QUESTION_RECOMMENDATION_CATEGORIES.includes(category)
            || seenContents.has(normalizedContentKey)
        ) {
            continue;
        }

        seenContents.add(normalizedContentKey);
        questions.push({ content, category, reason });

        if (questions.length === count) {
            break;
        }
    }

    if (questions.length === 0) {
        throw new QuestionRecommendationError(
            'invalid recommendation response format',
            'QUESTION_RECOMMENDATION_INVALID_AI_RESPONSE',
            502,
        );
    }

    return questions;
}

export async function generateQuestionRecommendations(input, options = {}) {
    const request = normalizeRecommendationRequest(input);
    const client = options.client ?? createOpenAIClient();
    const model = options.model ?? process.env.QUESTION_RECOMMENDATION_MODEL ?? DEFAULT_MODEL;
    const reasoningEffort = options.reasoningEffort ?? process.env.QUESTION_RECOMMENDATION_REASONING_EFFORT;

    let response;
    try {
        const responsePayload = {
            model,
            instructions: [
                'You recommend Korean mentoring questions optimized for Answerability.',
                'Generate questions a mentee can ask a mentor directly.',
                'Use the mentee profile to adjust difficulty and wording.',
                'Use the mentor profile to aim questions at what the mentor can answer well.',
                'Use the provided Answerability scoring dimensions to make questions clear, sufficient, relevant, flow-fit, mentor-expertise aligned, and non-redundant.',
                'Prefer questions that would be classified as answer_now or answer_soon.',
                'Write concise one-sentence questions that the mentee can send as-is.',
                'Do not ask the mentor to share private artifacts; ask for advice about the mentee context instead.',
                'Do not invent private facts. Do not include names in the generated questions.',
                'Return only the requested JSON schema.',
            ].join('\n'),
            input: JSON.stringify(buildPromptPayload(request)),
            text: {
                format: recommendationResponseFormat,
            },
        };

        if (REASONING_EFFORTS.includes(reasoningEffort)) {
            responsePayload.reasoning = { effort: reasoningEffort };
        }

        response = await client.responses.create(responsePayload);
    } catch (error) {
        throw new QuestionRecommendationError(
            'failed to generate question recommendations',
            'QUESTION_RECOMMENDATION_GENERATION_FAILED',
            error.status ?? 502,
        );
    }

    const parsedResponse = parseRecommendationResponse(response);
    const result = {
        questions: normalizeGeneratedQuestions(parsedResponse, request.count),
    };

    if (options.includeMetadata) {
        result.metadata = {
            model,
            responseId: response.id ?? null,
            usage: response.usage ?? null,
        };
    }

    return result;
}
