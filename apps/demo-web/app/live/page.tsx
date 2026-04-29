/*
****************************************************************
1:N 멘토링 비디오/오디오 동작 확인을 위해 임시로 추가한 페이지입니다.
프론트 구현 시 참고용으로만 활용하시고, 실제로는 별도의 UI/UX로 구현하시면 됩니다.

http://localhost:3000/mentoring/live

1. 상단 주소 접속, 사용자(멘토) userId 입력 후 "멘토링 시작 후 멘토로 접속" 버튼 클릭
    -> 멘토링 생성("멘토링 ID"가 자동 생성됨) + "멘토 로컬 비디오"로 자신의 영상 확인 가능
2. 다른 탭에서 상단 주소 접속 후 사용자(멘티) userId 입력, 1번에서 확인한 멘토링 ID를 입력하여 멘토링에 참여
    -> "멘티 수신 비디오/오디오"로 멘토의 영상과 음성 확인 가능
****************************************************************
*/

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import { io, type Socket } from 'socket.io-client';

type TransportConnectPayload = {
    dtlsParameters: unknown;
};

type ProducerPayload = {
    transportId?: string;
    kind: 'audio' | 'video';
    rtpParameters: unknown;
    appData?: Record<string, unknown>;
};

type ConsumerPayload = {
    transportId?: string;
    producerId: string;
    rtpCapabilities: unknown;
};

type JoinResponse = {
    peerId: string;
    routerRtpCapabilities: unknown;
    existingProducerIds: Array<{
        producerId: string;
        peerId: string;
        kind: 'audio' | 'video';
        role: 'mentor' | 'mentee' | 'tts-bot';
    }>;
};

type RpcMessage = {
    requestId?: string;
    action?: string;
    ok?: boolean;
    data?: unknown;
    error?: string;
    event?: string;
};

type PendingResolver = {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
};

const HTTP_BASE = process.env.NEXT_PUBLIC_MEDIA_SERVER_HTTP_URL ?? 'http://localhost:4002';
const SOCKET_BASE = process.env.NEXT_PUBLIC_MEDIA_SERVER_SOCKET_URL ?? HTTP_BASE;

const MENTOR_DEFAULT_TITLE = '실시간 멘토링 세션';

