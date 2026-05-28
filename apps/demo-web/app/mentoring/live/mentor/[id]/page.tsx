"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { PhoneOff, Users, Volume2, Settings, Mic, MicOff, Video, VideoOff, MessageSquare, Lock, AlertCircle } from "lucide-react";

import { useMentoringSession } from "@/hooks/useMentoringSession";
import { useWebRtcSession } from "@/hooks/useWebRtcSession";
import apiClient from "@/lib/apiClient";

interface Question {
    id: number;
    userId?: number;
    isPaid: boolean;
    isPrivate: boolean;
    author: string;
    avatar: string;
    content: string;
    status?: string;
    answerer?: { userId: number; nickname: string } | null;
    clusterSize?: number;
}

interface ChatMessage {
    id: string | number;
    author: string;
    senderId: string;
    content: string;
    isQuestion?: boolean;
    questionId?: string | null;
}

// STT 스크립트 반환 규격 인터페이스
interface STTScript {
    scriptId: string;
    chunkIndex: number;
    text: string;
}

// 1. 게이트웨이 컴포넌트: 정보가 준비될 때까지 로딩만 보여줌
export default function MentorLivePage() {
    const params = useParams();
    const mentoringId = params?.id as string;

    const [isReady, setIsReady] = useState(false);
    const [userId, setUserId] = useState<number | null>(null);
    const [role, setRole] = useState<string>("MENTOR");
    const [userName, setUserName] = useState<string>("멘토");

    useEffect(() => {
        // 로컬스토리지 정보 확정
        const storedRole = localStorage.getItem("role")?.toUpperCase() || "MENTOR";
        const storedUserId = localStorage.getItem("userId");
        const storedName = localStorage.getItem("nickname") || "멘토";

        if (storedUserId) {
            setRole(storedRole);
            setUserId(Number(storedUserId));
            setUserName(storedName);
            setIsReady(true); // 모든 정보가 준비되었을 때만 true
        }
    }, []);

    if (!isReady || !userId) {
        return (
            <main className="flex flex-col w-full h-[100dvh] bg-[#161616] text-white items-center justify-center space-y-5">
                <div className="w-12 h-12 border-4 border-[#FFCC00]/20 border-t-[#FFCC00] rounded-full animate-spin"></div>
                <p className="text-gray-400">방송 세션을 준비 중입니다...</p>
            </main>
        );
    }

    // 정보가 확정된 후, 실제 소켓 로직이 있는 Content 컴포넌트 실행
    return <MentorLiveContent mentoringId={mentoringId} role={role} userId={userId} userName={userName} />;
}

