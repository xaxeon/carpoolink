import { Server } from 'socket.io';

function parseUserId(rawUserId) {
    if (rawUserId === undefined || rawUserId === null || rawUserId === '') {
        return null;
    }

    try {
        return Number(BigInt(rawUserId));
    } catch {
        return null;
    }
}

function resolveUserIdFromSocket(socket, data = {}) {
    const fromPayload = parseUserId(data.userId);

    if (fromPayload !== null) {
        return fromPayload;
    }

    const fromAuth = parseUserId(socket.handshake.auth?.userId);

    if (fromAuth !== null) {
        return fromAuth;
    }

    const fromHeader = parseUserId(socket.handshake.headers['x-user-id']);

    if (fromHeader !== null) {
        return fromHeader;
    }

    return parseUserId(socket.handshake.query?.userId);
}

function sendReply(socket, requestId, data) {
    socket.emit('signal', {
        requestId,
        ok: true,
        data
    });
}

function sendError(socket, requestId, error) {
    socket.emit('signal', {
        requestId,
        ok: false,
        error: error?.message ?? 'Unhandled signaling error'
    });
}

export function createSignalingServer({ httpServer, mediaOrchestrator, mentoringRepository, audioPipeline }) {
    const io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    const socketContext = new Map();

    function notifyPeers(mentoringId, event, payload, exceptPeerId = null) {
        const room = mediaOrchestrator.rooms.get(Number(mentoringId));

        if (!room) {
            return;
        }

        for (const peer of room.peers.values()) {
            if (exceptPeerId && peer.peerId === exceptPeerId) {
                continue;
            }

            peer.socket.emit('signal', {
                event,
                data: payload
            });
        }
    }

    io.on('connection', (socket) => {
        socket.on('signal', async (message = {}) => {
            const { requestId, action, data = {} } = message;

            try {
                switch (action) {
                    case 'joinMentoring': {
                        const mentoringId = Number(data.mentoringId);
                        const role = data.role ?? 'mentee';
                        const peerId = data.peerId ?? socket.id;

                        if (!Number.isFinite(mentoringId)) {
                            throw new Error('유효하지 않은 멘토링 ID입니다.');
                        }

                        const mentoring = await mentoringRepository.getMentoringById(mentoringId);

                        if (!mentoring || mentoring.status !== 'ON_AIR') {
                            throw new Error('멘토링 세션이 진행 중이 아닙니다.');
                        }

                        const userId = resolveUserIdFromSocket(socket, data);

                        if (role === 'mentor') {
                            if (userId === null) {
                                throw new Error('멘토 권한이 필요합니다.');
                            }

                            await mentoringRepository.assertMentorUser(userId);

                            if (Number(mentoring.userId) !== Number(userId)) {
                                throw new Error('멘토링 세션에 참여할 권한이 없습니다.');
                            }
                        }

                        const joinResult = await mediaOrchestrator.addPeer({
                            mentoringId,
                            peerId,
                            role,
                            socket,
                            isGroup: mentoring.isGroup
                        });

                        socketContext.set(socket.id, { mentoringId, peerId, role, userId });

                        sendReply(socket, requestId, {
                            peerId,
                            ...joinResult,
                            audioPipeline: audioPipeline.getRoomSnapshot(mentoringId)
                        });

                        notifyPeers(
                            mentoringId,
                            'peer-joined',
                            {
                                peerId,
                                role
                            },
                            peerId
                        );
                        break;
                    }
                    case 'createWebRtcTransport': {
                        const context = socketContext.get(socket.id);

                        if (!context) {
                            throw new Error('joinMentoring이 먼저 호출되어야 합니다.');
                        }

                        const transport = await mediaOrchestrator.createWebRtcTransport({
                            mentoringId: context.mentoringId,
                            peerId: context.peerId,
                            direction: data.direction ?? 'recv'
                        });

                        sendReply(socket, requestId, transport);
                        break;
                    }
                    case 'connectWebRtcTransport': {
                        const context = socketContext.get(socket.id);

                        if (!context) {
                            throw new Error('joinMentoring이 먼저 호출되어야 합니다.');
                        }

                        await mediaOrchestrator.connectTransport({
                            mentoringId: context.mentoringId,
                            peerId: context.peerId,
                            transportId: data.transportId,
                            dtlsParameters: data.dtlsParameters
                        });

                        sendReply(socket, requestId, { connected: true });
                        break;
                    }
                    case 'produce': {
                        const context = socketContext.get(socket.id);

                        if (!context) {
                            throw new Error('joinMentoring이 먼저 호출되어야 합니다.');
                        }

                        const produced = await mediaOrchestrator.produce({
                            mentoringId: context.mentoringId,
                            peerId: context.peerId,
                            transportId: data.transportId,
                            kind: data.kind,
                            rtpParameters: data.rtpParameters,
                            appData: data.appData
                        });

                        sendReply(socket, requestId, produced);

                        notifyPeers(
                            context.mentoringId,
                            'new-producer',
                            {
                                producerId: produced.producerId,
                                peerId: context.peerId,
                                kind: data.kind,
                                role: context.role
                            },
                            context.peerId
                        );
                        break;
                    }
                    case 'consume': {
                        const context = socketContext.get(socket.id);

                        if (!context) {
                            throw new Error('joinMentoring이 먼저 호출되어야 합니다.');
                        }

                        const userId = resolveUserIdFromSocket(socket, data);

                        if (userId === null) {
                            throw new Error('consume를 위해 x-user-id가 필요합니다.');
                        }

                        await mentoringRepository.ensureMentoringParticipant({
                            mentoringId: context.mentoringId,
                            userId
                        });

                        const consumed = await mediaOrchestrator.consume({
                            mentoringId: context.mentoringId,
                            peerId: context.peerId,
                            transportId: data.transportId,
                            producerId: data.producerId,
                            rtpCapabilities: data.rtpCapabilities
                        });

                        sendReply(socket, requestId, consumed);
                        break;
                    }
                    case 'resumeConsumer': {
                        const context = socketContext.get(socket.id);

                        if (!context) {
                            throw new Error('joinMentoring이 먼저 호출되어야 합니다.');
                        }

                        await mediaOrchestrator.resumeConsumer({
                            mentoringId: context.mentoringId,
                            peerId: context.peerId,
                            consumerId: data.consumerId
                        });

                        sendReply(socket, requestId, { resumed: true });
                        break;
                    }
                    case 'listProducers': {
                        const context = socketContext.get(socket.id);

                        if (!context) {
                            throw new Error('joinMentoring이 먼저 호출되어야 합니다.');
                        }

                        const producerIds = mediaOrchestrator.getProducerIdsForPeer(
                            context.mentoringId,
                            context.peerId
                        );

                        sendReply(socket, requestId, producerIds);
                        break;
                    }
                    case 'ttsEnqueue': {
                        const context = socketContext.get(socket.id);

                        if (!context) {
                            throw new Error('joinMentoring이 먼저 호출되어야 합니다.');
                        }

                        audioPipeline.enqueueTtsMessage(context.mentoringId, {
                            peerId: context.peerId,
                            text: data.text,
                            metadata: data.metadata ?? null
                        });

                        sendReply(socket, requestId, {
                            queued: true,
                            message: 'TTS request queued; attach a tts-bot audio producer to inject actual synthesized audio'
                        });
                        break;
                    }
                    case 'leaveMentoring': {
                        const context = socketContext.get(socket.id);

                        if (!context) {
                            sendReply(socket, requestId, { left: true });
                            break;
                        }

                        mediaOrchestrator.removePeer({
                            mentoringId: context.mentoringId,
                            peerId: context.peerId
                        });

                        notifyPeers(
                            context.mentoringId,
                            'peer-left',
                            { peerId: context.peerId },
                            context.peerId
                        );

                        socketContext.delete(socket.id);
                        sendReply(socket, requestId, { left: true });
                        break;
                    }
                    default:
                        throw new Error(`알 수 없는 signaling 액션: ${action}`);
                }
            } catch (error) {
                sendError(socket, requestId, error);
            }
        });

        socket.on('disconnect', () => {
            const context = socketContext.get(socket.id);

            if (!context) {
                return;
            }

            mediaOrchestrator.removePeer({
                mentoringId: context.mentoringId,
                peerId: context.peerId
            });

            notifyPeers(
                context.mentoringId,
                'peer-left',
                { peerId: context.peerId },
                context.peerId
            );

            socketContext.delete(socket.id);
        });
    });

    return io;
}
