import { Router } from 'express';
import { prisma } from '@carpoolink/database';
import { requireUser } from '../middleware/requireUser.js';
import { serialize } from '../utils/serialize.js';
import {
    buildQuestionRecommendationPayload,
    parseSessionId,
    QuestionRecommendationProxyError,
    requestQuestionRecommendations,
} from '../lib/questionRecommendationProxy.js';

const router = Router();

function isInvalidContext(value) {
    return typeof value !== 'string' || !value.trim();
}

router.post('/recommendations', requireUser, async (req, res, next) => {
    try {
        if (isInvalidContext(req.body?.context)) {
            return res.status(400).json({
                code: 'QUESTION_RECOMMENDATION_INVALID_INPUT',
                message: 'context is required',
            });
        }

        const mentoringId = parseSessionId(req.body?.sessionId);
        const mentoring = await prisma.mentoring.findFirst({
            where: {
                mentoringId,
                OR: [
                    { userId: req.user.userId },
                    {
                        participants: {
                            some: { userId: req.user.userId },
                        },
                    },
                ],
            },
            include: {
                hostMentor: {
                    include: {
                        mentorProfile: {
                            include: { fields: true },
                        },
                    },
                },
                participants: {
                    include: {
                        user: {
                            include: {
                                menteeProfile: {
                                    include: { surveyResult: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!mentoring) {
            return res.status(404).json({
                code: 'QUESTION_RECOMMENDATION_SESSION_NOT_FOUND',
                message: 'mentoring session not found or access denied',
            });
        }

        const payload = buildQuestionRecommendationPayload({
            body: req.body,
            mentoring,
            currentUserId: req.user.userId,
        });
        const result = await requestQuestionRecommendations(payload);

        return res.json(serialize({
            questions: result.questions ?? [],
        }));
    } catch (error) {
        if (error instanceof QuestionRecommendationProxyError) {
            return res.status(error.status).json({
                code: error.code,
                message: error.message,
            });
        }

        next(error);
    }
});

export default router;