function createRequestId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function LiveMentoringPage() {
    const [role, setRole] = useState<'mentor' | 'mentee'>('mentee');
    const [mentoringIdInput, setMentoringIdInput] = useState('');
    const [userIdInput, setUserIdInput] = useState('101');
    const [connectedMentoringId, setConnectedMentoringId] = useState<number | null>(null);
    const [status, setStatus] = useState('대기 중');
    const [errorMessage, setErrorMessage] = useState('');

    const socketRef = useRef<Socket | null>(null);
    const pendingRef = useRef<Map<string, PendingResolver>>(new Map());
    const deviceRef = useRef<Device | null>(null);
    const sendTransportRef = useRef<any>(null);
    const recvTransportRef = useRef<any>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream>(new MediaStream());
    const consumedProducerIdsRef = useRef<Set<string>>(new Set());
    const peerIdRef = useRef<string | null>(null);

    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    const canJoinAsMentee = useMemo(() => Number.isFinite(Number(mentoringIdInput)), [mentoringIdInput]);

    const parseUserIdInput = useCallback(() => {
        const parsed = Number(userIdInput);

        if (!Number.isFinite(parsed)) {
            throw new Error('userId는 숫자여야 합니다.');
        }

        return parsed;
    }, [userIdInput]);

    const closeConnections = useCallback(async () => {
        try {
            if (socketRef.current?.connected) {
                const requestId = createRequestId();
                socketRef.current.emit('signal', {
                    requestId,
                    action: 'leaveMentoring',
                    data: {}
                });
            }
        } catch {
            // no-op
        }

        sendTransportRef.current?.close?.();
        recvTransportRef.current?.close?.();
        sendTransportRef.current = null;
        recvTransportRef.current = null;

        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;

        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
        }

        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }

        remoteStreamRef.current = new MediaStream();
        consumedProducerIdsRef.current.clear();

        pendingRef.current.forEach(({ reject }) => reject(new Error('Connection closed')));
        pendingRef.current.clear();

        socketRef.current?.disconnect();
        socketRef.current = null;
        deviceRef.current = null;
        peerIdRef.current = null;
        setConnectedMentoringId(null);
    }, []);

    const rpc = useCallback(async <T,>(action: string, data: Record<string, unknown>) => {
        const socket = socketRef.current;

        if (!socket || !socket.connected) {
            throw new Error('Socket.IO가 연결되지 않았습니다.');
        }

        const requestId = createRequestId();

        const responsePromise = new Promise<T>((resolve, reject) => {
            pendingRef.current.set(requestId, { resolve, reject });
        });

        socket.emit('signal', {
            requestId,
            action,
            data
        });

        return responsePromise;
    }, []);

    const consumeProducer = useCallback(
        async (producerId: string, userId: number) => {
            if (!deviceRef.current || !recvTransportRef.current) {
                return;
            }

            if (consumedProducerIdsRef.current.has(producerId)) {
                return;
            }

            const consumeData = await rpc<{
                consumerId: string;
                producerId: string;
                kind: 'audio' | 'video';
                rtpParameters: unknown;
            }>('consume', {
                transportId: recvTransportRef.current.id,
                producerId,
                rtpCapabilities: deviceRef.current.rtpCapabilities,
                userId
            } as ConsumerPayload);

            const consumer = await recvTransportRef.current.consume({
                id: consumeData.consumerId,
                producerId: consumeData.producerId,
                kind: consumeData.kind,
                rtpParameters: consumeData.rtpParameters
            });

            remoteStreamRef.current.addTrack(consumer.track);

            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStreamRef.current;
            }

            await rpc('resumeConsumer', {
                consumerId: consumeData.consumerId
            });

            consumedProducerIdsRef.current.add(producerId);
        },
        [rpc]
    );

    const connectWebSocket = useCallback(
        async (mentoringId: number, selectedRole: 'mentor' | 'mentee', userId: number) => {
            await closeConnections();

            const socket = io(SOCKET_BASE, {
                path: '/socket.io',
                transports: ['websocket'],
                auth: {
                    userId: String(userId)
                }
            });

            socketRef.current = socket;

            socket.on('signal', (message: RpcMessage) => {
                try {
                    if (message.requestId) {
                        const pending = pendingRef.current.get(message.requestId);

                        if (!pending) {
                            return;
                        }

                        pendingRef.current.delete(message.requestId);

                        if (message.ok) {
                            pending.resolve(message.data);
                        } else {
                            pending.reject(new Error(message.error ?? 'Unknown signaling error'));
                        }

                        return;
                    }

                    if (message.event === 'new-producer') {
                        const producerData = message.data as {
                            producerId: string;
                            role: 'mentor' | 'mentee' | 'tts-bot';
                        };

                        if (selectedRole === 'mentee' && producerData.role === 'mentor') {
                            void consumeProducer(producerData.producerId, userId);
                        }
                    }
                } catch {
                    // no-op
                }
            });

            await new Promise<void>((resolve, reject) => {
                socket.on('connect', () => resolve());
                socket.on('connect_error', () => reject(new Error('Socket.IO 연결 실패')));
            });

            const joinResponse = await rpc<JoinResponse>('joinMentoring', {
                mentoringId,
                role: selectedRole,
                userId
            });

            peerIdRef.current = joinResponse.peerId;

            const device = new Device();
            await device.load({ routerRtpCapabilities: joinResponse.routerRtpCapabilities as any });
            deviceRef.current = device;

            if (selectedRole === 'mentor') {
                const sendTransportInfo = await rpc<{
                    transportId: string;
                    iceParameters: unknown;
                    iceCandidates: unknown;
                    dtlsParameters: unknown;
                }>('createWebRtcTransport', { direction: 'send' });

                const sendTransport = device.createSendTransport({
                    id: sendTransportInfo.transportId,
                    iceParameters: sendTransportInfo.iceParameters as any,
                    iceCandidates: sendTransportInfo.iceCandidates as any,
                    dtlsParameters: sendTransportInfo.dtlsParameters as any
                });

                sendTransport.on('connect', ({ dtlsParameters }: TransportConnectPayload, callback: () => void, errback: (error: Error) => void) => {
                    rpc('connectWebRtcTransport', {
                        transportId: sendTransport.id,
                        dtlsParameters
                    })
                        .then(() => callback())
                        .catch((error) => errback(error as Error));
                });

                sendTransport.on(
                    'produce',
                    (
                        { kind, rtpParameters, appData }: ProducerPayload,
                        callback: ({ id }: { id: string }) => void,
                        errback: (error: Error) => void
                    ) => {
                        rpc<{ producerId: string }>('produce', {
                            transportId: sendTransport.id,
                            kind,
                            rtpParameters,
                            appData
                        })
                            .then((result) => callback({ id: result.producerId }))
                            .catch((error) => errback(error as Error));
                    }
                );

                sendTransportRef.current = sendTransport;

                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localStreamRef.current = stream;

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }

                const videoTrack = stream.getVideoTracks()[0];
                const audioTrack = stream.getAudioTracks()[0];

                if (videoTrack) {
                    await sendTransport.produce({ track: videoTrack, appData: { mediaTag: 'cam-video' } });
                }

                if (audioTrack) {
                    await sendTransport.produce({ track: audioTrack, appData: { mediaTag: 'cam-audio' } });
                }
            }

            if (selectedRole === 'mentee') {
                const recvTransportInfo = await rpc<{
                    transportId: string;
                    iceParameters: unknown;
                    iceCandidates: unknown;
                    dtlsParameters: unknown;
                }>('createWebRtcTransport', { direction: 'recv' });

                const recvTransport = device.createRecvTransport({
                    id: recvTransportInfo.transportId,
                    iceParameters: recvTransportInfo.iceParameters as any,
                    iceCandidates: recvTransportInfo.iceCandidates as any,
                    dtlsParameters: recvTransportInfo.dtlsParameters as any
                });

                recvTransport.on('connect', ({ dtlsParameters }: TransportConnectPayload, callback: () => void, errback: (error: Error) => void) => {
                    rpc('connectWebRtcTransport', {
                        transportId: recvTransport.id,
                        dtlsParameters
                    })
                        .then(() => callback())
                        .catch((error) => errback(error as Error));
                });

                recvTransportRef.current = recvTransport;

                const mentorProducerIds = joinResponse.existingProducerIds
                    .filter((item) => item.role === 'mentor')
                    .map((item) => item.producerId);

                for (const producerId of mentorProducerIds) {
                    await consumeProducer(producerId, userId);
                }
            }

            setConnectedMentoringId(mentoringId);
        },
        [closeConnections, consumeProducer, rpc]
    );

    const handleMentorStart = useCallback(async () => {
        setErrorMessage('');

        try {
            setStatus('멘토링 세션 생성 중...');

            const userId = parseUserIdInput();

            const response = await fetch(`${HTTP_BASE}/mentorings/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': String(userId)
                },
                body: JSON.stringify({
                    title: MENTOR_DEFAULT_TITLE,
                    isGroup: true
                })
            });

            if (!response.ok) {
                console.error('멘토링 생성 실패:', await response.text());
                throw new Error(`멘토링 생성 실패 (${response.status})`);
            }

            const result = (await response.json()) as {
                mentoring: {
                    mentoringId: number;
                };
            };

            const mentoringId = Number(result.mentoring.mentoringId);
            setMentoringIdInput(String(mentoringId));

            setStatus('멘토로 접속 중...');
            await connectWebSocket(mentoringId, 'mentor', userId);
            setRole('mentor');
            setStatus(`멘토 접속 완료 (멘토링 ID: ${mentoringId})`);
        } catch (error) {
            setStatus('오류 발생');
            setErrorMessage(error instanceof Error ? error.message : '알 수 없는 오류');
        }
    }, [connectWebSocket, parseUserIdInput]);

    const handleMenteeJoin = useCallback(async () => {
        setErrorMessage('');

        try {
            const mentoringId = Number(mentoringIdInput);
            const userId = parseUserIdInput();

            if (!Number.isFinite(mentoringId)) {
                throw new Error('mentoringId를 입력하세요.');
            }

            setStatus('멘티 접속 중...');
            await connectWebSocket(mentoringId, 'mentee', userId);
            setRole('mentee');
            setStatus(`멘티 접속 완료 (멘토링 ID: ${mentoringId})`);
        } catch (error) {
            setStatus('오류 발생');
            setErrorMessage(error instanceof Error ? error.message : '알 수 없는 오류');
        }
    }, [connectWebSocket, mentoringIdInput, parseUserIdInput]);

    useEffect(() => {
        return () => {
            void closeConnections();
        };
    }, [closeConnections]);

    return (
        <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
            <section className="mx-auto max-w-5xl space-y-6">
                <h1 className="text-2xl font-semibold">1:N 라이브 멘토링 최소 클라이언트</h1>

                <div className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 md:grid-cols-2">
                    <div className="space-y-3">
                        <p className="text-sm text-zinc-300">현재 역할: {role}</p>
                        <label className="block text-sm">
                            사용자 userId
                            <input
                                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
                                value={userIdInput}
                                onChange={(event) => setUserIdInput(event.target.value)}
                            />
                        </label>
                        <button
                            type="button"
                            onClick={handleMentorStart}
                            className="w-full rounded-md bg-emerald-600 px-3 py-2 font-medium hover:bg-emerald-500"
                        >
                            멘토링 시작 후 멘토로 접속
                        </button>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm">
                            멘토링 ID
                            <input
                                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
                                value={mentoringIdInput}
                                onChange={(event) => setMentoringIdInput(event.target.value)}
                                placeholder="예: 1"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={handleMenteeJoin}
                            disabled={!canJoinAsMentee}
                            className="w-full rounded-md bg-blue-600 px-3 py-2 font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            멘티로 접속
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                void closeConnections();
                                setStatus('연결 종료');
                            }}
                            className="w-full rounded-md bg-zinc-700 px-3 py-2 font-medium hover:bg-zinc-600"
                        >
                            연결 종료
                        </button>
                    </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-sm">
                    <p>상태: {status}</p>
                    <p>연결된 멘토링 ID: {connectedMentoringId ?? '-'}</p>
                    {errorMessage ? <p className="mt-2 text-red-400">오류: {errorMessage}</p> : null}
                    <p className="mt-2 text-zinc-400">Media HTTP: {HTTP_BASE}</p>
                    <p className="text-zinc-400">Media Socket.IO: {SOCKET_BASE} (path: /socket.io)</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
                        <p className="mb-2 text-sm font-medium">멘토 로컬 비디오</p>
                        <video ref={localVideoRef} autoPlay playsInline muted className="aspect-video w-full rounded-md bg-black" />
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
                        <p className="mb-2 text-sm font-medium">멘티 수신 비디오/오디오</p>
                        <video ref={remoteVideoRef} autoPlay playsInline controls className="aspect-video w-full rounded-md bg-black" />
                    </div>
                </div>
            </section>
        </main>
    );
}