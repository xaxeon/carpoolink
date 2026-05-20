import {
    saveChatMessage,
    getMentoringStatus,
    verifyChatJoinAccess,
} from '../database/chatRepository.js';
import axios from "axios";

const activeConnections = new Map(); // userId(string) -> Set<socketId>
const socketStates = new Map(); // socketId -> { userId, userName, mentoringId }
const activeMentoringRooms = new Set(); // mentoringId(string)

function parseMentoringId(value) {
    try {
        if (value === undefined || value === null || value === '') {
            return null;
        }
        return BigInt(value);
    } catch {
        return null;
    }
}

function parseUserId(value) {
    try {
        if (value === undefined || value === null || value === '') {
            return null;
        }
        return BigInt(value);
    } catch {
        return null;
    }
}

function getRoomName(mentoringId) {
    return `mentoring:${mentoringId}`;
}

async function assertMentoringOnAir(mentoringIdInput) {
    const mentoringId = parseMentoringId(mentoringIdInput);
    if (!mentoringId) {
        return { ok: false, error: '유효하지 않은 멘토링 ID입니다.' };
    }

    const mentoring = await getMentoringStatus(mentoringId);
    if (!mentoring) {
        return { ok: false, error: '해당 멘토링이 존재하지 않습니다.' };
    }

    if (mentoring.status !== 'ON_AIR') {
        return { ok: false, error: `현재 멘토링 상태(${mentoring.status})에서는 채팅할 수 없습니다.` };
    }

    return { ok: true, mentoringId };
}

async function assertChatJoinAccess(mentoringIdInput, userIdInput) {
    const mentoringId = parseMentoringId(mentoringIdInput);
    if (!mentoringId) {
        return { ok: false, error: '유효하지 않은 멘토링 ID입니다.' };
    }

    const userId = parseUserId(userIdInput);
    if (!userId) {
        return { ok: false, error: '유효하지 않은 사용자 ID입니다.' };
    }

    const access = await verifyChatJoinAccess(mentoringId, userId);
    if (!access.ok) {
        return access;
    }

    return {
        ok: true,
        mentoringId,
        userId,
    };
}

function getSocketRoomUserCount(io, mentoringId) {
    const roomName = getRoomName(mentoringId);
    const sockets = io.sockets.adapter.rooms.get(roomName);
    return sockets ? sockets.size : 0;
}

function removeSocketTracking(socketId) {
    const state = socketStates.get(socketId);
    if (!state) {
        return null;
    }

    const { userId, mentoringId } = state;
    const userKey = String(userId);
    const mentoringKey = String(mentoringId);

    if (activeConnections.has(userKey)) {
        const set = activeConnections.get(userKey);
        set.delete(socketId);
        if (set.size === 0) {
            activeConnections.delete(userKey);
        }
    }

    socketStates.delete(socketId);
    return { userId: userKey, mentoringId: mentoringKey, userName: state.userName };
}

export async function closeMentoringRoom(io, mentoringIdInput, reason = 'MENTORING_COMPLETED') {
    const mentoringId = parseMentoringId(mentoringIdInput);
    if (!mentoringId) {
        return;
    }

    const mentoringKey = mentoringId.toString();
    const roomName = getRoomName(mentoringKey);
    const sockets = await io.in(roomName).fetchSockets();

    io.to(roomName).emit('room_closed', {
        mentoringId: mentoringKey,
        reason,
        timestamp: new Date(),
    });

    for (const roomSocket of sockets) {
        removeSocketTracking(roomSocket.id);
        roomSocket.leave(roomName);
    }

    activeMentoringRooms.delete(mentoringKey);
    console.log(`[Room] Closed mentoring room ${mentoringKey} (${reason})`);
}

export async function closeCompletedMentoringRooms(io) {
    for (const mentoringId of Array.from(activeMentoringRooms)) {
        try {
            const mentoring = await getMentoringStatus(BigInt(mentoringId));
            if (!mentoring || mentoring.status === 'COMPLETED') {
                await closeMentoringRoom(io, mentoringId, 'MENTORING_COMPLETED');
            }
        } catch (error) {
            console.error(`[RoomMonitor] Failed to verify mentoring ${mentoringId}:`, error);
        }
    }
}

/**
 * Socket.io 연결 이벤트 처리
 */
