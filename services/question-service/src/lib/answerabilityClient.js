import { computeAnswerability } from '../../scripts/question-ranking/calculator.js';

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

function getQuestionId(question, index) {
    return question.id ?? question.question_id ?? `question_${index + 1}`;
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

function hasClusteringPayload(input) {
    return Array.isArray(input?.clustering?.clusters) || Array.isArray(input?.clusters);
}

function getClusteringPayload(input) {
    return Array.isArray(input?.clustering?.clusters) ? input.clustering : input;
}

function normalizeClusterMember(member, fallbackIndex) {
    const id = member.question_id ?? member.id ?? `question_${fallbackIndex + 1}`;
    const text = member.text ?? member.question ?? '';

    return {
        id: String(id),
        text,
    };
}

function buildQuestionMetadata(questions) {
    const metadataById = new Map();

    if (!Array.isArray(questions)) {
        return metadataById;
    }

    questions.forEach((question, index) => {
        const id = String(getQuestionId(question, index));
        metadataById.set(id, normalizeBatchQuestion(question, index));
    });

    return metadataById;
}

function collectQuestionsFromClusters(clusters, metadataById) {
    const questionById = new Map();

    clusters.forEach(cluster => {
        const members = Array.isArray(cluster.member_questions)
            ? cluster.member_questions
            : cluster.memberQuestions;
        const fallbackMembers = members?.length ? members : [{
            question_id: cluster.representative_question_id ?? cluster.representativeQuestionId,
            text: cluster.representative_question ?? cluster.representativeQuestion,
        }];

        fallbackMembers.forEach((member, memberIndex) => {
            const normalizedMember = normalizeClusterMember(member, questionById.size + memberIndex);
            const metadata = metadataById.get(normalizedMember.id);

            questionById.set(normalizedMember.id, {
                ...(metadata ?? {}),
                id: normalizedMember.id,
                text: metadata?.text || normalizedMember.text,
                isPaid: Boolean(metadata?.isPaid ?? member.isPaid),
            });
        });
    });

    return [...questionById.values()].map((question, index) => normalizeBatchQuestion(question, index));
}

function normalizeClusterMembers(cluster, scoreById) {
    const members = Array.isArray(cluster.member_questions)
        ? cluster.member_questions
        : cluster.memberQuestions;
    const fallbackMembers = members?.length ? members : [{
        question_id: cluster.representative_question_id ?? cluster.representativeQuestionId,
        text: cluster.representative_question ?? cluster.representativeQuestion,
    }];

    return fallbackMembers
        .map((member, index) => normalizeClusterMember(member, index).id)
        .map(memberId => scoreById.get(memberId))
        .filter(Boolean);
}

function getRepresentativeQuestionId(cluster) {
    const representativeId = cluster.representative_question_id ?? cluster.representativeQuestionId;
    return representativeId === undefined || representativeId === null ? null : String(representativeId);
}

function rankScoredClusters(clustering, scoredQuestions) {
    const scoreById = new Map(scoredQuestions.map(question => [question.id, question]));

    return (clustering.clusters ?? []).map(cluster => {
        const scoredMembers = normalizeClusterMembers(cluster, scoreById);
        if (scoredMembers.length === 0) {
            throw new Error('Each cluster must include at least one question that can be ranked.');
        }

        const representative = selectRepresentative(
            scoredMembers,
            getRepresentativeQuestionId(cluster),
        );
        const rankedMembers = [...scoredMembers].sort(compareRankedQuestions);
        const priorityScore = getClusterPriorityScore(representative, scoredMembers.length);

        return {
            clusterId: cluster.cluster_id ?? cluster.clusterId,
            clusterSize: scoredMembers.length,
            priorityTier: representative.priorityTier,
            priorityScore,
            answerabilityScore: representative.answerabilityScore,
            representativeQuestionId: representative.id,
            representativeText: representative.text,
            clusteringRepresentativeQuestionId: getRepresentativeQuestionId(cluster),
            clusteringRepresentativeText: cluster.representative_question ?? cluster.representativeQuestion,
            similarityScore: cluster.best_match_score ?? cluster.bestMatchScore,
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
}

export async function rankQuestion(input) {
    if (hasClusteringPayload(input)) {
        return rankClusteredQuestions(input);
    }

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

async function rankClusteredQuestions(input) {
    const {
        questions,
        answeredQuestions = [],
        queuedQuestions: _ignoredQueuedQuestions = [],
        clustering: _ignoredClustering,
        service: _ignoredService,
        question_count: _ignoredQuestionCount,
        cluster_count: _ignoredClusterCount,
        threshold: _ignoredThreshold,
        similarity_mode: _ignoredSimilarityMode,
        similarityMode: _ignoredSimilarityModeCamel,
        embedding_model: _ignoredEmbeddingModel,
        embeddingModel: _ignoredEmbeddingModelCamel,
        clusters: _ignoredClusters,
        assignments: _ignoredAssignments,
        ...sharedContext
    } = input ?? {};
    const clustering = getClusteringPayload(input);

    if (!Array.isArray(clustering.clusters) || clustering.clusters.length === 0) {
        throw new Error('`clustering.clusters` must be a non-empty array.');
    }

    const metadataById = buildQuestionMetadata(questions);
    const normalizedQuestions = collectQuestionsFromClusters(clustering.clusters, metadataById);
    for (const question of normalizedQuestions) {
        if (typeof question.text !== 'string' || !question.text.trim()) {
            throw new Error('Each question text must be a non-empty string.');
        }
    }

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
    const rankedClusters = rankScoredClusters(clustering, scoredQuestions);

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
            questionCount: clustering.question_count ?? clustering.questionCount ?? scoredQuestions.length,
            clusterCount: clustering.cluster_count ?? clustering.clusterCount ?? rankedClusters.length,
            threshold: clustering.threshold,
            similarityMode: clustering.similarity_mode ?? clustering.similarityMode,
            embeddingModel: clustering.embedding_model ?? clustering.embeddingModel,
        },
    };
}
