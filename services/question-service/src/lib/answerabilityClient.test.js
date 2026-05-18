import assert from 'node:assert/strict';
import test from 'node:test';

import { rankQuestion } from './answerabilityClient.js';

test('ranks an existing clustering result without reclustering', async () => {
    const result = await rankQuestion({
        sessionTopic: 'React state management',
        currentScriptSection: 'useState updates are reflected on the next render.',
        mentorProfile: 'React frontend mentor',
        menteeProfile: 'Beginner React learner',
        questions: [
            {
                id: 'q1',
                text: 'useState 값이 바로 안 바뀌는 이유가 뭔가요?',
                isPaid: true,
            },
            {
                id: 'q2',
                text: 'useEffect는 언제 실행되나요?',
                isPaid: false,
            },
        ],
        clustering: {
            question_count: 2,
            cluster_count: 1,
            threshold: 0.5,
            similarity_mode: 'rule',
            embedding_model: null,
            clusters: [
                {
                    cluster_id: 'cluster_1',
                    representative_question_id: 'q1',
                    representative_question: 'useState 값이 바로 안 바뀌는 이유가 뭔가요?',
                    best_match_score: 0.71,
                    member_questions: [
                        {
                            question_id: 'q1',
                            text: 'useState 값이 바로 안 바뀌는 이유가 뭔가요?',
                        },
                        {
                            question_id: 'q2',
                            text: 'useEffect는 언제 실행되나요?',
                        },
                    ],
                },
            ],
        },
    });

    assert.equal(result.clustering.questionCount, 2);
    assert.equal(result.clustering.clusterCount, 1);
    assert.equal(result.rankedQuestions.length, 1);
    assert.equal(result.clusters.length, 1);
    assert.equal(result.clusters[0].clusterId, 'cluster_1');
    assert.equal(result.clusters[0].clusterSize, 2);
    assert.equal(result.clusters[0].questions.length, 2);
    assert.equal(result.clusters[0].questions.some(question => question.id === 'q1' && question.isPaid), true);
});