export async function handleConnection(socket, io) {
    console.log(`[Socket] New connection: ${socket.id}`);

    function replyJoinAck(callback, payload) {
        if (typeof callback === 'function') {
            callback(payload);
        }
    }

    /**
     * 채팅룸 입장
     * 클라이언트에서 전송: { mentoringId, userId, userName }
     */
    socket.on('join_chat', async (data, callback) => {
        try {
            const { mentoringId, userId, userName } = data;

            if (!mentoringId || !userId) {
                const errorPayload = { message: '유효하지 않은 파라미터입니다.' };
                socket.emit('error', errorPayload);
                replyJoinAck(callback, { ok: false, error: errorPayload.message });
                return;
            }

            const existingState = socketStates.get(socket.id);
            if (existingState) {
                const errorPayload = { message: '이미 채팅방에 입장해 있습니다. 먼저 leave_chat을 호출하세요.' };
                socket.emit('error', errorPayload);
                replyJoinAck(callback, { ok: false, error: errorPayload.message });
                return;
            }

            const access = await assertChatJoinAccess(mentoringId, userId);
            if (!access.ok) {
                socket.emit('error', { message: access.error });
                replyJoinAck(callback, { ok: false, error: access.error });
                return;
            }

            const mentoringKey = access.mentoringId.toString();
            const userKey = access.userId.toString();

            const roomName = getRoomName(mentoringKey);
            socket.join(roomName);

            // 활성 연결 추적
            if (!activeConnections.has(userKey)) {
                activeConnections.set(userKey, new Set());
            }
            activeConnections.get(userKey).add(socket.id);
            socketStates.set(socket.id, {
                userId: userKey,
                userName: userName || 'anonymous',
                mentoringId: mentoringKey,
            });
            activeMentoringRooms.add(mentoringKey);

            // 해당 룸에 입장 알림 전송
            const userCount = getSocketRoomUserCount(io, mentoringKey);
            io.to(roomName).emit('user_joined', {
                userId: userKey,
                nickname: userName,
                userCount,
                timestamp: new Date(),
            });

            console.log(`[Chat] User ${userKey} joined room ${mentoringKey}`);
            replyJoinAck(callback, {
                ok: true,
                data: {
                    mentoringId: mentoringKey,
                    userId: userKey,
                },
            });
        } catch (error) {
            console.error('Error in join_chat:', error);
            const errorPayload = { message: '채팅방에 입장하는 데 실패했습니다.' };
            socket.emit('error', errorPayload);
            replyJoinAck(callback, { ok: false, error: errorPayload.message });
        }
    });

    /**
     * 채팅 메시지 수신
     * 클라이언트에서 전송: { mentoringId, userId, userName, content }
     */
    socket.on('send_message', async (data) => {
        try {
            const { mentoringId, content } = data;
            const state = socketStates.get(socket.id);

            if (!state) {
                socket.emit('error', { message: '먼저 채팅방에 입장해야 합니다.' });
                return;
            }

            if (!mentoringId || !content) {
                socket.emit('error', { message: '유효하지 않은 메시지 데이터입니다.' });
                return;
            }

            // 메시지 길이 검증 (DB 스키마: VarChar(200))
            if (content.length > 200) {
                socket.emit('error', { message: '메시지 최대 길이는 200자입니다.' });
                return;
            }

            const mentoringKey = String(mentoringId);
            if (state.mentoringId !== mentoringKey) {
                socket.emit('error', { message: '입장한 채팅방과 다른 mentoringId 입니다.' });
                return;
            }

            const roomName = getRoomName(mentoringKey);
            if (!socket.rooms.has(roomName)) {
                socket.emit('error', { message: '먼저 채팅방에 입장해야 합니다.' });
                return;
            }

            // 1. Question Service(4003) 호출하여 질문 여부 판별
            let isQuestion = false;
            try {
                const QUESTION_API_URL = process.env.QUESTION_SERVICE_URL || 'http://localhost:4003';
                const mlResponse = await axios.post(`${QUESTION_API_URL}/api/question-detection/predict`, {
                    text: content
                });
                const result = mlResponse.data;
                isQuestion = result.prediction === 'question' || result.is_question === true || result.isQuestion === true;
            } catch (mlError) {
                console.error('⚠️ [Question Detector] ML API 에러:', mlError.message);
            }

            // 2. 무조건 MentoringChat 테이블에 채팅 내역 저장
            const chatMessage = await prisma.mentoringChat.create({
                data: {
                    mentoringId: BigInt(state.mentoringId),
                    userId: BigInt(state.userId),
                    content: content
                }
            });

            // 💡 3. [핵심] 질문으로 판별되었다면 Question 테이블에도 복사본 생성!
            let savedQuestion = null;
            if (isQuestion) {
                savedQuestion = await prisma.question.create({
                    data: {
                        content: content,
                        isPaid: false,      // 채팅방 기본 질문이므로 무료(false)로 설정
                        isPrivate: false,   // 공개 채팅방이므로 공개(false)로 설정
                        userId: BigInt(state.userId),
                        mentoringId: BigInt(state.mentoringId),
                        // priorityScore(0), status(BEFORE), createdAt(now)는 schema.prisma의 @default 값 자동 적용
                    }
                });
                console.log(`✅ [Question Saved] 질문 테이블 등록 완료 (ID: ${savedQuestion.questionId})`);
            }

            // 4. 실시간 브로드캐스트 (프론트엔드로 전송)
            io.to(roomName).emit('new_message', {
                mentoringChatId: chatMessage.mentoringChatId.toString(),
                mentoringId: chatMessage.mentoringId.toString(),
                userId: state.userId,
                userName: state.userName,
                content,
                createdAt: chatMessage.createdAt,
                isQuestion: isQuestion, // 프론트엔드 UI용
                questionId: savedQuestion ? savedQuestion.questionId.toString() : null // 추후 질문 패널 연동용
            });
        } catch (error) {
            console.error('Error in send_message:', error);
            socket.emit('error', { message: '메시지를 저장하는 데 실패했습니다.' });
        }
    });

    /**
     * 채팅 메시지 히스토리 조회
     * 클라이언트에서 전송: { mentoringId, limit, offset }
     */
    socket.on('get_message_history', async (data) => {
        try {
            const { mentoringId, limit = 50, offset = 0 } = data;
            const state = socketStates.get(socket.id);

            if (!state) {
                socket.emit('error', { message: '먼저 채팅방에 입장해야 합니다.' });
                return;
            }

            const mentoringKey = String(mentoringId);
            if (state.mentoringId !== mentoringKey) {
                socket.emit('error', { message: '입장한 채팅방과 다른 mentoringId 입니다.' });
                return;
            }

            const targetMentoringId = BigInt(state.mentoringId);

            // 💡 [동적 매핑 1단계] 두 테이블을 동시에 병렬(Promise.all) 조회하여 성능 최적화
            const [messages, questions] = await Promise.all([
                // Prisma에서 메시지 히스토리 조회
                global.prisma.mentoringChat.findMany({
                    where: { mentoringId: targetMentoringId },
                    include: {
                        user: {
                            select: { userId: true, nickname: true },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                    take: limit,
                    skip: offset,
                }),
                // 동일한 멘토링 방의 질문 테이블 조회 (질문 여부 체크용)
                global.prisma.question.findMany({
                    where: { mentoringId: targetMentoringId },
                    select: { questionId: true, content: true, userId: true }
                })
            ]);

            // 💡 [동적 매핑 2단계] 빠른 비교를 위해 질문 데이터를 고유 키(작성자ID + 내용) 형태의 Map으로 변환
            const questionLookupMap = new Map();
            questions.forEach((q) => {
                const lookupKey = `${q.userId.toString()}_${q.content.trim()}`;
                questionLookupMap.set(lookupKey, q.questionId.toString());
            });

            // 💡 [동적 매핑 3단계] 채팅 히스토리에 질문 데이터가 매칭되는지 확인 후 결과 조립
            const formattedMessages = messages.map((msg) => {
                const messageKey = `${msg.userId.toString()}_${msg.content.trim()}`;
                
                // Map에 해당 key가 존재한다면 질문 테이블에 등록된 데이터임
                const matchedQuestionId = questionLookupMap.get(messageKey) || null;
                const isQuestion = matchedQuestionId !== null;

                return {
                    mentoringChatId: msg.mentoringChatId.toString(),
                    mentoringId: msg.mentoringId.toString(),
                    userId: msg.userId.toString(),
                    userName: msg.user.nickname,
                    content: msg.content,
                    createdAt: msg.createdAt,
                    isQuestion: isQuestion,               // ⬅️ 프론트엔드 실시간 UI 하이라이트용 고유 플래그
                    questionId: matchedQuestionId,       // ⬅️ 추후 확장될 질문 관리 및 모아보기 연동용 ID
                };
            });

            socket.emit('message_history', formattedMessages);
        } catch (error) {
            console.error('Error in get_message_history:', error);
            socket.emit('error', { message: '메시지 내역을 불러오는 데 실패했습니다.' });
        }
    });

    /**
     * 현재 룸의 온라인 사용자 목록 조회
     * 클라이언트에서 전송: { mentoringId }
     */
    socket.on('get_online_users', async (data) => {
        try {
            const { mentoringId } = data;
            const state = socketStates.get(socket.id);

            if (!state) {
                socket.emit('error', { message: '먼저 채팅방에 입장해야 합니다.' });
                return;
            }

            const mentoringKey = String(mentoringId);
            if (state.mentoringId !== mentoringKey) {
                socket.emit('error', { message: '입장한 채팅방과 다른 mentoringId 입니다.' });
                return;
            }

            const userCount = getSocketRoomUserCount(io, mentoringKey);

            socket.emit('online_users', {
                mentoringId: mentoringKey,
                userCount,
                timestamp: new Date(),
            });

            console.log(`[Users] Mentoring ${mentoringKey} has ${userCount} online users`);
        } catch (error) {
            console.error('Error in get_online_users:', error);
            socket.emit('error', { message: '온라인 사용자 정보를 불러오는 데 실패했습니다.' });
        }
    });

    /**
     * 채팅룸 나가기
     * 클라이언트에서 전송: { mentoringId, userId, userName }
     */
    socket.on('leave_chat', async (data) => {
        try {
            const state = socketStates.get(socket.id);
            if (!state) {
                return;
            }

            const { mentoringId } = data;

            if (!mentoringId) {
                socket.emit('error', { message: '유효하지 않은 파라미터입니다.' });
                return;
            }

            const mentoringKey = String(mentoringId);
            if (state.mentoringId !== mentoringKey) {
                socket.emit('error', { message: '입장한 채팅방과 다른 mentoringId 입니다.' });
                return;
            }

            const roomName = getRoomName(mentoringKey);
            socket.leave(roomName);

            // 활성 연결 제거
            const removedState = removeSocketTracking(socket.id);

            // 나간 사용자 알림
            const userCount = getSocketRoomUserCount(io, mentoringKey);
            if (userCount === 0) {
                activeMentoringRooms.delete(mentoringKey);
            }

            io.to(roomName).emit('user_left', {
                userId: removedState?.userId ?? state.userId,
                userName: removedState?.userName ?? state.userName,
                userCount,
                timestamp: new Date(),
            });

            console.log(`[Chat] User ${removedState?.userId ?? state.userId} left room ${mentoringId}`);
        } catch (error) {
            console.error('Error in leave_chat:', error);
        }
    });

    /**
     * 연결 해제 이벤트
     */
    socket.on('disconnect', async () => {
        console.log(`[Socket] Disconnected: ${socket.id}`);

        const state = removeSocketTracking(socket.id);
        if (!state) {
            return;
        }

        const roomName = getRoomName(state.mentoringId);
        const userCount = getSocketRoomUserCount(io, state.mentoringId);
        if (userCount === 0) {
            activeMentoringRooms.delete(state.mentoringId);
        }

        io.to(roomName).emit('user_left', {
            userId: state.userId,
            userName: state.userName,
            userCount,
            timestamp: new Date(),
        });
    });

    /**
     * 오류 처리
     */
    socket.on('error', (error) => {
        console.error(`[Socket Error] ${socket.id}:`, error);
    });
}

/**
 * 특정 멘토링의 모든 클라이언트에게 메시지 브로드캐스트
 */
export function broadcastToMentoring(io, mentoringId, event, data) {
    const roomName = getRoomName(mentoringId);
    io.to(roomName).emit(event, data);
}

/**
 * 활성 연결 정보 조회
 */
export function getActiveConnections() {
    return activeConnections;
}

export function getActiveMentoringIds() {
    return Array.from(activeMentoringRooms.values());
}
