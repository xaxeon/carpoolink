import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import apiClient from "@/lib/apiClient";

interface MentoringSessionData {
    mentoringId: number;
    title: string;
    status: string;
    participantCount: number;
    host: {
        userId: number;
        nickname: string;
    };
}

interface UseMentoringSessionOptions {
    role: string;
    userId?: number;
}

export function useMentoringSession(options: UseMentoringSessionOptions) {
    const params = useParams<{ id: string }>();
    const mentoringId = params?.id;

    const [sessionData, setSessionData] = useState<MentoringSessionData | null>(
        null
    );
    const [participantCount, setParticipantCount] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [peerId, setPeerId] = useState<string | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);

    const socketRef = useRef<Socket | null>(null);
    const isMountedRef = useRef(true);

    // 1. 멘토링 정보 조회
    const fetchSessionData = useCallback(async () => {
        if (!mentoringId) return;
        setIsLoading(true);
        setError(null);

        try {
            const res = await apiClient.get(`/media/mentorings/${mentoringId}`);
            const data = res.data?.mentoring || res.data;

            if (isMountedRef.current) {
                setSessionData({
                    mentoringId: data?.mentoringId || data?.id,
                    title: data?.title || "멘토링 세션",
                    status: data?.status || "ON_AIR",
                    participantCount: data?.participantCount || 0,
                    host: data?.host || { userId: 0, nickname: "호스트" },
                });
                setParticipantCount(data?.participantCount || 0);
            }
        } catch (err) {
            if (isMountedRef.current) {
                setError(
                    err instanceof Error ? err.message : "세션 정보 로드 실패"
                );
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    }, [mentoringId]);

    // 2. Socket.IO 연결 및 joinMentoring
    const connectToMentoring = useCallback(async () => {
        if (!mentoringId) return;

        try {
            // Socket.IO 연결
            const serverUrl = process.env.NEXT_PUBLIC_BASE_URI || "http://localhost:4002";

            const socket = io(
                serverUrl,
                {
                    path: "/media/socket.io",
                    reconnection: true,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    reconnectionAttempts: 5,
                    auth: {
                        userId: options.userId?.toString() || "",
                    },
                }
            );

            socket.on("connect", () => {
                if (!isMountedRef.current) return;
                console.log("Media server connected:", socket.id);

                // joinMentoring 액션 발송
                socket.emit(
                    "signal",
                    {
                        requestId: `join-${Date.now()}`,
                        action: "joinMentoring",
                        data: {
                            mentoringId: Number(mentoringId),
                            role: options.role,
                            userId: options.userId?.toString() || "",
                        },
                    },
                    (response: any) => {
                        if (!isMountedRef.current) return;

                        if (response?.ok) {
                            console.log("Joined mentoring:", response.data);
                            setPeerId(response.data?.peerId || socket.id);
                            setIsConnected(true);
                        } else {
                            setError(response?.error || "멘토링 참여 실패");
                        }
                    }
                );
            });

            socket.on("signal", (message: any) => {
                if (!isMountedRef.current) return;

                // 다른 피어 참여 감지
                if (message.event === "peer-joined") {
                    console.log("Peer joined:", message.data);
                    setParticipantCount((prev) => prev + 1);
                }

                // 피어 종료
                if (message.event === "peer-left") {
                    console.log("Peer left:", message.data);
                    setParticipantCount((prev) => Math.max(0, prev - 1));
                }
            });

            socket.on("disconnect", () => {
                if (!isMountedRef.current) return;
                console.log("Media server disconnected");
                setIsConnected(false);
            });

            socket.on("error", (error) => {
                if (!isMountedRef.current) return;
                console.error("Socket error:", error);
                setError("멘토링 연결 오류");
            });

            socketRef.current = socket;
            setSocket(socket);
        } catch (err) {
            setError(err instanceof Error ? err.message : "소켓 연결 실패");
        }
    }, [mentoringId, options.role, options.userId]);

    // 3. 초기화: 세션 정보 조회 + 소켓 연결
    useEffect(() => {
        isMountedRef.current = true;

        fetchSessionData();
        connectToMentoring();

        return () => {
            isMountedRef.current = false;

            // 소켓 연결 해제
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            setSocket(null);
        };
    }, [mentoringId, fetchSessionData, connectToMentoring]);

    // 4. 멘토링 종료
    const endMentoring = useCallback(async () => {
        if (!mentoringId) return;

        try {
            await apiClient.post(`/media/mentorings/${mentoringId}/end`);
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            setIsConnected(false);
            setSocket(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "멘토링 종료 실패");
        }
    }, [mentoringId]);

    // 5. 신호 전송 헬퍼
    const sendSignal = useCallback(
        (action: string, data: any, callback?: (response: any) => void) => {
            if (!socketRef.current?.connected) {
                console.warn("Socket not connected");
                return;
            }

            socketRef.current.emit(
                "signal",
                {
                    requestId: `signal-${Date.now()}`,
                    action,
                    data,
                },
                callback
            );
        },
        []
    );

    return {
        // 상태
        sessionData,
        participantCount,
        isLoading,
        error,
        isConnected,
        peerId,
        socket,

        // 함수
        endMentoring,
        sendSignal,
        refetchSessionData: fetchSessionData,
    };
}
