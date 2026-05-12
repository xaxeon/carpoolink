const DEFAULT_QUESTION_SERVICE_URL = 'http://localhost:4003';

export class QuestionRecommendationProxyError extends Error {
    constructor(message, status = 500, code = 'QUESTION_RECOMMENDATION_PROXY_FAILED') {
        super(message);
        this.name = 'QuestionRecommendationProxyError';
        this.status = status;
        this.code = code;
    }
}

function toTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function toStringId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    return String(value);
}

function asStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map(item => toTrimmedString(item))
        .filter(Boolean);
}

function normalizeAnswerabilityContext(value = {}) {
    if (!value || typeof value !== 'object') {
        return {};
    }

    return {
        sessionTopic: toTrimmedString(value.sessionTopic),
        previousScriptSections: asStringArray(value.previousScriptSections),
        currentScriptSection: toTrimmedString(value.currentScriptSection),
        currentSlideTitle: toTrimmedString(value.currentSlideTitle),
        nextScriptSection: toTrimmedString(value.nextScriptSection),
        recentMentorUtterances: asStringArray(value.recentMentorUtterances),
        menteeProfile: toTrimmedString(value.menteeProfile),
        mentorProfile: toTrimmedString(value.mentorProfile),
        mentorExpertiseEvidence: asStringArray(value.mentorExpertiseEvidence),
        mentorPastScripts: asStringArray(value.mentorPastScripts),
        answeredQuestions: asStringArray(value.answeredQuestions),
        queuedQuestions: asStringArray(value.queuedQuestions),
    };
}

function readMentorInfoList(info, keys) {
    if (!info || typeof info !== 'object') {
        return [];
    }

    for (const key of keys) {
        const value = info[key];
        if (Array.isArray(value)) {
            return asStringArray(value);
        }
    }

    return [];
}

function readMentorInfoText(info, keys) {
    if (!info || typeof info !== 'object') {
        return '';
    }

    for (const key of keys) {
        const value = toTrimmedString(info[key]);
        if (value) {
            return value;
        }
    }

    return '';
}

export function parseSessionId(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
        throw new QuestionRecommendationProxyError(
            'sessionId is required',
            400,
            'QUESTION_RECOMMENDATION_SESSION_REQUIRED',
        );
    }

    try {
        return BigInt(value);
    } catch {
        throw new QuestionRecommendationProxyError(
            'invalid sessionId',
            400,
            'QUESTION_RECOMMENDATION_INVALID_INPUT',
        );
    }
}

export function selectMenteeParticipant(mentoring, currentUserId) {
    const participants = mentoring?.participants ?? [];
    const currentUserParticipant = participants.find(
        participant => participant.userId === currentUserId && participant.user?.role === 'MENTEE',
    );

    if (currentUserParticipant) {
        return currentUserParticipant.user;
    }

    return participants.find(participant => participant.user?.role === 'MENTEE')?.user ?? null;
}

export function buildQuestionRecommendationPayload({ body, mentoring, currentUserId }) {
    const menteeUser = selectMenteeParticipant(mentoring, currentUserId);
    const mentorUser = mentoring?.hostMentor;
    const mentorProfile = mentorUser?.mentorProfile;
    const menteeProfile = menteeUser?.menteeProfile;
    const mentorInfo = mentorProfile?.info;
    const fieldNames = mentorProfile?.fields?.map(field => field.fieldName) ?? [];
    const mentorInfoExpertise = readMentorInfoList(mentorInfo, ['expertise', 'skills', 'fields']);
    const mentorRole = readMentorInfoText(mentorInfo, ['role', 'job', 'position', 'title']);
    const answerabilityContext = normalizeAnswerabilityContext(body.answerabilityContext);

    if (!menteeUser || !mentorUser) {
        throw new QuestionRecommendationProxyError(
            'mentee and mentor information are required',
            400,
            'QUESTION_RECOMMENDATION_PARTICIPANT_REQUIRED',
        );
    }

    return {
        sessionId: toStringId(mentoring.mentoringId),
        topic: toTrimmedString(body.topic) || mentoring.title,
        context: body.context,
        count: body.count,
        mentee: {
            id: toStringId(menteeProfile?.menteeId ?? menteeUser.userId),
            name: menteeUser.nickname,
            level: menteeProfile?.surveyResult?.title ?? '',
            interests: [],
            goals: menteeProfile?.surveyResult?.title ? [menteeProfile.surveyResult.title] : [],
        },
        mentor: {
            id: toStringId(mentorProfile?.mentorId ?? mentorUser.userId),
            name: mentorUser.nickname,
            expertise: [...new Set([...fieldNames, ...mentorInfoExpertise])],
            role: mentorRole || mentorUser.role,
        },
        answerabilityContext: {
            ...answerabilityContext,
            sessionTopic: answerabilityContext.sessionTopic || toTrimmedString(body.topic) || mentoring.title,
            menteeProfile: answerabilityContext.menteeProfile
                || [
                    menteeUser.role,
                    menteeProfile?.surveyResult?.title,
                ].filter(Boolean).join(', '),
            mentorProfile: answerabilityContext.mentorProfile
                || [
                    mentorUser.role,
                    mentorRole,
                    fieldNames.join(', '),
                ].filter(Boolean).join(', '),
        },
    };
}

export function getQuestionServiceUrl() {
    return process.env.QUESTION_SERVICE_URL || DEFAULT_QUESTION_SERVICE_URL;
}

export async function requestQuestionRecommendations(payload, options = {}) {
    const baseUrl = options.baseUrl ?? getQuestionServiceUrl();
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${baseUrl}/api/questions/recommendations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    let responseBody = null;
    try {
        responseBody = await response.json();
    } catch {
        responseBody = null;
    }

    if (!response.ok) {
        throw new QuestionRecommendationProxyError(
            responseBody?.message ?? 'failed to generate question recommendations',
            response.status,
            responseBody?.code ?? 'QUESTION_RECOMMENDATION_SERVICE_FAILED',
        );
    }

    return responseBody;
}
