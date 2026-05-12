import express from 'express';
import { clusterQuestions } from './lib/questionClusterClient.js';
import { predictQuestion } from './lib/questionDetectorClient.js';
import { rankQuestion, rankQuestions } from './lib/answerabilityClient.js';

const app = express();
const PORT = process.env.QUESTION_SERVICE_PORT || 4003;

app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ service: 'question-service', status: 'ok' });
});

app.post('/api/question-detection/predict', async (req, res) => {
    const { text } = req.body ?? {};

    if (typeof text !== 'string') {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: '`text` must be a string.',
        });
    }

    try {
        const prediction = await predictQuestion(text);
        return res.json({
            service: 'question-service',
            ...prediction,
        });
    } catch (error) {
        console.error('[question-service] prediction failed:', error);
        return res.status(500).json({
            error: 'QUESTION_DETECTION_FAILED',
            message: error.message,
        });
    }
});

app.post('/api/question-clustering/cluster', async (req, res) => {
    const {
        questions,
        threshold,
        similarityMode,
        similarity_mode: similarityModeSnakeCase,
        embeddingModel,
        embedding_model: embeddingModelSnakeCase,
    } = req.body ?? {};

    if (!Array.isArray(questions)) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: '`questions` must be an array of strings or objects with a `text` field.',
        });
    }

    try {
        const clustering = await clusterQuestions({
            questions,
            threshold,
            similarityMode: similarityMode ?? similarityModeSnakeCase,
            embeddingModel: embeddingModel ?? embeddingModelSnakeCase,
        });
        return res.json({
            service: 'question-service',
            ...clustering,
        });
    } catch (error) {
        console.error('[question-service] clustering failed:', error);
        return res.status(500).json({
            error: 'QUESTION_CLUSTERING_FAILED',
            message: error.message,
        });
    }
});

app.post('/api/questions/rank', async (req, res) => {
    try {
        const result = await rankQuestion(req.body ?? {});
        return res.json({ service: 'question-service', ...result });
    } catch (error) {
        const isInvalidRequest = error.message.includes('must be a non-empty string');
        return res.status(isInvalidRequest ? 400 : 500).json({
            error: isInvalidRequest ? 'INVALID_REQUEST' : 'RANKING_FAILED',
            message: error.message,
        });
    }
});

app.post('/api/questions/rank-batch', async (req, res) => {
    try {
        const result = await rankQuestions(req.body ?? {});
        return res.json({ service: 'question-service', ...result });
    } catch (error) {
        const isInvalidRequest = error.message.includes('questions') || error.message.includes('non-empty string');
        return res.status(isInvalidRequest ? 400 : 500).json({
            error: isInvalidRequest ? 'INVALID_REQUEST' : 'RANKING_FAILED',
            message: error.message,
        });
    }
});

app.listen(PORT, () => {
    console.log(`question-service running on http://localhost:${PORT}`);
});
