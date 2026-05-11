import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import {
    handleConnection,
    closeCompletedMentoringRooms,
    closeMentoringRoom,
} from './socket/socketHandler.js';
import chatsRouter from './routes/chats.js';
import { PrismaClient } from '@carpoolink/database';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.CHAT_SERVICE_PORT || 4001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// Prisma 클라이언트를 전역에 할당
global.prisma = new PrismaClient();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io 설정
const io = new Server(httpServer, {
    cors: {
        origin: CORS_ORIGIN,
        methods: ['GET', 'POST'],
        credentials: true,
    },
    transports: ['websocket', 'polling'],
});

// 라우트 등록
app.use('/chats', chatsRouter);

// Health check 엔드포인트
app.get('/health', (req, res) => {
    res.json({ service: 'chat-service', status: 'ok' });
});

// Socket.io 연결 이벤트
io.on('connection', (socket) => {
    handleConnection(socket, io);
});

let roomLifecycleTimer = null;

// 서버 시작
async function startServer() {
    try {
        httpServer.listen(PORT, () => {
            console.log(`✓ chat-service running on http://localhost:${PORT}`);
        });

        // 단일 서버 환경: 활성 룸의 멘토링 상태를 주기적으로 확인해 완료 시 강제 종료
        roomLifecycleTimer = setInterval(async () => {
            await closeCompletedMentoringRooms(io);
        }, 5000);
    } catch (error) {
        console.error('✗ Failed to start chat-service:', error);
        process.exit(1);
    }
}

// 종료 이벤트 처리
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');

    if (roomLifecycleTimer) {
        clearInterval(roomLifecycleTimer);
        roomLifecycleTimer = null;
    }

    // 종료 시 활성 룸 모두 닫기
    const rooms = Array.from(io.sockets.adapter.rooms.keys())
        .filter((roomName) => roomName.startsWith('mentoring:'));

    for (const roomName of rooms) {
        const mentoringId = roomName.replace('mentoring:', '');
        await closeMentoringRoom(io, mentoringId, 'SERVER_SHUTDOWN');
    }

    await global.prisma.$disconnect();
    httpServer.close(() => {
        process.exit(0);
    });
});

startServer();

export { io, httpServer };
