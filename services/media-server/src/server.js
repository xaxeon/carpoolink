import http from 'http';
import express from 'express';
import cors from 'cors';

import { createMentoringRepository } from './store/mentoringRepository.js';
import { AudioPipelineManager } from './streaming/audioPipeline.js';
import { MediaSoupOrchestrator } from './streaming/mediaSoupOrchestrator.js';
import { createSignalingServer } from './streaming/signalingServer.js';

const app = express();
const PORT = Number(process.env.MEDIA_SERVER_PORT || 4002);

app.use(cors());
app.use(express.json());

const mentoringRepository = await createMentoringRepository();
const audioPipeline = new AudioPipelineManager();
const mediaOrchestrator = new MediaSoupOrchestrator({ audioPipeline });

await mediaOrchestrator.init();

// 요청에서 사용자 ID를 파싱하는 함수
function parseUserIdFromRequest(req) {
    const rawUserId = req.header('x-user-id') ?? req.header('user-id');

    if (!rawUserId) {
        return null;
    }

    try {
        return Number(BigInt(rawUserId));
    } catch {
        return null;
    }
}

// [GET] /health: 서비스 상태 확인
app.get('/health', (req, res) => {
    res.json({
        service: 'media-server',
        status: 'ok',
        mediasoup: mediaOrchestrator.getHealthSnapshot()
    });
});

// [POST] /mentorings/start: 새로운 멘토링 시작
app.post('/mentorings/start', async (req, res) => {
    try {
        const { title, isGroup = true } = req.body ?? {};
        const userId = parseUserIdFromRequest(req);

        if (!title) {
            return res.status(400).json({
                message: '제목은 필수입니다.'
            });
        }

        if (userId === null) {
            return res.status(400).json({
                message: 'x-user-id 헤더가 필요합니다.'
            });
        }

        await mentoringRepository.assertMentorUser(userId);

        const mentoring = await mentoringRepository.createMentoring({
            title,
            userId,
            isGroup,
            status: 'ON_AIR'
        });

        await mediaOrchestrator.ensureRoom(mentoring.mentoringId, {
            isGroup: mentoring.isGroup
        });

        return res.status(201).json({
            mentoring,
            signaling: {
                socketPath: '/socket.io',
                hint: '멘토링 세션에 참여하려면 Socket.IO를 통해 연결하세요'
            }
        });
    } catch (error) {
        console.error('[mentoring/start] failed', error);
        const statusCode = error?.statusCode ?? 500;

        if (statusCode !== 500) {
            return res.status(statusCode).json({ message: error.message });
        }

        return res.status(500).json({
            message: '멘토링 세션을 시작하는 데 실패했습니다'
        });
    }
});

// [POST] /mentorings/:mentoringId/end: 멘토링 종료
app.post('/mentorings/:mentoringId/end', async (req, res) => {
    try {
        const mentoringId = Number(req.params.mentoringId);

        if (!Number.isFinite(mentoringId)) {
            return res.status(400).json({ message: '잘못된 멘토링 ID입니다' });
        }

        const mentoring = await mentoringRepository.endMentoring(mentoringId);
        await mediaOrchestrator.closeRoom(mentoringId);

        return res.json({ mentoring });
    } catch (error) {
        console.error('[mentoring/end] failed', error);
        return res.status(500).json({
            message: '멘토링 세션을 종료하는 데 실패했습니다'
        });
    }
});

// [GET] /mentorings/:mentoringId: 멘토링 세션 정보 및 현재 미디어 상태 조회
app.get('/mentorings/:mentoringId', async (req, res) => {
    try {
        const mentoringId = Number(req.params.mentoringId);

        if (!Number.isFinite(mentoringId)) {
            return res.status(400).json({ message: '잘못된 멘토링 ID입니다' });
        }

        const mentoring = await mentoringRepository.getMentoringById(mentoringId);

        if (!mentoring) {
            return res.status(404).json({ message: '멘토링을 찾을 수 없습니다' });
        }

        return res.json({
            mentoring,
            media: mediaOrchestrator.getRoomSnapshot(mentoringId)
        });
    } catch (error) {
        console.error('[mentoring/get] failed', error);
        return res.status(500).json({
            message: '멘토링 세션을 조회하는 데 실패했습니다'
        });
    }
});

const httpServer = http.createServer(app);

createSignalingServer({
    httpServer,
    mediaOrchestrator,
    mentoringRepository,
    audioPipeline
});

httpServer.listen(PORT, () => {
    console.log(`media-server running on http://localhost:${PORT}`);
});
