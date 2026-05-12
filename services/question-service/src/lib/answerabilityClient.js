import { computeAnswerability } from '../../scripts/question-sorting/calculator.js';
import { clusterQuestions } from './questionClusterClient.js';

function normalizeBatchQuestion(rawQuestion, index) {
    const text = rawQuestion.text ?? rawQuestion.question ?? '';
    const id = rawQuestion.id ?? rawQuestion.question_id ?? `question_${index + 1}`;

    return {
        id: String(id),
        text,
        isPaid: Boolean(rawQuestion.isPaid),
        createdAt: rawQuestion.createdAt ?? null,
        userId: rawQuestion.userId ?? null,
        raw: rawQuestion,
    };
}

function compareRankedQuestions(left, right) {
    if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
    }

    if (left.answerabilityScore !== right.answerabilityScore) {
        return right.answerabilityScore - left.answerabilityScore;
    }

    return String(left.id).localeCompare(String(right.id));
}

function selectRepresentative(scoredMembers, clusteringRepresentativeId) {
    const representativeFromClustering = scoredMembers.find(member => member.id === clusteringRepresentativeId);
    const paidMembers = scoredMembers.filter(member => member.priorityTier === 'paid');
    const candidatePool = paidMembers.length ? paidMembers : scoredMembers;

    if (representativeFromClustering && candidatePool.includes(representativeFromClustering)) {
        return representativeFromClustering;
    }

    return [...candidatePool].sort(compareRankedQuestions)[0];
}

function getClusterPriorityScore(representative, clusterSize) {
    const demandBoost = Math.min(0.08, Math.max(0, clusterSize - 1) * 0.02);
    const tierBase = representative.priorityTier === 'paid' ? 1 : 0;
    const boostedAnswerabilityScore = Math.max(0, Math.min(1, representative.answerabilityScore + demandBoost));

    return tierBase + boostedAnswerabilityScore;
}

function normalizeClusteringQuestion(question) {
    return {
        question_id: question.id,
        text: question.text,
    };
}

export async function rankQuestion(input) {
    const {
        question,
        isPaid            = false,
        sessionTopic      = '',
        previousScriptSections = [],
        currentScriptSection = '',
        currentSlideTitle = '',
        nextScriptSection = '',
        recentMentorUtterances = [],
        menteeProfile     = '',
        mentorProfile     = '',
        mentorExpertiseEvidence = [],
        mentorPastScripts = [],
        answeredQuestions = [],
        queuedQuestions = [],
    } = input;

    if (typeof question !== 'string' || !question.trim()) {
        throw new Error('`question` must be a non-empty string.');
    }

    return computeAnswerability({
        question,
        isPaid,
        sessionTopic,
        previousScriptSections,
        currentScriptSection,
        currentSlideTitle,
        nextScriptSection,
        recentMentorUtterances,
        menteeProfile,
        mentorProfile,
        mentorExpertiseEvidence,
        mentorPastScripts,
        answeredQuestions,
        queuedQuestions,
    });
}

export async function rankQuestions(input) {
    const {
        questions = [],
        threshold,
        clusterSimilarityThreshold,
        similarityMode,
        embeddingModel,
        answeredQuestions = [],
        queuedQuestions: _ignoredQueuedQuestions = [],
        ...sharedContext
    } = input ?? {};

    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('`questions` must be a non-empty array.');
    }

    const normalizedQuestions = questions.map(normalizeBatchQuestion);
    for (const question of normalizedQuestions) {
        if (typeof question.text !== 'string' || !question.text.trim()) {
            throw new Error('Each question text must be a non-empty string.');
        }
    }

    const clustering = await clusterQuestions({
        questions: normalizedQuestions.map(normalizeClusteringQuestion),
        threshold: threshold ?? clusterSimilarityThreshold,
        similarityMode,
        embeddingModel,
    });

    const scoredQuestions = await Promise.all(normalizedQuestions.map(async question => {
        const result = await computeAnswerability({
            ...sharedContext,
            question: question.text,
            isPaid: question.isPaid,
            answeredQuestions,
            queuedQuestions: [],
        });

        return {
            ...question,
            ...result,
        };
    }));

    const scoreById = new Map(scoredQuestions.map(question => [question.id, question]));
    const rankedClusters = (clustering.clusters ?? []).map(cluster => {
        const memberIds = (cluster.member_questions ?? []).map(member => String(member.question_id));
        const scoredMembers = memberIds
            .map(memberId => scoreById.get(memberId))
            .filter(Boolean);

        const representative = selectRepresentative(
            scoredMembers,
            String(cluster.representative_question_id),
        );
        const rankedMembers = [...scoredMembers].sort(compareRankedQuestions);
        const priorityScore = getClusterPriorityScore(representative, scoredMembers.length);

        return {
            clusterId: cluster.cluster_id,
            clusterSize: scoredMembers.length,
            priorityTier: representative.priorityTier,
            priorityScore,
            answerabilityScore: representative.answerabilityScore,
            representativeQuestionId: representative.id,
            representativeText: representative.text,
            clusteringRepresentativeQuestionId: String(cluster.representative_question_id),
            clusteringRepresentativeText: cluster.representative_question,
            similarityScore: cluster.best_match_score,
            similarQuestionIds: rankedMembers
                .filter(member => member.id !== representative.id)
                .map(member => member.id),
            questions: rankedMembers.map(member => ({
                id: member.id,
                text: member.text,
                isPaid: member.isPaid,
                priorityScore: member.priorityScore,
                answerabilityScore: member.answerabilityScore,
                priorityTier: member.priorityTier,
                priorityGroup: member.priorityGroup,
                scores: member.scores,
            })),
        };
    }).sort((left, right) => {
        if (left.priorityScore !== right.priorityScore) {
            return right.priorityScore - left.priorityScore;
        }

        if (left.clusterSize !== right.clusterSize) {
            return right.clusterSize - left.clusterSize;
        }

        return String(left.representativeQuestionId).localeCompare(String(right.representativeQuestionId));
    });

    const rankedQuestions = rankedClusters.map(cluster => {
        const representative = scoreById.get(cluster.representativeQuestionId);

        return {
            id: representative.id,
            text: representative.text,
            isPaid: representative.isPaid,
            clusterId: cluster.clusterId,
            clusterSize: cluster.clusterSize,
            similarQuestionIds: cluster.similarQuestionIds,
            priorityScore: cluster.priorityScore,
            answerabilityScore: representative.answerabilityScore,
            priorityTier: representative.priorityTier,
            priorityGroup: representative.priorityGroup,
            scores: representative.scores,
        };
    });

    return {
        rankedQuestions,
        clusters: rankedClusters,
        clustering: {
            questionCount: clustering.question_count,
            clusterCount: clustering.cluster_count,
            threshold: clustering.threshold,
            similarityMode: clustering.similarity_mode,
            embeddingModel: clustering.embedding_model,
        },
    };
}
