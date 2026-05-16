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
    startedAt?: string | null;
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
            const data = res.data;

            console.log("🔍 미디어 서버 응답 데이터:", data); // 데이터 구조 확인용

            if (isMountedRef.current) {
                // 1. 서버 응답 구조 대응 (mentoring 객체 안에 있거나, 평평한 구조이거나)
                const mentoringInfo = data.mentoring || data;

                setSessionData({
                    // mentoringInfo에서 ID를 가져오되, 없으면 URL 파라미터의 mentoringId를 숫자로 변환해 사용
                    mentoringId: mentoringInfo?.mentoringId || Number(mentoringId),
                    title: mentoringInfo?.title || "멘토링 세션",
                    status: mentoringInfo?.status || "ON_AIR",
                    participantCount: data?.media?.peers?.length || 0,
                    host: {
                        userId: mentoringInfo?.userId || 0,
                        nickname: mentoringInfo?.nickname || "호스트"
                    },
                    startedAt: mentoringInfo?.startedAt || null,
                });
                // 참여자 수 상태 업데이트
                setParticipantCount(data?.media?.peers?.length || 0);
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
            const serverUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4002";

            const socket = io(
                serverUrl,
                {
                    path: "/media/socket.io",
                    withCredentials: true,
                    transports: ["websocket", "polling"],
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
                if (!isMountedRef.current) {
                    console.warn("⚠️ 소켓이 연결되었으나 컴포넌트가 언마운트 상태입니다.");
                    return;
                }
                console.log("Media server connected:", socket.id);

                console.log("📤 [joinMentoring] 서버로 방 입장 요청 발송 데이터:", {
                    mentoringId: Number(mentoringId),
                    role: options.role,
                    userId: options.userId?.toString() || "",
                });

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
                        // 💡 [추가] 서버로부터 응답이 오면 조건문 이전에 무조건 찍히는 로그
                        console.log("📩 [joinMentoring] 서버 응답 수신 완료:", response);

                        if (!isMountedRef.current) {
                            console.warn("⚠️ 서버 응답을 받았으나 컴포넌트가 이미 언마운트되었습니다.");
                            return;
                        }

                        if (response?.ok) {
                            console.log("🎉 Joined mentoring 성공:", response.data);
                            setPeerId(response.data?.peerId || socket.id);
                            setIsConnected(true);
                        } else {
                            // 💡 [추가] 실패 시 브라우저 콘솔에 빨간색으로 에러를 명시적으로 출력
                            console.error("❌ joinMentoring 서버 처리 실패 원인:", response?.error || response);
                            setError(response?.error || "멘토링 참여 실패");
                        }
                    }
                );
            });

            // 💡 [추가] 소켓 자체의 연결 에러 세부 진단
            socket.on("connect_error", (err) => {
                console.error("🚨 소켓 연결 자체에 에러 발생 (connect_error):", err.message, err);
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