// 2. 실제 화면 컴포넌트: 여기서 훅을 호출해야 소켓이 단 한 번만 연결됨
function MentorLiveContent({ mentoringId, role, userId, userName }: { mentoringId: string, role: string, userId: number, userName: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [chats, setChats] = useState<any[]>([]);
    const [onlineUserCount, setOnlineUserCount] = useState(0);
    const [isChatOpen, setIsChatOpen] = useState(true);
    const [isExitPopupOpen, setIsExitPopupOpen] = useState(false);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [isReading, setIsReading] = useState(false);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
    const [completedIds, setCompletedIds] = useState<number[]>([]);
    const [clusters, setClusters] = useState<any[]>([]);
    const [isClustering, setIsClustering] = useState(false);

    // 질문 ID별 랭킹 점수를 저장할 상태
    const [questionRankings, setQuestionRankings] = useState<Record<string, number>>({});
    const [isRanking, setIsRanking] = useState(false);

    // 실시간 텍스트 변환 내역들을 누적 보관할 런타임 상태
    const [scriptSegments, setScriptSegments] = useState<STTScript[]>([]);
    const chunkIndexRef = useRef<number>(0);
    const recorderIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const pausedQuestionUserIdRef = useRef<number | null>(null);

    // 훅들은 컴포넌트가 마운트될 때 단 한 번, 올바른 userId로 실행됩니다.
    const mentoringOptions = useMemo(() => ({ role, userId }), [role, userId]);
    const { sessionData, isConnected, peerId, socket, endMentoring, isLoading, error, sendSignal } = useMentoringSession(mentoringOptions);

    const webRtcConfig = useMemo(() => ({
        socket,
        mentoringId: sessionData?.mentoringId?.toString() || mentoringId,
        peerId: peerId || "",
        role: "MENTOR",
        mentoringType: "GROUP" as const,
        isJoined: isConnected
    }), [socket, sessionData?.mentoringId, mentoringId, peerId]);

    // useWebRtcSession에서 localStream과 마이크 상태 가져오기
    const { localStream, isCameraOn, isMicOn, setCameraOn, setMicOn, error: webRtcError } = useWebRtcSession(webRtcConfig);

    // [STT 모니터링 강화] 하드웨어 오디오 스트림 추적 및 전송 로그 추가 파이프라인
    useEffect(() => {
        if (!localStream) {
            console.warn("[🎙️ STT 모니터링] localStream이 존재하지 않아 대기 중입니다.");
            return;
        }
        if (!isMicOn) {
            console.log("[🎙️ STT 모니터링] 현재 멘토 마이크가 '음소거(Mic Off)' 상태입니다. 수집을 일시 중단합니다.");
            return;
        }
        if (!userId || !mentoringId) {
            console.warn("[🎙️ STT 모니터링] 인증 정보(userId, mentoringId)가 누락되었습니다.");
            return;
        }

        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length === 0) {
            console.error("[🚨 STT 에러] 스트림 내에서 활성화된 마이크(Audio Track)를 찾을 수 없습니다 하드웨어를 확인하세요.");
            return;
        }

        // 1. 마이크 활성화 상태 로그 파싱
        const activeTrack = audioTracks[0];
        console.log(`[✅ 마이크 인식 성공] 장치명: "${activeTrack.label}" | 상태: ${activeTrack.enabled ? "활성" : "비활성"}`);

        const audioStream = new MediaStream(audioTracks);
        const mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: "audio/webm;codecs=opus",
        });

        mediaRecorder.onstart = () => {
            console.log(`[🚀 레코더 시작] 청크 인덱스 [${chunkIndexRef.current}] 오디오 데이터 수집을 시작합니다.`);
        };

        mediaRecorder.ondataavailable = async (event) => {
            // 2. 음성 데이터 추출 성공 로그
            if (event.data && event.data.size > 0) {
                const audioBlob = event.data;
                const currentIndex = chunkIndexRef.current;
                chunkIndexRef.current += 1;

                console.log(`[📦 청크 패킹 완료] 인덱스: ${currentIndex} | 용량: ${(audioBlob.size / 1024).toFixed(2)} KB | 포맷: ${audioBlob.type}`);

                const formData = new FormData();
                formData.append("audio", audioBlob, `chunk_${currentIndex}.webm`);
                formData.append("userId", String(userId));
                formData.append("mentoringId", String(mentoringId));
                formData.append("chunkIndex", String(currentIndex));

                console.log(`[📡 전송 시도] stt-service(4004)로 청크 [${currentIndex}] 데이터 업로드를 시작합니다...`);
                const startTime = performance.now(); // 네트워크 지연시간 계산용

                try {
                    const STT_SERVER_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4004"
                    const response = await fetch(`${STT_SERVER_URL}/audio/stt/chunk`, {
                        method: "POST",
                        body: formData,
                    });

                    const endTime = performance.now();
                    const duration = ((endTime - startTime) / 1000).toFixed(2);

                    // 3. 서버 도달 및 처리 완료 로그
                    if (response.ok) {
                        const data = await response.json();
                        console.log(`[🎉 전송 및 STT 대성공] 청크 [${currentIndex}] 처리 완료 (${duration}초 소요)`);

                        // 백엔드 stt.js 반환 스펙(data.text)에 맞추어 조건식과 데이터 구조 전면 교정
                        if (data && typeof data.text === 'string' && data.text.trim() !== "") {
                            console.log(`[📝 AI Whisper 변환 결과]: "${data.text}"`);

                            // 하단 오버레이 자막 및 타임라인 배열 업데이트
                            const newSegment: STTScript = {
                                scriptId: data.scriptId || String(Date.now()),
                                chunkIndex: currentIndex,
                                text: data.text
                            };

                            setScriptSegments((prev) => {
                                // 기존에 이미 존재하는 인덱스는 제외하고 순서대로 정렬 결합
                                const filtered = prev.filter(p => p.chunkIndex !== currentIndex);
                                return [...filtered, newSegment].sort((a, b) => a.chunkIndex - b.chunkIndex);
                            });
                        } else {
                            console.log(`[🔇 음성 공백] 청크 [${currentIndex}] 구간에 인식된 발화(텍스트)가 없습니다.`);
                        }
                    } else {
                        console.error(`[❌ 서버 처리 에러] 청크 [${currentIndex}] 전송은 되었으나 서버가 에러를 응답했습니다. 상태코드: ${response.status}`);
                    }
                } catch (error) {
                    console.error(`[🚨 네트워크 통신 실패] 청크 [${currentIndex}]가 백엔드 서버(4004)에 도달하지 못했습니다. 서버가 켜져 있는지 확인하세요.`, error);
                }
            } else {
                console.warn(`[⚠️ 데이터 유실 경고] 청크 [${chunkIndexRef.current}] 데이터 이벤트가 트리거되었으나 오디오 크기가 0바이트입니다.`);
            }
        };

        mediaRecorder.start();

        recorderIntervalRef.current = setInterval(() => {
            if (mediaRecorder.state === "recording") {
                console.log(`[⏱️ 15초 인터벌 도달] 현재 녹음 세션을 끊고 청크 [${chunkIndexRef.current}] 전송 프로세스를 유도합니다.`);
                mediaRecorder.stop();
                mediaRecorder.start();
            }
        }, 15000);

        return () => {
            console.log("[🔌 수집기 종료] 마이크 상태 변경 또는 컴포넌트 언마운트로 인해 오디오 리스너를 해제합니다.");
            if (recorderIntervalRef.current) clearInterval(recorderIntervalRef.current);
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
        };
    }, [localStream, isMicOn, userId, mentoringId]);

    // [질문 목록 로드 - 초기 DB 데이터 반영]
    useEffect(() => {
        const fetchQuestions = async () => {
            if (!mentoringId) return;
            setIsLoadingQuestions(true);
            try {
                const response = await apiClient.get(`/api/mentorings/${mentoringId}/questions`);
                if (response.data?.questions) {
                    const mappedQuestions = response.data.questions
                        .filter((q: any) => q.status !== 'COMPLETED') // 프론트에서 완료된 질문만 필터링
                        .map((q: any) => ({
                            id: q.questionId,
                            userId: q.user?.userId || q.userId,
                            type: q.isPaid ? "paid" : "free",
                            isPaid: q.isPaid || false,
                            isPrivate: q.isPrivate || false,
                            author: q.user?.nickname || "익명멘티",
                            avatar: q.isPaid ? "💎" : "👤",
                            content: q.content,
                            status: q.status,
                            answerer: q.answerer
                        }));
                    setQuestions(mappedQuestions);
                }
            } catch (err: any) {
                console.error('질문 목록 로드 실패', err);
            } finally {
                setIsLoadingQuestions(false);
            }
        };

        fetchQuestions();
    }, [mentoringId]);

    // 완료되지 않은(활성화된) 질문들만 추출
    const activeQuestions = useMemo(() => {
        const completedStringIds = completedIds.map(id => String(id));
        return questions.filter(q => !completedStringIds.includes(String(q.id)));
    }, [questions, completedIds]);

    // [STT 추가] 화면 하단 레이어에 바로 띄워줄 가장 최신의 라이브 자막 데이터 추출
    const latestSubtitle = useMemo(() => {
        if (scriptSegments.length === 0) return "";
        return scriptSegments[scriptSegments.length - 1].text;
    }, [scriptSegments]);

    // [클러스터링 & 랭킹] 단일 직렬화 파이프라인 통합 엔진
    useEffect(() => {
        if (activeQuestions.length === 0) {
            setClusters([]);
            setQuestionRankings({});
            return;
        }

        const timer = setTimeout(async () => {
            setIsClustering(true);
            setIsRanking(true);
            try {
                const QUESTION_SERVICE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4003";

                // 1. 실시간 STT 맥락 데이터 가공 (최근 발화 5개 문장 결합)
                const currentSTTSection = scriptSegments
                    .slice(-5)
                    .map(s => s.text)
                    .join(" ")
                    .trim();

                // 2. 질문 데이터 전송 안정성 확보 및 trim 처리
                const safeQuestions = activeQuestions.map(q => ({
                    id: String(q.id),
                    text: q.content?.trim() || "질문 내용 없음",
                    isPaid: q.isPaid || false
                }));

                // STEP 1: 클러스터링(Clustering) API 호출
                let currentClusters: any[] = [];
                try {
                    const clusterRes = await fetch(`${QUESTION_SERVICE_URL}/question/api/question-clustering/cluster`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            questions: safeQuestions // 안전성이 확보된 질문 목록 주입
                        })
                    });

                    if (clusterRes.ok) {
                        const clusterData = await clusterRes.json();
                        currentClusters = clusterData.clusters || [];
                        // 기존에 사용하던 상태 업데이트 그대로 유지
                        setClusters(currentClusters);
                    }
                } catch (e) {
                    console.error("🚨 클러스터링 API 호출 에러:", e);
                }

                // STEP 2: 완성된 클러스터 결과를 랭킹(Ranking) 요청
                const payload: any = {
                    sessionTopic: "실시간 라이브 멘토링 세션",
                    currentScriptSection: currentSTTSection || "멘토링이 활발하게 진행 중입니다.",
                    questions: safeQuestions
                };

                // STEP 1의 클러스터링 응답 데이터가 정상 확보되었을 경우에만 400 에러를 방지하며 주입
                if (currentClusters.length > 0) {
                    payload.clustering = {
                        question_count: activeQuestions.length,
                        cluster_count: currentClusters.length,
                        threshold: 0.5,
                        similarity_mode: "rule",
                        clusters: currentClusters.map((c, idx) => ({
                            cluster_id: `cluster_${idx + 1}`,
                            representative_question_id: String(c.representative_question_id),
                            representative_question: c.representative_question?.trim() || "내용 없음",
                            member_questions: (c.member_questions || []).map((m: any) => ({
                                question_id: String(m.question_id || m.id || m),
                                text: (m.text || m.content || "").trim() || "내용 없음"
                            }))
                        }))
                    };
                }

                // 랭킹 API 엔드포인트 전송 (/api/questions/rank)
                const rankRes = await fetch(`${QUESTION_SERVICE_URL}/question/api/questions/rank`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (rankRes.ok) {
                    const rankData = await rankRes.json();

                    // 백엔드가 정확히 어떤 구조로 주는지 콘솔에 원본 출력
                    console.log("🔍 [랭킹 API 원본 응답 데이터]:", rankData);

                    const newRankings: Record<string, number> = {};

                    const rankArray = rankData.rankedQuestions || [];

                    if (Array.isArray(rankArray)) {
                        rankArray.forEach((item: any) => {
                            const qId = String(item.id);

                            // (priorityScore가 없을 경우 answerabilityScore를 예비로 사용)
                            const qScore = Number(item.priorityScore || item.answerabilityScore || 0);

                            newRankings[qId] = qScore;
                        });
                    }
                    setQuestionRankings(newRankings);
                } else {
                    const errData = await rankRes.json();
                    console.error("🚨 [Ranking API 400 에러 사유]:", errData.message || errData);
                }
            } catch (error) {
                console.error("🚨 [전체 실시간 연동 파이프라인 네트워크 크래시]:", error);
            } finally {
                setIsClustering(false);
                setIsRanking(false);
            }
        }, 800); // 0.8초 디바운스 딜레이

        return () => clearTimeout(timer);
        // 의존성 배열에 activeQuestions와 scriptSegments(STT 자막 전송 감지)만 남겨서 데이터 흐름을 정형화합니다.
    }, [activeQuestions, scriptSegments]);

    // 유료 가중치 최우선 배정 후, AI questionRanking 점수 순 정렬 파이프라인
    const questionQueue = useMemo(() => {
        // 클러스터링 결과가 아직 없거나 대기 중일 때의 예외 방어 정렬
        if (clusters.length === 0 && activeQuestions.length > 0) {
            return [...activeQuestions].sort((a, b) => {
                if (a.isPaid && !b.isPaid) return -1;
                if (!a.isPaid && b.isPaid) return 1;

                const scoreA = questionRankings[String(a.id)] || 0;
                const scoreB = questionRankings[String(b.id)] || 0;
                return scoreB - scoreA; // 점수 내림차순
            });
        }

        // 클러스터 결과를 순회하며 화면에 띄울 대표 질문 객체 생성
        const mappedQueue = clusters.map(cluster => {
            const repId = Number(cluster.representative_question_id);
            const originalQ = activeQuestions.find(q => q.id === repId) || activeQuestions[0];

            return {
                ...originalQ,
                id: repId,
                content: cluster.representative_question, // AI 정제 텍스트
                clusterSize: cluster.member_questions?.length || 1,
            } as Question;
        });

        // 최종 하이브리드 정렬 실행
        return mappedQueue.sort((a, b) => {
            // 규칙 1: 유료 질문이 무조건 최상단 노출
            if (a.isPaid && !b.isPaid) return -1;
            if (!a.isPaid && b.isPaid) return 1;

            // 규칙 2: 동일 등급 내에서는 rank API가 산출한 score 기반 정렬
            const scoreA = questionRankings[String(a.id)] || 0;
            const scoreB = questionRankings[String(b.id)] || 0;
            return scoreB - scoreA;
        });
    }, [clusters, activeQuestions, questionRankings]);

    // 현재 인덱스에 해당하는 질문 가져오기 (결합된 완성형 큐 사용)
    const currentQuestion = questionQueue[currentIdx];

    // 질문 목록(questionQueue)의 길이가 줄어들거나 변경될 때 인덱스를 안전하게 가리키도록 동기화
    // 실시간 AI 랭킹 정렬 및 인덱스 유동적 동기화 엔진
    useEffect(() => {
        // 1. 대기 중인 큐가 없으면 인덱스는 무조건 0번 고정
        if (questionQueue.length === 0) {
            setCurrentIdx(0);
            return;
        }

        // 현재 질문을 소리 내어 '읽는 중(isReading === true)'이 아니라면
        // AI가 실시간 맥락을 분석해 배치한 가장 우선순위가 높은 1등 질문(0번 인덱스)을 화면에 즉시 노출.
        if (!isReading) {
            setCurrentIdx(0);
            return;
        }

        // 3. 만약 질문을 읽으며 답변 중인데 큐가 변해서 인덱스가 범위를 초과했다면 안전하게 마지막 카드로 보정
        if (currentIdx >= questionQueue.length) {
            setCurrentIdx(questionQueue.length - 1);
        }
        // 의존성 배열에 questionQueue 자체를 감시하여, 실시간 랭킹 점수 변동으로 순서가 뒤바뀔 때마다 즉각 반응하게 만듭니다.
    }, [questionQueue, isReading]);

    // [채팅 소켓 설정]
    useEffect(() => {
        if (!mentoringId || !userId) return;

        const CHAT_SERVER_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4001";
        const newSocket = io(CHAT_SERVER_URL, {
            path: '/chat/socket.io',
            withCredentials: true,
            transports: ["websocket", "polling"],
        });

        newSocket.on("connect", () => {
            console.log("✅ Chat socket connected (Mentor - Read Only)");
            newSocket.emit("join_chat", {
                mentoringId,
                userId: String(userId),
                userName
            }, (res: any) => {
                if (res?.ok) {
                    newSocket.emit("get_message_history", { mentoringId, limit: 50, offset: 0 });
                    newSocket.emit("get_online_users", { mentoringId });
                }
            });
        });

        // 질문 이벤트 실시간 처리: 등록/완료
        newSocket.on('question:registered', (data: any) => {
            try {
                const q = data?.question;
                if (!q) return;
                const mapped: Question = {
                    id: Number(q.questionId),
                    userId: q.user?.userId || q.userId,
                    isPaid: q.isPaid || false,
                    isPrivate: q.isPrivate || false,
                    author: q.user?.nickname || '익명멘티',
                    avatar: '👤',
                    content: q.content,
                };

                setQuestions((prev) => {
                    if (prev.some(p => p.id === mapped.id)) return prev;
                    return [...prev, mapped];
                });
            } catch (e) {
                console.error('question:registered 처리 중 에러', e);
            }
        });

        // [채팅 소켓 설정 useEffect 내부의 완료 이벤트 리스너]
        newSocket.on('question:completed', (data: any) => {
            try {
                const q = data?.question;
                if (!q) return;
                const removeId = Number(q.questionId);

                // 완료 목록에 누적하여 큐에서 완전히 제외되도록 처리
                setCompletedIds((prev) => [...prev, removeId]);
                setQuestions((prev) => prev.filter(p => p.id !== removeId));
            } catch (e) {
                console.error('question:completed 처리 중 에러', e);
            }
        });

        newSocket.on("message_history", (messages: any[]) => {
            const mapped = messages.map(m => ({
                id: m.mentoringChatId,
                author: m.user?.nickname || m.userName || "익명멘티",
                senderId: String(m.userId),
                content: m.content.replace("[유료] ", ""),
                isQuestion: m.isQuestion,
                questionId: m.questionId,
            })) as ChatMessage[];
            setChats(mapped);
        });

        newSocket.on("new_message", (m: any) => {
            setChats(prev => [...prev, {
                id: m.mentoringChatId,
                type: m.content.startsWith("[유료]") ? "paid" : "free",
                author: m.user?.nickname || m.userName || "익명멘티",
                senderId: String(m.userId),
                content: m.content.replace("[유료] ", ""),
                isQuestion: m.isQuestion,
                questionId: m.questionId,
            }]);
        });

        newSocket.on("user_joined", (data: any) => setOnlineUserCount(data.userCount));
        newSocket.on("user_left", (data: any) => setOnlineUserCount(data.userCount));
        newSocket.on("online_users", (data: any) => setOnlineUserCount(data.userCount));

        return () => {
            newSocket.emit("leave_chat", { mentoringId, userId: String(userId), userName });
            newSocket.disconnect();
        };
    }, [mentoringId, userId, userName]);

    // [비디오 스트림 연결]
    useEffect(() => {
        if (videoRef.current && localStream) {
            if (videoRef.current.srcObject !== localStream) {
                videoRef.current.srcObject = localStream;
                videoRef.current.play().catch(console.error);
            }
        }
    }, [localStream, isCameraOn]);

    // [채팅 스크롤]
    useEffect(() => {
        if (isChatOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [chats, isChatOpen]);

    // 다음 질문/답변 완료 버튼 로직
    const handleNextQuestion = () => {
        // questionQueue의 범위를 벗어나지 않도록 안전하게 인덱스 증가
        if (currentIdx < questionQueue.length) {
            setCurrentIdx((prev) => prev + 1); // 인덱스를 올려 다음 질문으로 이동 (끝에 도달 시 빈 카드 노출)
            setIsReading(false); // 새로운 질문을 읽기 위해 기존 읽기 상태 초기화
        }
    };

    // [1] 답변 시작 시점 (질문 읽기 버튼)
    const acknowledgeQuestion = async (question: Question) => {
        if (!mentoringId || !question.id) {
            console.error("🚨 [프론트 에러] 멘토링 ID 또는 질문 ID가 없습니다!", { mentoringId, questionId: question.id });
            return;
        }

        if (!question?.userId) {
            console.error("🚨 [프론트 에러] 질문 작성자의 userId를 찾을 수 없습니다.", { questionId: question.id, question });
            alert("질문 작성자 정보를 찾을 수 없어 음성 제어를 시작하지 못했습니다.");
            return;
        }

        try {
            console.log(`🚀 [API 요청] 질문 읽기 시작 (ID: ${question.id})`);

            await new Promise<void>((resolve, reject) => {
                if (!socket?.connected || !sendSignal) {
                    reject(new Error("미디어 소켓이 연결되지 않았습니다."));
                    return;
                }

                sendSignal(
                    "pauseMenteeConsumers",
                    {
                        mentoringId: Number(mentoringId),
                        exceptUserId: question.userId,
                    },
                    (response: any) => {
                        if (response?.ok) {
                            resolve();
                            console.log(`✅ [시그널 성공] 멘티 음성 수신이 일시 중지됨 (exceptUserId: ${question.userId})`);
                            return;
                        }

                        reject(new Error(response?.error || "멘티 음성 수신을 일시 중지하지 못했습니다."));
                    }
                );
            });

            pausedQuestionUserIdRef.current = question.userId;

            const res = await apiClient.post(`/api/mentorings/${mentoringId}/questions/${question.id}/acknowledge`);

            setIsReading(true);
            console.log(`✅ [API 성공] 질문 상태가 ANSWERING으로 변경됨:`, res.data);

            // API가 방금 응답해준 확실한 데이터를 바로 꺼내서 읽음
            const questionText = res.data?.question?.content;

            if (questionText) {
                // 백그라운드에서 오디오 재생 함수 실행
                playQuestionAudio(questionText);
            } else {
                console.error("❌ 질문 텍스트를 찾을 수 없어 TTS를 실행하지 못했습니다.");
            }

        } catch (err: any) {
            if (pausedQuestionUserIdRef.current !== null) {
                try {
                    await new Promise<void>((resolve, reject) => {
                        if (!socket?.connected || !sendSignal) {
                            reject(new Error("미디어 소켓이 연결되지 않았습니다."));
                            return;
                        }

                        sendSignal(
                            "resumeMenteeConsumers",
                            { mentoringId: Number(mentoringId) },
                            (response: any) => {
                                if (response?.ok) {
                                    resolve();
                                    return;
                                }

                                reject(new Error(response?.error || "멘티 음성 수신을 다시 시작하지 못했습니다."));
                            }
                        );
                    });
                } catch (resumeErr) {
                    console.error("❌ [복구 실패] 멘티 음성 수신 재개에 실패했습니다.", resumeErr);
                } finally {
                    pausedQuestionUserIdRef.current = null;
                }
            }

            console.error('❌ [API 실패] 질문 읽기 에러:', err.response?.data || err);
            alert(err?.response?.data?.message || '질문 확인에 실패했습니다.');
        }
    };

    // [2] 답변 완료 시점 (답변 완료 버튼)
    const completeQuestion = async (questionId: number) => {
        if (!mentoringId || !questionId) {
            console.error("🚨 [프론트 에러] 멘토링 ID 또는 질문 ID가 없습니다!", { mentoringId, questionId });
            return;
        }

        const shouldResumeAudio = pausedQuestionUserIdRef.current !== null;

        if (shouldResumeAudio) {
            try {
                await new Promise<void>((resolve, reject) => {
                    if (!socket?.connected || !sendSignal) {
                        reject(new Error("미디어 소켓이 연결되지 않았습니다."));
                        return;
                    }

                    sendSignal(
                        "resumeMenteeConsumers",
                        { mentoringId: Number(mentoringId) },
                        (response: any) => {
                            if (response?.ok) {
                                resolve();
                                return;
                            }

                            reject(new Error(response?.error || "멘티 음성 수신을 다시 시작하지 못했습니다."));
                        }
                    );
                });
            } catch (resumeErr) {
                console.error("❌ [복구 실패] 멘티 음성 수신 재개에 실패했습니다.", resumeErr);
            } finally {
                pausedQuestionUserIdRef.current = null;
            }
        }

        try {
            console.log(`🚀 [API 요청] 질문 완료 처리 시작 (ID: ${questionId})`);

            // 백엔드는 status가 'ANSWERING'일 때만 완료(complete)를 허락.
            // 만약 멘토가 '질문 읽기'를 누르지 않고 바로 '답변 완료'를 눌렀을 경우를 대비해, 
            // acknowledge를 강제로 한 번 찔러주고(에러는 무시) 바로 complete를 요청하도록 함.
            await apiClient.post(`/api/mentorings/${mentoringId}/questions/${questionId}/acknowledge`).catch(() => { });
            const res = await apiClient.post(`/api/mentorings/${mentoringId}/questions/${questionId}/complete`);

            setIsReading(false);
            setCurrentIdx(0);
            setCompletedIds((prev) => [...prev, questionId]);
            setQuestions((prev) => prev.filter(q => q.id !== questionId));

            console.log(`✅ [API 성공] 질문 상태가 COMPLETED로 변경됨:`, res.data);
        } catch (err: any) {
            console.error('❌ [API 실패] 질문 완료 처리 에러:', err.response?.data || err);
            alert(err?.response?.data?.message || '질문 완료 처리에 실패했습니다.');
        } finally {
            setIsReading(false);
        }
    };

    useEffect(() => {
        return () => {
            if (!pausedQuestionUserIdRef.current || !socket?.connected || !sendSignal) {
                return;
            }

            sendSignal("resumeMenteeConsumers", { mentoringId: Number(mentoringId) });
            pausedQuestionUserIdRef.current = null;
        };
    }, [mentoringId, sendSignal, socket]);

    // TTS API 호출 및 음성 재생 함수
    const playQuestionAudio = async (text: string) => {
        try {
            console.log("🔊 TTS 음성 합성 요청 중...");

            const TTS_SERVER_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4004";

            const response = await fetch(`${TTS_SERVER_URL}/audio/tts/speak`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ text }), // 읽어줄 텍스트 전송
            });

            if (!response.ok) {
                throw new Error(`TTS 서버 에러: ${response.status}`);
            }

            // 오디오 버퍼 데이터를 Blob으로 변환
            const audioBlob = await response.blob();

            // Blob 데이터를 브라우저에서 재생할 수 있는 임시 URL로 변환
            const audioUrl = URL.createObjectURL(audioBlob);

            // 오디오 객체 생성 및 재생
            const audio = new window.Audio(audioUrl);
            audio.play().catch((e) => console.error("오디오 재생 권한 에러:", e));

            // 재생이 끝나면 메모리 누수를 막기 위해 URL 해제
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
            };

        } catch (error) {
            console.error("❌ TTS 재생 실패:", error);
        }
    };

    const handleConfirmExit = async () => {
        try {
            if (endMentoring) await endMentoring();
            window.location.href = "/mentoring_list/live_list";
        } catch (err) {
            console.error("멘토링 종료 실패:", err);
            alert("방송 종료 중 오류가 발생했습니다.");
        }
    };

    // 로딩 및 에러 처리 (Content 컴포넌트 내부용)
    if (isLoading) {
        return (
            <main className="flex flex-col w-full h-[100dvh] bg-[#161616] text-white items-center justify-center">
                <div className="w-8 h-8 border-4 border-[#FFCC00]/30 border-t-[#FFCC00] rounded-full animate-spin mb-4"></div>
                <p className="text-gray-300">미디어 세션 연결 중...</p>
            </main>
        );
    }

    if (error || webRtcError) {
        return (
            <main className="flex flex-col w-full h-full bg-[#161616] text-white font-sans overflow-hidden items-center justify-center">
                <div className="bg-red-500/20 p-4 rounded-2xl mb-4">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                {error && <p className="text-red-400 font-bold mb-2">세션 에러: {error}</p>}
                {webRtcError && <p className="text-red-400 font-bold mb-4">미디어 에러: {webRtcError}</p>}
                <Link href="/mentoring_list/live_list" className="bg-[#FFCC00] text-[#1A1A1A] font-bold px-6 py-3 rounded-xl hover:bg-[#E6B800]">
                    목록으로 돌아가기
                </Link>
            </main>
        );
    }

    // 메인 라이브 화면 UI
    return (
        <main className="flex flex-col w-full h-[100dvh] bg-[#161616] text-white font-sans overflow-hidden relative">
            {/* ... 헤더, 질문카드, 비디오, 채팅창, 푸터 UI 코드 ... */}
            <header className="w-full px-5 py-4 flex items-center justify-between shrink-0 z-20">
                <button onClick={() => setIsExitPopupOpen(true)} className="inline-flex items-center text-red-500">
                    <PhoneOff className="w-5 h-5 mr-2" strokeWidth={2.5} />
                    <span className="font-bold text-[17px] text-white">방송 종료</span>
                </button>
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-[#2A2A2A] px-3 py-1.5 rounded-full">
                        <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-xs font-bold text-gray-200 tracking-wider">LIVE</span>
                    </div>
                    <div className="flex items-center text-gray-400 text-sm font-medium">
                        <Users className="w-4 h-4 mr-1.5" />
                        {onlineUserCount}
                    </div>
                </div>
            </header>

            <div className="flex-1 flex flex-col px-4 overflow-hidden relative">
                {/* 상단 영역: 질문 카드 + 비디오 화면 */}
                <div className={`flex flex-col transition-all duration-500 ${!isChatOpen ? 'flex-1 justify-center' : 'justify-start pt-2'}`}>

                    {/* 질문 카드 영역 */}
                    {isLoadingQuestions ? (
                        <div className="w-full rounded-[24px] p-5 mb-4 shrink-0 shadow-xl bg-[#222222] text-white flex items-center justify-center min-h-[120px]">
                            <div className="w-6 h-6 border-2 border-[#FFCC00]/30 border-t-[#FFCC00] rounded-full animate-spin"></div>
                        </div>
                    ) : currentQuestion ? (
                        <div className="flex flex-col mb-4">
                            {/* 1. 메인 질문 카드 */}
                            <div
                                key={currentQuestion.id} // 카드가 바뀔 때마다 확실하게 리렌더링 애니메이션이 발생하도록 고유 Key 부여
                                className={`w-full rounded-[24px] p-5 shrink-0 shadow-xl flex justify-between gap-4 animate-in fade-in zoom-in-95 duration-300 ${currentQuestion?.isPaid ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-[#F0F0F0] text-[#1A1A1A]'}`}
                            >
                                <div className="flex flex-col gap-3 flex-1">
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-black/10 rounded-full flex items-center justify-center text-sm">
                                                {currentQuestion?.avatar}
                                            </div>
                                            <span className="font-bold text-[14px]">{currentQuestion?.author}</span>

                                            {/* 1 / 총질문개수 형태로 표기 (currentIdx에 따라 유동적으로 변함) */}
                                            <span className="text-[11px] font-bold bg-black/5 px-2 py-1 rounded-md ml-1 tracking-widest">
                                                1위
                                            </span>

                                            {currentQuestion?.clusterSize && currentQuestion.clusterSize > 1 && (
                                                <span className="text-[11px] font-extrabold bg-blue-100 text-blue-700 px-2 py-1 rounded-md border border-blue-200 flex items-center shadow-sm ml-1">
                                                    🔥+{currentQuestion.clusterSize - 1}
                                                </span>
                                            )}
                                        </div>
                                        {currentQuestion?.isPrivate && (
                                            <div className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-extrabold px-2 py-1 rounded-lg">
                                                <Lock className="w-3 h-3" strokeWidth={3} /> 비공개
                                            </div>
                                        )}
                                    </div>
                                    <p className="font-extrabold text-[16px] leading-snug">{currentQuestion?.content}</p>
                                </div>

                                <div className="flex flex-col gap-2 shrink-0 justify-center">
                                    <button
                                        onClick={() => acknowledgeQuestion(currentQuestion)}
                                        className={`px-3 py-2.5 rounded-xl text-[12px] font-bold flex items-center justify-center transition-all ${isReading ? 'bg-red-500 text-white shadow-lg' : 'bg-[#1A1A1A] text-[#FFCC00]'}`}
                                    >
                                        <Volume2 className={`w-3.5 h-3.5 mr-1.5 ${isReading ? 'animate-pulse' : ''}`} />
                                        {isReading ? '읽는 중...' : '질문 읽기'}
                                    </button>
                                    <button
                                        onClick={() => completeQuestion(Number(currentQuestion?.id))}
                                        className="px-3 py-2.5 rounded-xl text-[12px] font-bold bg-[#E0E0E0] hover:bg-[#D0D0D0] text-gray-700"
                                    >
                                        답변 완료
                                    </button>
                                </div>
                            </div>

                            {/* 2. 시각적 랭킹 확인을 위한 '실시간 다음 대기열' 리스트 추가 렌더링 */}
                            {questionQueue.length > 1 && (
                                <div className="w-full bg-[#1A1A1A] border border-gray-800 rounded-xl p-3 mt-2 flex flex-col gap-2 animate-in fade-in duration-500">
                                    <p className="text-xs font-bold text-gray-500 mb-1 flex items-center">
                                        <span className="flex items-center">
                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></span>
                                            실시간 AI 랭킹 대기열 (멘토 발화 맥락 연동 중)
                                        </span>
                                        {/* 💡 [추가]: 현재 대기열에 쌓인 전체 질문 개수 렌더링 */}
                                        <span className="text-[11px] text-gray-400 font-extrabold bg-gray-800/50 px-2 py-0.5 rounded-md border border-gray-800">
                                            총 {questionQueue.length}개
                                        </span>
                                    </p>
                                    {/* 실시간 랭킹 2위~3위까지 2개 렌더링 */}
                                    {questionQueue.slice(1, 3).map((q, idx) => (
                                        <div key={q.id} className="flex items-center gap-3 opacity-70 hover:opacity-100 transition-all duration-300">
                                            <span className="text-[10px] font-extrabold bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-700">
                                                {idx + 2}위
                                            </span>
                                            <p className="text-[12px] text-gray-300 truncate flex-1">{q.content}</p>
                                            {q.isPaid && <span className="text-[10px] bg-[#FFCC00] text-black px-1.5 rounded font-bold">유료</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        // 대기 중인 질문이 없을 때의 빈 상태(Empty State) UI
                        <div className="w-full rounded-[24px] p-5 mb-4 shrink-0 shadow-sm border border-gray-800 bg-[#1A1A1A] text-gray-400 flex flex-col items-center justify-center min-h-[120px]">
                            <MessageSquare className="w-6 h-6 mb-2 opacity-50" />
                            <p className="text-sm font-medium">현재 대기 중인 질문이 없습니다.</p>
                            <p className="text-xs text-gray-500 mt-1">채팅창에 올라온 질문이 이곳에 표시됩니다.</p>
                        </div>
                    )}

                    {/* [2] 비디오 화면 영역 */}
                    <div className="w-full aspect-[16/9] bg-[#1A1A1A] rounded-2xl relative overflow-hidden flex flex-col justify-between shadow-2xl border border-gray-800 shrink-0">
                        {isCameraOn ? (
                            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted />
                        ) : (
                            <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-[#1A1A1A]">
                                <VideoOff className="w-8 h-8 text-gray-500 mb-2" />
                                <span className="text-[13px] text-gray-500 font-medium">카메라가 꺼져 있습니다</span>
                            </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>

                        {/* 비디오 내부 상단 뱃지 (질문이 존재하고, 질문 읽기 상태일 때만 노출) */}
                        <div className="relative w-full flex justify-center pt-4 z-10">
                            {/* 질문 읽기 버튼이 작동했을 때만 뱃지를 렌더링합니다 */}
                            {isReading && currentQuestion && (
                                <div className={`text-[11px] font-bold px-4 py-1.5 rounded-full backdrop-blur-md shadow-md animate-in fade-in duration-300 ${currentQuestion.isPrivate ? 'bg-red-600 text-white' : 'bg-[#FFCC00] text-[#1A1A1A]'}`}>
                                    {currentQuestion.isPrivate ? "비공개 질문 답변중" : "공개 질문 답변중"}
                                </div>
                            )}
                        </div>

                        {/* 비디오 내부 하단 컨트롤러 (질문이 있을 때만 버튼 활성화 혹은 노출) */}
                        <div className="relative w-full flex items-center justify-between px-3 pb-3 gap-2 z-10">
                            <div className="flex gap-2">
                                {currentQuestion && (
                                    <>
                                        <button onClick={handleNextQuestion} className="bg-[#FFCC00] text-[#1A1A1A] text-[11px] font-bold px-3 py-2 rounded-full">다음 질문</button>
                                        <button onClick={() => completeQuestion(currentQuestion.id)} className="bg-[#FFCC00] text-[#1A1A1A] text-[11px] font-bold px-3 py-2 rounded-full">답변 완료</button>
                                        <button onClick={() => acknowledgeQuestion(currentQuestion)} className="bg-[#FFCC00] text-[#1A1A1A] text-[11px] font-bold px-3 py-2 rounded-full text-center active:scale-95 transition-transform">질문 다시 읽기</button>
                                    </>
                                )}
                            </div>
                            <button className="bg-black/50 backdrop-blur-md p-2 rounded-full text-white"><Settings className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>

                {/* [3] 채팅 영역 (isChatOpen이 true일 때만 렌더링되도록 조건부 처리 추가) */}
                {isChatOpen && (
                    <div className="flex-1 flex flex-col mt-4 animate-in fade-in slide-in-from-bottom-8 duration-500 overflow-hidden">

                        <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pb-6 pr-2">

                            {/* 유료 질문을 제외한 순수 채팅 개수만 체크 */}
                            {chats.filter((chat) => chat.type !== 'paid').length === 0 ? (
                                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                                    아직 대화 내용이 없습니다.
                                </div>
                            ) : (
                                chats
                                    // 유료 질문은 채팅창 화면에 아예 렌더링하지 않음.
                                    .filter((chat) => chat.type !== 'paid')
                                    .map((chat) => (
                                        <div key={chat.id} className="flex gap-3">
                                            <img
                                                src="/images/mentee_profile.jpg"
                                                alt={`${chat.author} 프로필`}
                                                className="w-9 h-9 rounded-full border-2 border-[#FFCC00] shrink-0 object-cover bg-gray-800"
                                            />
                                            <div className="flex flex-col items-start w-full">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-semibold text-gray-400">{chat.author}</span>
                                                </div>

                                                <div className="text-[15px] leading-relaxed break-all text-gray-100">
                                                    {chat.content}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>
                )}
            </div>

            <footer className="w-full bg-[#111111] border-t border-gray-800/50 py-3 px-6 flex justify-around items-center shrink-0 z-20 pb-safe relative">
                <button onClick={() => setMicOn(!isMicOn)} className={`p-3.5 rounded-full ${!isMicOn ? 'bg-red-500/20 text-red-500' : 'text-white hover:bg-white/5'}`}>
                    {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button onClick={() => setCameraOn(!isCameraOn)} className={`p-4 rounded-full shadow-lg ${isCameraOn ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-gray-700 text-white'}`}>
                    {isCameraOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
                <button onClick={() => setIsChatOpen(!isChatOpen)} className={`p-3.5 rounded-full ${isChatOpen ? 'text-[#FFCC00] bg-white/5' : 'text-white'}`}>
                    <MessageSquare className="w-6 h-6" />
                </button>
            </footer>

            {/* 방송 종료 팝업 */}
            {isExitPopupOpen && (
                <div className="absolute inset-0 bg-black/80 z-[100] flex items-center justify-center p-6 backdrop-blur-sm">
                    <div className="bg-[#1A1A1A] w-full max-w-sm rounded-[32px] p-8 border border-gray-800 text-center">
                        <div className="bg-red-500/20 p-4 rounded-2xl inline-block mb-6"><PhoneOff className="w-8 h-8 text-red-500" /></div>
                        <h3 className="text-xl font-bold text-white mb-2">방송을 종료하시겠습니까?</h3>
                        <p className="text-gray-400 text-[15px] mb-8">지금 종료하시면 라이브 세션이 완전히 닫힙니다.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setIsExitPopupOpen(false)} className="flex-1 bg-gray-800 text-white font-bold py-4 rounded-2xl">취소</button>
                            <button onClick={handleConfirmExit} className="flex-1 bg-red-600 text-white font-bold py-4 rounded-2xl">방송 종료</button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}