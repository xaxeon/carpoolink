import { useEffect, useRef, useState, useCallback, use } from "react";
import { Device, types as MediaSoupTypes } from "mediasoup-client";
import { Socket } from "socket.io-client";
import { resolve } from "path";

interface WebRtcSessionConfig {
    socket: Socket | null;
    mentoringId: string;
    peerId: string;
    role: string;
    mentoringType?: "GROUP" | "ONE_ON_ONE";
    onRemoteStream?: (stream: MediaStream) => void;
    onError?: (error: string) => void;
}

export interface WebRtcSessionState {
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    isCameraOn: boolean;
    isMicOn: boolean;
    setCameraOn: (on: boolean) => Promise<void>;
    setMicOn: (on: boolean) => Promise<void>;
    isReady: boolean;
    error: string | null;
}

export function useWebRtcSession(config: WebRtcSessionConfig): WebRtcSessionState {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState(new Map<string, MediaStream>());
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const deviceRef = useRef<Device | null>(null);
    const sendTransportRef = useRef<MediaSoupTypes.Transport | null>(null);
    const recvTransportRef = useRef<MediaSoupTypes.Transport | null>(null);
    const producersRef = useRef<Map<string, MediaSoupTypes.Producer>>(new Map());
    const consumersRef = useRef<Map<string, MediaSoupTypes.Consumer>>(new Map());
    const isMountedRef = useRef(true);
    const isInitializingRef = useRef(false);

    // 1. 로컬 미디어 스트림 획득
    const initLocalStream = useCallback(async () => {
        const needsVideo = (config.role === "MENTOR" && config.mentoringType === "GROUP");
        const needsAudio = config.role === "MENTOR" || (config.role === "MENTEE" && config.mentoringType === "ONE_ON_ONE");

        if (!needsVideo && !needsAudio) {
            setIsCameraOn(false);
            setIsMicOn(false);
            return null;
        }

        try {
            console.log("📷 Requesting getUserMedia...");
            const stream = await navigator.mediaDevices.getUserMedia({
                video: needsVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
                audio: needsAudio,
            });

            console.log("✅ Local stream acquired:", {
                videoTracks: stream.getVideoTracks().length,
                audioTracks: stream.getAudioTracks().length,
            });

            if (isMountedRef.current) {
                setLocalStream(stream);
                // 트랙 상태 초기화
                stream.getVideoTracks().forEach((track) => {
                    track.enabled = isCameraOn;
                    console.log("📹 Video track enabled:", track.enabled);
                });
                stream.getAudioTracks().forEach((track) => {
                    track.enabled = isMicOn;
                    console.log("🎤 Audio track enabled:", track.enabled);
                });
            }

            return stream;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "미디어 장치 접근 실패";
            console.error("❌ getUserMedia failed:", errorMsg);
            if (isMountedRef.current) {
                setError(errorMsg);
            }
            throw err;
        }
    }, [isCameraOn, isMicOn, config.role, config.mentoringType]);

    // 2. mediasoup Device 초기화
    const initDevice = useCallback(async () => {
        try {
            if (!config.socket?.connected) {
                throw new Error("소켓이 연결되지 않았습니다");
            }

            console.log("🔧 Getting RTP Capabilities...");

            // RTP Capabilities 요청
            const { data: rouRtpCapabilities } = await new Promise<{ data: any }>((resolve, reject) => {
                config.socket?.emit(
                    "signal",
                    {
                        requestId: `get-rtp-caps-${Date.now()}`,
                        action: "getRtpCapabilities",
                        data: {},
                    },
                    (response: any) => {
                        if (response?.ok) {
                            console.log("✅ Got RTP Capabilities");
                            resolve(response);
                        } else {
                            console.error("❌ Failed to get RTP Capabilities:", response?.error);
                            reject(new Error(response?.error || "RTP 능력 조회 실패"));
                        }
                    }
                );
            });

            console.log("🚀 Loading MediaSoup device...");
            const device = new Device();
            await device.load({ routerRtpCapabilities: rouRtpCapabilities });
            console.log("✅ MediaSoup device loaded");

            if (isMountedRef.current) {
                deviceRef.current = device;
            }

            return device;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Device 초기화 실패";
            console.error("❌ Device init error:", errorMsg);
            if (isMountedRef.current) {
                setError(errorMsg);
            }
            throw err;
        }
    }, [config.socket]);

    // 3. Send Transport 생성
    const createSendTransport = useCallback(
        async (device: Device) => {
            try {
                const { data: transportParams } = await new Promise<{ data: any }>((resolve, reject) => {
                    config.socket?.emit(
                        "signal",
                        {
                            requestId: `create-send-transport-${Date.now()}`,
                            action: "createWebRtcTransport",
                            data: { producing: true, consuming: false },
                        },
                        (response: any) => {
                            if (response?.ok) resolve(response);
                            else reject(new Error(response?.error || "Send Transport 생성 실패"));
                        }
                    );
                });

                const transport = device.createSendTransport({
                    id: transportParams.transportId,
                    iceParameters: transportParams.iceParameters,
                    iceCandidates: transportParams.iceCandidates,
                    dtlsParameters: transportParams.dtlsParameters
                });

                transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
                    try {
                        config.socket?.emit(
                            "signal",
                            {
                                requestId: `connect-send-transport-${Date.now()}`,
                                action: "connectWebRtcTransport",
                                data: {
                                    transportId: transportParams.transportId,
                                    dtlsParameters,
                                },
                            },
                            (response: any) => {
                                if (response?.ok) callback();
                                else errback(new Error(response?.error));
                            }
                        );
                    } catch (err) {
                        errback(err instanceof Error ? err : new Error(String(err)));
                    }
                });

                transport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
                    try {
                        const { data: produceParams } = await new Promise<{ data: any }>((resolve, reject) => {
                            config.socket?.emit(
                                "signal",
                                {
                                    requestId: `produce-${Date.now()}`,
                                    action: "produce",
                                    data: {
                                        transportId: transportParams.transportId,
                                        kind,
                                        rtpParameters,
                                        appData
                                    },
                                },
                                (response: any) => {
                                    if (response?.ok) resolve(response);
                                    else reject(new Error(response?.error));
                                }
                            );
                        });

                        const serverProducerId = produceParams.producerId || produceParams.id;
                        callback({ id: serverProducerId });
                    } catch (err) {
                        errback(err instanceof Error ? err : new Error(String(err)));
                    }
                });

                transport.on("connectionstatechange", (state) => {
                    console.log("Send transport state:", state);
                });

                if (isMountedRef.current) {
                    sendTransportRef.current = transport;
                }

                return transport;
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : "Send Transport 생성 실패";
                if (isMountedRef.current) {
                    setError(errorMsg);
                }
                throw err;
            }
        },
        [config.socket]
    );

    // 4. Recv Transport 생성
    const createRecvTransport = (device: Device) => {
        return new Promise<void>((resolve, reject) => {
            if (!config.socket) return reject(new Error("소켓이 없습니다"));

            config.socket.emit(
                "signal",
                {
                    requestId: `create-recv-transport-${Date.now()}`,
                    action: "createWebRtcTransport",
                    data: { direction: "recv" },
                },
                (response: any) => {
                    if (!response.ok) return reject(response.error);

                    const transportParams = response.data;
                    const transport = device.createRecvTransport({
                        id: transportParams.transportId,
                        iceParameters: transportParams.iceParameters,
                        iceCandidates: transportParams.iceCandidates,
                        dtlsParameters: transportParams.dtlsParameters
                    });

                    transport.on("connectionstatechange", (state) => {
                        console.log("🚨 Recv transport state:", state);
                    });

                    transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
                        try {
                            config.socket?.emit(
                                "signal",
                                {
                                    requestId: `connect-recv-transport-${Date.now()}`,
                                    action: "connectWebRtcTransport",
                                    data: {
                                        transportId: transportParams.transportId,
                                        dtlsParameters,
                                    },
                                },
                                (response: any) => {
                                    if (response?.ok) callback();
                                    else errback(new Error(response?.error));
                                }
                            );
                        } catch (err) {
                            errback(err instanceof Error ? err : new Error(String(err)));
                        }
                    });

                    recvTransportRef.current = transport;
                    console.log("✅ Recv transport created");
                    resolve();
                }
            )
        })
    }

    // 5. Producer 생성 (로컬 미디어 송출)
    const produceAudio = useCallback(
        async (stream: MediaStream, transport: MediaSoupTypes.Transport) => {
            try {
                const audioTrack = stream.getAudioTracks()[0];
                if (!audioTrack) throw new Error("오디오 트랙을 찾을 수 없습니다");

                const producer = await transport.produce({
                    track: audioTrack,
                    encodings: [{ maxBitrate: 100000 }],
                });

                producer.on("trackended", () => {
                    console.log("Audio track ended");
                });

                producersRef.current.set("audio", producer);
                return producer;
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : "오디오 Producer 생성 실패";
                console.error(errorMsg);
                throw err;
            }
        },
        []
    );

    const produceVideo = useCallback(
        async (stream: MediaStream, transport: MediaSoupTypes.Transport) => {
            try {
                const videoTrack = stream.getVideoTracks()[0];
                if (!videoTrack) throw new Error("비디오 트랙을 찾을 수 없습니다");

                const producer = await transport.produce({
                    track: videoTrack,
                    encodings: [
                        { maxBitrate: 5000000, scalabilityMode: "L1T2" },
                        { maxBitrate: 1000000, scalabilityMode: "L1T2" },
                        { maxBitrate: 300000, scalabilityMode: "L1T2" },
                    ],
                });

                producer.on("trackended", () => {
                    console.log("Video track ended");
                });

                producersRef.current.set("video", producer);
                return producer;
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : "비디오 Producer 생성 실패";
                console.error(errorMsg);
                throw err;
            }
        },
        []
    );

    // 6. Consumer 생성 (원격 미디어 수신)
    const consume = useCallback(
        async (
            consumerId: string,
            producerId: string,
            kind: "audio" | "video",
            rtpParameters: any,
            transport: MediaSoupTypes.Transport
        ) => {
            try {
                if (!deviceRef.current) throw new Error("Device가 초기화되지 않았습니다");

                const consumer = await transport.consume({
                    id: consumerId,
                    producerId,
                    kind,
                    rtpParameters,
                });

                consumersRef.current.set(consumerId, consumer);

                // 원격 스트림 생성
                const stream = new MediaStream([consumer.track]);
                setRemoteStreams((prev) => new Map(prev).set(producerId, stream));

                if (config.onRemoteStream) {
                    config.onRemoteStream(stream);
                }

                return consumer;
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : "Consumer 생성 실패";
                console.error(errorMsg);
                throw err;
            }
        },
        [config]
    );

    // 헬퍼 함수
    // 💡 [추가] 서버로부터 스트림을 가져와 재생 상태로 만드는 통합 함수
    const requestConsume = useCallback(async (producerId: string, kind?: string) => {
        if (!recvTransportRef.current || !deviceRef.current) return;

        try {
            const { data: rtpParams } = await new Promise<{ data: any }>((resolve, reject) => {
                config.socket?.emit(
                    "signal",
                    {
                        requestId: `consume-${Date.now()}`,
                        action: "consume",
                        data: {
                            producerId,
                            rtpCapabilities: deviceRef.current?.rtpCapabilities,
                            transportId: recvTransportRef.current?.id // 🚨 핵심 고침: transportId 추가!
                        },
                    },
                    (response: any) => {
                        if (response?.ok) resolve(response);
                        else reject(new Error(response?.error));
                    }
                );
            });

            // 내부 consume 함수 호출 (기존 6번)
            await consume(
                rtpParams.consumerId,
                producerId,
                rtpParams.kind || kind,
                rtpParams.rtpParameters,
                recvTransportRef.current
            );

            // 🚨 핵심 고침: Mediasoup의 paused 상태를 해제하기 위해 resume 호출
            config.socket?.emit("signal", {
                requestId: `resume-${Date.now()}`,
                action: "resumeConsumer",
                data: { consumerId: rtpParams.consumerId }
            });
            console.log(`✅ Resumed consumer: ${rtpParams.consumerId}`);

        } catch (err) {
            console.error("Failed to consume remote stream:", err);
        }
    }, [config.socket, consume]);

    // 7. Socket 이벤트 수신
    useEffect(() => {
        if (!config.socket?.connected) return;

        const handleSignal = async (message: any) => {
            try {
                if (message.event === "new-producer") {
                    console.log("📢 New producer:", message.data);
                    const { producerId, kind } = message.data;

                    // 💡 [수정] 위에서 만든 통합 헬퍼 함수를 호출합니다.
                    await requestConsume(producerId, kind);
                }
            } catch (err) {
                console.error("Signal 처리 오류:", err);
            }
        };

        config.socket.on("signal", handleSignal);
        return () => {
            config.socket?.off("signal", handleSignal);
        };
    }, [config.socket, requestConsume]);

    // 8. 초기화
    const isGroupMentee = config.role === "MENTEE" && config.mentoringType === "GROUP";
    useEffect(() => {
        if (isGroupMentee) return;

        if (!localStream && !isInitializingRef.current) {
            console.log("Initializing WebRTC session...");
            initLocalStream();
        }
    }, [initLocalStream, localStream, isGroupMentee]);

    useEffect(() => {
        isMountedRef.current = true;

        const init = async () => {
            try {
                if (isReady || isInitializingRef.current) {
                    return;
                }

                // 1. 기본 연결 상태 확인
                // 소켓과 peerId가 있을 때만 미디어 서버 연결(mediasoup) 로직 진행
                if (!config.socket?.connected || !config.peerId) {
                    return;
                }

                // 멘토링 타입에 따라 스트림 필수 여부 확인
                // 1:N 멘티는 localStream이 null이어도 초기화를 계속 진행해야 합니다 (수신을 위해)
                const isOneToOne = config.mentoringType === "ONE_ON_ONE";
                const needsLocalStream = config.role === "MENTOR" || isOneToOne;

                // 스트림이 꼭 필요한 역할인데 아직 준비가 안 됐다면 대기
                if (needsLocalStream && !localStream) {
                    console.log("Waiting for local stream...");
                    return;
                }

                isInitializingRef.current = true;

                // 2. Mediasoup 장치 및 트랜스포트 생성 (송/수신 공통)
                const device = await initDevice();
                const sendTransport = await createSendTransport(device);

                await createRecvTransport(device);

                // 3. 송출(Produce) 로직
                // localStream이 존재할 때만 실행되도록 if문으로 감싸 타입을 확정합니다.
                if (localStream) {
                    if (config.role === "MENTOR") {
                        // 멘토는 비디오와 오디오 모두 송출
                        await produceAudio(localStream, sendTransport);
                        await produceVideo(localStream, sendTransport);
                        console.log("✅ Mentor tracks produced");
                    } else if (isOneToOne) {
                        // 1:1 멘티인 경우 오디오만 송출
                        await produceAudio(localStream, sendTransport);
                        console.log("✅ Mentee audio track produced (1:1)");
                    }
                } else {
                    // 1:N 멘티의 경우 localStream이 없으므로 송출 로직을 건너뜁니다.
                    console.log("ℹ️ 1:N Mentee mode: Skipping production");
                }

                const { data: producerIds } = await new Promise<{ data: any[] }>((resolve, reject) => {
                    config.socket?.emit(
                        "signal",
                        {
                            requestId: `list-producers-${Date.now()}`,
                            action: "listProducers",
                            data: {}
                        },
                        (response: any) => {
                            if (response?.ok) resolve(response);
                            else reject(new Error(response?.error));
                        }
                    );
                });

                if (producerIds && producerIds.length > 0) {
                    console.log("📥 Found existing producers:", producerIds);
                    for (const p of producerIds) {
                        const pid = typeof p === 'string' ? p : p.producerId;
                        const pkind = typeof p === 'string' ? undefined : p.kind;
                        await requestConsume(pid, pkind);
                    }
                }

                if (isMountedRef.current) {
                    setIsReady(true);
                }
            } catch (err) {
                console.error("❌ WebRTC 초기화 오류:", err);
                if (isMountedRef.current) {
                    setError(err instanceof Error ? err.message : "초기화 실패");
                }
            } finally {
                isInitializingRef.current = false;
            }
        };

        const retryInit = () => {
            void init();
        };

        if (config.socket) {
            config.socket.on("connect", retryInit);
            config.socket.on("reconnect", retryInit);
        }

        init();

        return () => {
            isMountedRef.current = false;
            if (config.socket) {
                config.socket.off("connect", retryInit);
                config.socket.off("reconnect", retryInit);
            }
        };
    }, [config.socket, config.peerId, config.role, isReady, initLocalStream, initDevice, createSendTransport, createRecvTransport, produceAudio, produceVideo, localStream]);

    // 카메라/마이크 토글
    const setCameraOn = useCallback(
        async (on: boolean) => {
            if (!localStream) return;

            localStream.getVideoTracks().forEach((track) => {
                track.enabled = on;
            });

            if (isMountedRef.current) {
                setIsCameraOn(on);
            }

            // Producer 상태 업데이트
            const videoProducer = producersRef.current.get("video");
            if (videoProducer) {
                if (on) {
                    await videoProducer.resume();
                } else {
                    await videoProducer.pause();
                }
            }
        },
        [localStream]
    );

    const setMicOn = useCallback(
        async (on: boolean) => {
            if (!localStream) return;

            localStream.getAudioTracks().forEach((track) => {
                track.enabled = on;
            });

            if (isMountedRef.current) {
                setIsMicOn(on);
            }

            // Producer 상태 업데이트
            const audioProducer = producersRef.current.get("audio");
            if (audioProducer) {
                if (on) {
                    await audioProducer.resume();
                } else {
                    await audioProducer.pause();
                }
            }
        },
        [localStream]
    );

    // 방을 종료할 때만 카메라 하드웨어를 종료합니다.
    const streamRef = useRef(localStream);
    useEffect(() => {
        streamRef.current = localStream;
    }, [localStream]);

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    return {
        localStream,
        remoteStreams,
        isCameraOn,
        isMicOn,
        setCameraOn,
        setMicOn,
        isReady,
        error,
    };
}
