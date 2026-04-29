import { Router } from 'express';
import {
    getChatMessages,
    getChatMessageCount,
    getMentoringStatus,
} from '../database/chatRepository.js';

const router = Router();

/**
 * [GET] /chats/:mentoringId/messages - 채팅 메시지 조회
 */
router.get('/:mentoringId/messages', async (req, res, next) => {
    try {
        const { mentoringId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;

        // 멘토링 존재 여부 확인
        const mentoring = await getMentoringStatus(BigInt(mentoringId));
        if (!mentoring) {
            return res.status(404).json({ error: '멘토링을 찾을 수 없습니다.' });
        }

        // 메시지 조회
        const messages = await getChatMessages(BigInt(mentoringId), limit, offset);
        const totalCount = await getChatMessageCount(BigInt(mentoringId));

        const formattedMessages = messages.map((msg) => ({
            mentoringChatId: msg.mentoringChatId.toString(),
            mentoringId: msg.mentoringId.toString(),
            userId: msg.userId.toString(),
            userName: msg.user.nickname,
            content: msg.content,
            createdAt: msg.createdAt,
        }));

        res.json({
            messages: formattedMessages,
            pagination: {
                total: totalCount,
                limit,
                offset,
                hasMore: offset + limit < totalCount,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * [GET] /chats/:mentoringId/info - 채팅룸 정보 조회
 */
router.get('/:mentoringId/info', async (req, res, next) => {
    try {
        const { mentoringId } = req.params;

        const mentoring = await getMentoringStatus(BigInt(mentoringId));
        if (!mentoring) {
            return res.status(404).json({ error: '멘토링을 찾을 수 없습니다' });
        }

        const messageCount = await getChatMessageCount(BigInt(mentoringId));

        res.json({
            mentoringId: mentoring.mentoringId.toString(),
            title: mentoring.title,
            isGroup: mentoring.isGroup,
            status: mentoring.status,
            startedAt: mentoring.startedAt,
            endedAt: mentoring.endedAt,
            messageCount,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * [GET] /chats/health - 헬스 체크
 */
router.get('/health/check', (req, res) => {
    res.json({ service: 'chat-service', status: 'ok' });
});

export default router;
