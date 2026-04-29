import mediasoup from 'mediasoup';

// 기본적으로 지원할 미디어 코덱 설정
const DEFAULT_MEDIA_CODECS = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
    },
    {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
            'x-google-start-bitrate': 1000
        }
    }
];

// WebRTC 트랜스포트 생성 시 사용할 기본 옵션 설정
const DEFAULT_TRANSPORT_OPTIONS = {
    listenIps: [{ ip: '127.0.0.1', announcedIp: process.env.MEDIA_SERVER_ANNOUNCED_IP || undefined }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000
};

// 각 피어의 상태를 나타내는 객체를 생성하는 헬퍼 함수
function createPeer(peerId, role, socket) {
    return {
        peerId,
        role,
        socket,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map()
    };
}

function resolveBooleanOrFallback(value, fallbackValue = true) {
    if (typeof value === 'boolean') {
        return value;
    }

    return Boolean(fallbackValue);
}

// MediaSoup을 활용하여 멘토링 세션의 미디어 스트림을 관리하는 오케스트레이터 클래스
export class MediaSoupOrchestrator {
    constructor({ audioPipeline }) {
        this.audioPipeline = audioPipeline;
        this.worker = null;
        this.rooms = new Map();
    }

    // MediaSoup 워커를 초기화하는 메서드, 서버 시작 시 한 번 호출되어야 함
    async init() {
        this.worker = await mediasoup.createWorker({
            rtcMinPort: Number(process.env.MEDIA_SERVER_RTC_MIN_PORT || 40000),
            rtcMaxPort: Number(process.env.MEDIA_SERVER_RTC_MAX_PORT || 49999)
        });

        this.worker.on('died', () => {
            console.error('[mediasoup] worker died, exiting in 2 seconds');
            setTimeout(() => process.exit(1), 2000);
        });
    }

    // 현재 워커의 상태를 스냅샷 형태로 반환하는 메서드 (예: 헬스 체크 엔드포인트에서 사용)
    getHealthSnapshot() {
        return {
            workerPid: this.worker?.pid ?? null,
            roomCount: this.rooms.size
        };
    }

    // mentoringId에 해당하는 방이 존재하지 않으면 새로 생성하고, 이미 존재하면 해당 방을 반환하는 메서드
    async ensureRoom(mentoringId, options = {}) {
        const key = Number(mentoringId);
        const requestedIsGroup = resolveBooleanOrFallback(options.isGroup, true);

        if (this.rooms.has(key)) {
            const existingRoom = this.rooms.get(key);

            if (typeof options.isGroup === 'boolean' && existingRoom.isGroup !== requestedIsGroup) {
                throw new Error('이미 생성된 룸의 isGroup 설정과 요청 값이 일치하지 않습니다.');
            }

            return existingRoom;
        }

        const router = await this.worker.createRouter({ mediaCodecs: DEFAULT_MEDIA_CODECS });
        const room = {
            mentoringId: key,
            isGroup: requestedIsGroup,
            router,
            peers: new Map()
        };

        this.rooms.set(key, room);
        this.audioPipeline.ensureRoom(key);

        return room;
    }

    // mentoringId에 해당하는 방의 현재 상태를 스냅샷 형태로 반환하는 메서드 (예: 헬스 체크 엔드포인트에서 사용)
    getRoomSnapshot(mentoringId) {
        const room = this.rooms.get(Number(mentoringId));

        if (!room) {
            return null;
        }

        return {
            mentoringId: room.mentoringId,
            isGroup: room.isGroup,
            peers: [...room.peers.values()].map((peer) => ({
                peerId: peer.peerId,
                role: peer.role,
                transports: peer.transports.size,
                producers: peer.producers.size,
                consumers: peer.consumers.size
            })),
            audioPipeline: this.audioPipeline.getRoomSnapshot(mentoringId)
        };
    }

    async addPeer({ mentoringId, peerId, role, socket, isGroup }) {
        const room = await this.ensureRoom(mentoringId, { isGroup });

        if (room.peers.has(peerId)) {
            throw new Error(`Peer ${peerId}은 이미 방에 존재합니다.`);
        }

        if (role === 'mentor') {
            const mentorExists = [...room.peers.values()].some((peer) => peer.role === 'mentor');

            if (mentorExists) {
                throw new Error('이 멘토링은 이미 멘토가 있습니다.');
            }
        }

        if (!room.isGroup) {
            if (role !== 'mentor' && role !== 'mentee' && role !== 'tts-bot') {
                throw new Error('1:1 멘토링에서는 mentor/mentee/tts-bot role만 사용할 수 있습니다.');
            }

            if (role === 'mentee') {
                const menteeExists = [...room.peers.values()].some((peer) => peer.role === 'mentee');

                if (menteeExists) {
                    throw new Error('1:1 멘토링에는 멘티 1명만 참여할 수 있습니다.');
                }
            }

            if (role === 'tts-bot') {
                const ttsExists = [...room.peers.values()].some((peer) => peer.role === 'tts-bot');

                if (ttsExists) {
                    throw new Error('1:1 멘토링에는 tts-bot 1개만 연결할 수 있습니다.');
                }
            }
        }

        const peer = createPeer(peerId, role, socket);
        room.peers.set(peerId, peer);

        return {
            routerRtpCapabilities: room.router.rtpCapabilities,
            existingProducerIds: this.getProducerIdsForPeer(mentoringId, peerId)
        };
    }

    getProducerIdsForPeer(mentoringId, requestingPeerId) {
        const room = this.rooms.get(Number(mentoringId));

        if (!room) {
            return [];
        }

        const producerIds = [];

        for (const peer of room.peers.values()) {
            if (peer.peerId === requestingPeerId) {
                continue;
            }

            for (const producer of peer.producers.values()) {
                producerIds.push({
                    producerId: producer.id,
                    peerId: peer.peerId,
                    kind: producer.kind,
                    role: peer.role
                });
            }
        }

        return producerIds;
    }

    // WebRTC 트랜스포트를 생성하는 메서드, 클라이언트가 미디어를 송출하거나 수신하기 전에 호출되어야 함
    async createWebRtcTransport({ mentoringId, peerId, direction }) {
        const room = this.rooms.get(Number(mentoringId));
        const peer = room?.peers.get(peerId);

        if (!room || !peer) {
            throw new Error('멘토링 Room이나 Peer를 찾을 수 없습니다.');
        }

        const transport = await room.router.createWebRtcTransport(DEFAULT_TRANSPORT_OPTIONS);
        transport.appData = {
            peerId,
            mentoringId: Number(mentoringId),
            direction
        };

        transport.on('dtlsstatechange', (state) => {
            if (state === 'closed') {
                transport.close();
            }
        });

        peer.transports.set(transport.id, transport);

        return {
            transportId: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters
        };
    }

    // 클라이언트가 WebRTC 트랜스포트를 연결할 때 호출되는 메서드, DTLS 핸드셰이크를 완료하여 미디어 송수신이 가능하도록 함
    async connectTransport({ mentoringId, peerId, transportId, dtlsParameters }) {
        const transport = this.getPeerTransport({ mentoringId, peerId, transportId });
        await transport.connect({ dtlsParameters });
    }

    // 클라이언트가 미디어를 송출할 때 호출되는 메서드, 새로운 프로듀서를 생성하여 방에 연결함
    async produce({ mentoringId, peerId, transportId, kind, rtpParameters, appData }) {
        const room = this.rooms.get(Number(mentoringId));
        const peer = room?.peers.get(peerId);

        if (!room || !peer) {
            throw new Error('멘토링 Room이나 Peer를 찾을 수 없습니다.');
        }

        if (peer.role === 'mentee' && room.isGroup) {
            throw new Error('멘티는 1:N 멘토링에서 미디어를 송출할 수 없습니다.');
        }

        if (!room.isGroup && kind !== 'audio') {
            throw new Error('1:1 멘토링은 오디오만 송출할 수 있습니다.');
        }

        if (peer.role === 'tts-bot' && kind !== 'audio') {
            throw new Error('tts-bot role은 오디오 미디어만 송출할 수 있습니다.');
        }

        const transport = this.getPeerTransport({ mentoringId, peerId, transportId });
        const producer = await transport.produce({ kind, rtpParameters, appData });

        peer.producers.set(producer.id, producer);

        if (kind === 'audio') {
            if (peer.role === 'mentor') {
                this.audioPipeline.attachMentorAudioProducer(mentoringId, producer.id);
            }

            if (peer.role === 'mentee') {
                this.audioPipeline.attachMenteeAudioProducer(mentoringId, producer.id);
            }

            if (peer.role === 'tts-bot') {
                this.audioPipeline.attachTtsAudioProducer(mentoringId, producer.id);
            }
        }

        producer.on('transportclose', () => {
            peer.producers.delete(producer.id);
            this.audioPipeline.detachAudioProducer(mentoringId, producer.id);
        });

        return {
            producerId: producer.id
        };
    }

    async consume({ mentoringId, peerId, transportId, producerId, rtpCapabilities }) {
        const room = this.rooms.get(Number(mentoringId));
        const peer = room?.peers.get(peerId);

        if (!room || !peer) {
            throw new Error('멘토링 Room이나 Peer를 찾을 수 없습니다.');
        }

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
            throw new Error('클라이언트는 이 Producer를 Consume할 수 없습니다.');
        }

        const transport = this.getPeerTransport({ mentoringId, peerId, transportId });

        const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true
        });

        peer.consumers.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
            peer.consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
            peer.consumers.delete(consumer.id);
        });

        return {
            consumerId: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            producerPaused: consumer.producerPaused
        };
    }

    // 클라이언트가 일시 중지된 소비자를 다시 시작할 때 호출되는 메서드, 소비자의 상태를 업데이트하여 미디어 수신이 재개되도록 함
    async resumeConsumer({ mentoringId, peerId, consumerId }) {
        const room = this.rooms.get(Number(mentoringId));
        const peer = room?.peers.get(peerId);

        if (!room || !peer) {
            throw new Error('멘토링 Room이나 Peer를 찾을 수 없습니다.');
        }

        const consumer = peer.consumers.get(consumerId);

        if (!consumer) {
            throw new Error(`Consumer ${consumerId}를 찾을 수 없습니다.`);
        }

        await consumer.resume();
    }

    // mentoringId에 해당하는 방에서 특정 피어를 완전히 제거하는 메서드, 해당 피어의 모든 트랜스포트, 프로듀서, 소비자를 닫고 방에서 제거함
    removePeer({ mentoringId, peerId }) {
        const room = this.rooms.get(Number(mentoringId));

        if (!room) {
            return;
        }

        const peer = room.peers.get(peerId);

        if (!peer) {
            return;
        }

        for (const consumer of peer.consumers.values()) {
            consumer.close();
        }

        for (const producer of peer.producers.values()) {
            this.audioPipeline.detachAudioProducer(mentoringId, producer.id);
            producer.close();
        }

        for (const transport of peer.transports.values()) {
            transport.close();
        }

        room.peers.delete(peerId);
    }

    // mentoringId에 해당하는 방이 존재하면 해당 방을 완전히 제거하는 메서드, 방의 모든 피어를 제거하고 라우터를 닫으며 오디오 파이프라인 상태도 초기화함
    async closeRoom(mentoringId) {
        const key = Number(mentoringId);
        const room = this.rooms.get(key);

        if (!room) {
            return;
        }

        for (const peerId of room.peers.keys()) {
            this.removePeer({ mentoringId: key, peerId });
        }

        room.router.close();
        this.rooms.delete(key);
        this.audioPipeline.closeRoom(key);
    }

    // mentoringId에 해당하는 방에서 특정 트랜스포트를 조회하는 메서드, 트랜스포트가 존재하지 않으면 예외를 발생시킴
    getPeerTransport({ mentoringId, peerId, transportId }) {
        const room = this.rooms.get(Number(mentoringId));
        const peer = room?.peers.get(peerId);
        const transport = peer?.transports.get(transportId);

        if (!transport) {
            throw new Error(`Transport ${transportId}를 찾을 수 없습니다.`);
        }

        return transport;
    }
}
