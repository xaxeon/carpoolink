"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import apiClient from "@/lib/apiClient";

import { io, Socket } from "socket.io-client";
import { Users, Send, Sparkles, Star, X, ChevronUp, ChevronDown, AlertCircle, Play, Loader2, HelpCircle, RefreshCw } from "lucide-react";

import { useMentoringSession } from "@/hooks/useMentoringSession";
import { useWebRtcSession } from "@/hooks/useWebRtcSession";

interface Question {
    id: number;
    isPaid: boolean;
    isPrivate: boolean;
    author: string;
    avatar: string;
    content: string;
}

interface ChatMessage {
    id: string | number;
    type: "free" | "paid";
    author: string;
    senderId: string;
    content: string;
    isQuestion?: boolean;
    questionId?: string | null;
}

interface AiQuestion {
  content: string;
  category: string;
  reason: string;
}

// AI 질문 추천 카테고리 매핑 객체
const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
    concept: { 
        label: "💡 개념 확인", 
        color: "text-amber-400 bg-amber-400/10 border-amber-400/20" 
    },
    reasoning: { 
        label: "🤔 원리 파악", 
        color: "text-purple-400 bg-purple-400/10 border-purple-400/20" 
    },
    application: { 
        label: "🎯 실전 적용", 
        color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" 
    },
    comparison: { 
        label: "⚖️ 비교 분석", 
        color: "text-rose-400 bg-rose-400/10 border-rose-400/20" 
    },
    follow_up: { 
        label: "💬 꼬리 질문", 
        color: "text-blue-400 bg-blue-400/10 border-blue-400/20" 
    },
    default: { 
        label: "✨ 맞춤 질문", 
        color: "text-[#FFCC00] bg-[#FFCC00]/10 border-[#FFCC00]/20" 
    }
};

// ============================================================================
// [Wrapper 컴포넌트] 로딩 화면 & 방 입장 기록(History) 생성 게이트웨이
// ============================================================================
export default function LiveMentoringPage() {
    const params = useParams();
    const mentoringId = params?.id as string;

    const [isReady, setIsReady] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);

    const [role, setRole] = useState<string>("MENTEE");
    const [userId, setUserId] = useState<number | null>(null);
    const [userName, setUserName] = useState<string>("익명멘티");

    useEffect(() => {
        const initAndJoin = async () => {
            // 로컬스토리지에서 유저 정보 가져오기
            const storedRole = localStorage.getItem("role")?.toUpperCase() || "MENTEE";
            const storedUserId = localStorage.getItem("userId");
            const storedName = localStorage.getItem("nickname") || "익명멘티";

            setRole(storedRole);
            setUserName(storedName);

            if (storedUserId) {
                const parsedUserId = Number(storedUserId);
                setUserId(parsedUserId);

                try {
                    await apiClient.post(`/api/mentorings/${mentoringId}/join`);

                    // 성공 시 진짜 방 화면으로 전환
                    setIsReady(true);
                } catch (err) {
                    console.error("방 입장 API 실패:", err);
                    setJoinError("방 입장에 실패했습니다. 잠시 후 다시 시도해주세요.");
                }
            } else {
                setJoinError("로그인이 필요한 서비스입니다.");
            }
        };

        if (mentoringId) {
            initAndJoin();
        }
    }, [mentoringId]);

    // 입장 실패 시 보여줄 에러 화면
    if (joinError) {
        return (
            <main className="flex flex-col w-full h-[100dvh] bg-[#161616] text-white items-center justify-center">
                <div className="bg-red-500/20 p-4 rounded-2xl mb-4">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <p className="text-red-400 font-bold mb-6">{joinError}</p>
                <Link href="/mentoring_list/live_list" className="bg-[#FFCC00] text-[#1A1A1A] font-bold px-6 py-3 rounded-xl hover:bg-[#E6B800]">
                    목록으로 돌아가기
                </Link>
            </main>
        );
    }

    // API 응답을 기다리는 동안 보여줄 로딩 화면 (웹소켓 연결 시도 전)
    if (!isReady || !userId) {
        return (
            <main className="flex flex-col w-full h-[100dvh] bg-[#161616] text-white items-center justify-center space-y-5">
                <div className="w-12 h-12 border-4 border-[#FFCC00]/20 border-t-[#FFCC00] rounded-full animate-spin"></div>
                <div className="text-center space-y-1.5">
                    <h2 className="text-xl font-bold text-gray-200 tracking-tight">멘토링 방을 준비 중입니다...</h2>
                    <p className="text-gray-400 text-sm">안전한 통신을 위해 입장 권한을 확인하고 있습니다.</p>
                </div>
            </main>
        );
    }

    // DB 기록 생성 완료 후 소켓 통신을 시작하는 컴포넌트 마운트
    return <LiveMentoringContent mentoringId={mentoringId} role={role} userId={userId} userName={userName} />;
}


// ============================================================================
// [실제 화면 컴포넌트] 소켓 연결, 화상 미디어, 채팅 UI 담당
// ============================================================================
function LiveMentoringContent({ mentoringId, role, userId, userName }: { mentoringId: string, role: string, userId: number, userName: string }) {

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [isPaidMode, setIsPaidMode] = useState(false);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [chatInput, setChatInput] = useState("");
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
    const [isPrivateQuestion, setIsPrivateQuestion] = useState(false);

    // AI 질문 추천 전용 상태 선언.
    const [aiQuestions, setAiQuestions] = useState<AiQuestion[]>([]);
    const [isAiLoading, setIsAiLoading] = useState(false);

    const [chatSocket, setChatSocket] = useState<Socket | null>(null);
    const [chats, setChats] = useState<ChatMessage[]>([]);
    const [onlineUserCount, setOnlineUserCount] = useState<number>(0);
    const [isChatClosed, setIsChatClosed] = useState(false);
    const [currentAnsweringQuestion, setCurrentAnsweringQuestion] = useState<Question | null>(null);

    const { sessionData, isLoading, error, isConnected, peerId, socket: rtcSocket } =
        useMentoringSession({ role, userId });

    const { remoteStreams, error: webRtcError } = useWebRtcSession({
        socket: rtcSocket,
        mentoringId,
        peerId: peerId || "",
        role,
        mentoringType: "GROUP",
        isJoined: isConnected
    });

    // AI 질문 추천 API 연동 로직
    const fetchAiRecommendations = async () => {
        setIsAiLoading(true);
        try {
            // 프론트엔드는 오직 실시간 대화 흐름(최근 채팅 5개)만 배열 상태 그대로 전달합니다.
            const recentChats = chats.slice(-5);
            const existingQuestionTexts = aiQuestions.map(q => q.content);

            // 전송할 Payload 객체를 먼저 변수로 생성.
            const payload = {
                userId: userId,
                chats: recentChats,
                excludeQuestions: existingQuestionTexts
            };

            // Core API(4000) 엔드포인트를 호출합니다.
            const res = await apiClient.post(`/api/mentorings/${mentoringId}/recommendations`, {
                userId: userId,
                chats: recentChats
            });
            
            if (res.data?.questions) {
                setAiQuestions(res.data.questions);
            }
        } catch (error) {
            console.error("🚨 AI 질문 추천 로드 실패:", error);
            alert("추천 질문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
            setIsAiLoading(false);
        }
    };

    useEffect(() => {
        // 팝업이 열렸을 때, 기존에 생성된 질문이 없을 경우에만 최초 1회 호출.
        // 이미 질문이 존재한다면 팝업을 닫았다 열어도 기존 질문을 유지.
        if (isAiOpen && aiQuestions.length === 0) {
            fetchAiRecommendations();
        }
    }, [isAiOpen]);

    const handleAutoPlayBlocked = useCallback(() => {
        setIsAutoplayBlocked(true);
    }, []);

    useEffect(() => {
        const CHAT_SERVER_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4001";
        console.log("🚀 [채팅] 서버로 연결 시도 중... 주소:", CHAT_SERVER_URL);

        const socket = io(CHAT_SERVER_URL, {
            path: '/chat/socket.io',
            withCredentials: true,
            transports: ["websocket", "polling"],
        });

        socket.on("connect", () => {
            console.log("✅ [채팅] 소켓 연결 완벽 성공!");

            socket.emit("join_chat", {
                mentoringId,
                userId: String(userId),
                userName
            }, (res: any) => {
                if (res?.ok) {
                    console.log("✅ [채팅] 방 입장 완료!");
                    socket.emit("get_message_history", { mentoringId, limit: 50, offset: 0 });
                    socket.emit("get_online_users", { mentoringId });
                } else {
                    console.error(`❌ [채팅] 방 입장 거부됨: ${res?.error}`);
                }
            });
        });

        socket.on("connect_error", (err) => {
            console.error("❌ [채팅] 소켓 연결 실패! 상세 원인:", err.message);
        });

        // 멘토가 질문 읽기를 눌렀을 때 (상태 -> ANSWERING)
        socket.on('question:acknowledged', (data: any) => {
            const q = data?.question;
            if (q) {
                setCurrentAnsweringQuestion({
                    id: Number(q.questionId),
                    isPaid: q.isPaid || false,
                    isPrivate: q.isPrivate || false,
                    author: q.user?.nickname || '익명멘티',
                    avatar: q.isPaid ? "💎" : "👤",
                    content: q.content,
                });
            }
        });

        // 멘토가 답변 완료를 눌렀을 때 (상태 -> COMPLETED)
        socket.on('question:completed', (data: any) => {
            const q = data?.question;
            if (q) {
                setCurrentAnsweringQuestion((prev) => {
                    // 완료된 질문이 현재 화면에 떠있는 질문과 같으면 화면에서 내립니다.
                    if (prev && prev.id === Number(q.questionId)) {
                        return null;
                    }
                    return prev;
                });
            }
        });

        socket.on("message_history", (messages: any[]) => {
            const mapped = messages.map(m => ({
                id: m.mentoringChatId,
                type: m.content.startsWith("[유료]") ? "paid" : "free",
                author: m.user?.nickname || m.userName || "익명멘티",
                senderId: String(m.userId),
                content: m.content.replace("[유료] ", ""),
                isQuestion: m.isQuestion,
                questionId: m.questionId,
            })) as ChatMessage[];
            setChats(mapped);
        });

        socket.on("new_message", (m: any) => {
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

        socket.on("user_joined", (data: any) => setOnlineUserCount(data.userCount));
        socket.on("user_left", (data: any) => setOnlineUserCount(data.userCount));
        socket.on("online_users", (data: any) => setOnlineUserCount(data.userCount));

        socket.on("room_closed", (data: any) => {
            setIsChatClosed(true);
            alert("멘토링이 종료되었습니다.");
            window.location.href = "/mentoring_list/live_list";
        });

        socket.on("error", (err: any) => {
            console.error("Socket error:", err);
        });

        setChatSocket(socket);

        return () => {
            socket.emit("leave_chat", { mentoringId, userId: String(userId), userName });
            socket.disconnect();
        };
    }, [mentoringId, userId, userName]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chats]);

    // 멘토가 라이브 멘토링을 종료하면 멘티 자동 이동
    useEffect(() => {
        if (!rtcSocket) return;

        const handleMentoringEnded = () => {
            window.location.href = "/mentoring_list/live_list";
        };

        rtcSocket.on("mentoring:ended", handleMentoringEnded);

        return () => {
            rtcSocket.off("mentoring:ended", handleMentoringEnded);
        };
    }, [rtcSocket]);

    const handleSend = () => {
        if (!chatInput.trim() || !chatSocket || isChatClosed) return;

        if (chatInput.length > 200) {
            alert("메시지는 최대 200자까지만 입력할 수 있습니다.");
            return;
        }

        if (isPaidMode) {
            setIsPopupOpen(true);
        } else {
            const payload = {
                mentoringId,
                userId: String(userId),
                userName,
                content: chatInput
            };
            chatSocket.emit("send_message", payload);
            setChatInput("");
        }
    };

    const confirmPaidQuestion = () => {
        setIsPopupOpen(false);
        if (chatSocket && !isChatClosed) {
            // 유료 질문은 core-api에 등록하여 잔액 차감 및 실시간 이벤트 전파를 수행합니다.
            (async () => {
                try {
                    await apiClient.post(`/api/mentorings/${mentoringId}/questions`, {
                        content: chatInput,
                        isPaid: true,
                        isPrivate: isPrivateQuestion,
                    });
                    // 등록 성공하면 입력 초기화
                    setChatInput("");
                    setIsPaidMode(false);
                    setIsPrivateQuestion(false);
                } catch (err: any) {
                    console.error('유료 질문 등록 실패', err);
                    alert(err?.response?.data?.message || '유료 질문 전송에 실패했습니다.');
                }
            })();
        }
    };

    // 문자열 대신 AiQuestion 객체를 받도록 수정
    const handleSuggestionClick = (question: AiQuestion) => {
        setChatInput(question.content); // 채팅 입력창에 텍스트 채우기
        setIsAiOpen(false);             // 팝업 닫기 (선택 사항)
    };

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
            <main className="flex flex-col w-full h-[100dvh] bg-[#161616] text-white items-center justify-center">
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

    return (
        <main className="flex flex-col w-full h-[100dvh] bg-[#161616] text-white relative font-sans overflow-hidden">
            <header className="w-full px-5 py-4 flex items-center justify-between shrink-0 z-10">
                <Link href="/mentoring_list/live_list" className="inline-flex items-center hover:opacity-80 transition-opacity">
                    <img src="/icons/arrow.svg" alt="화살표 아이콘" className="w-5 h-5 mr-2 text-[#FFCC00]" />
                    <span className="font-bold text-[17px]">나가기</span>
                </Link>
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-[#2A2A2A] px-3 py-1.5 rounded-full">
                        <div className={`w-2 h-2 rounded-full mr-2 ${isConnected && chatSocket?.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-xs font-bold text-gray-200 tracking-wider">
                            {isConnected && !isChatClosed ? 'LIVE' : 'OFF'}
                        </span>
                    </div>
                    <div className="flex items-center text-gray-400 text-sm font-medium">
                        <Users className="w-4 h-4 mr-1.5" />
                        {onlineUserCount}
                    </div>
                </div>
            </header>

            <div className="px-4 shrink-0 z-10 flex flex-col gap-3">
                {/* 현재 답변 중인 질문이 있고, '공개(isPrivate: false)'일 때만 질문 카드를 렌더링합니다. */}
                {currentAnsweringQuestion && !currentAnsweringQuestion.isPrivate && (
                    <div className={`w-full rounded-[20px] p-4 shrink-0 shadow-lg flex justify-between gap-3 animate-in slide-in-from-top-4 fade-in duration-300 ${currentAnsweringQuestion.isPaid ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-[#F0F0F0] text-[#1A1A1A]'}`}>
                        <div className="flex flex-col gap-2 flex-1">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-black/10 rounded-full flex items-center justify-center text-xs">
                                    {currentAnsweringQuestion.avatar}
                                </div>
                                <span className="font-bold text-[13px]">{currentAnsweringQuestion.author}</span>
                            </div>
                            <p className="font-bold text-[15px] leading-snug">{currentAnsweringQuestion.content}</p>
                        </div>
                    </div>
                )}

                <div className="w-full aspect-[16/9] bg-gray-800 rounded-2xl relative overflow-hidden flex items-center justify-center shadow-xl border border-gray-800/50">
                    {remoteStreams.size > 0 ? (
                        <>
                            {Array.from(remoteStreams.entries()).map(([id, stream]) => (
                                <MediaRenderer
                                    key={id}
                                    stream={stream}
                                    onBlocked={() => handleAutoPlayBlocked}
                                />
                            ))}

                            {isAutoplayBlocked && (
                                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                    <p className="text-white mb-3 text-sm font-medium">오디오 정책으로 인해 미디어가 일시정지되었습니다.</p>
                                    <button
                                        onClick={() => {
                                            // 화면 내의 모든 미디어 요소를 강제로 재생시킵니다
                                            document.querySelectorAll('video, audio').forEach(el => {
                                                (el as HTMLMediaElement).play().catch(console.error);
                                            });
                                            setIsAutoplayBlocked(false);
                                        }}
                                        className="bg-[#FFCC00] text-[#1A1A1A] font-bold px-6 py-2.5 rounded-full flex items-center gap-2 active:scale-95 transition-transform shadow-lg"
                                    >
                                        <Play className="w-4 h-4" fill="currentColor" /> 미디어 재생하기
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-3">
                            <div className="text-gray-400 text-sm animate-pulse">멘토의 영상을 기다리는 중...</div>
                        </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>

                    {/* 비디오 내부 상단 뱃지(질문 읽기 상태일 때만 노출, 비공개/공개 색상 구분) */}
                    {currentAnsweringQuestion && (
                        <div className={`absolute top-4 text-[11px] font-bold px-4 py-1.5 rounded-full backdrop-blur-md shadow-md animate-in fade-in duration-300 ${currentAnsweringQuestion.isPrivate
                                ? 'bg-red-600 text-white'
                                : 'bg-[#FFCC00] text-[#1A1A1A]'
                            }`}>
                            <span className="text-xs font-bold tracking-wide">
                                {currentAnsweringQuestion.isPrivate ? '비공개 질문 답변 중' : '공개 질문 답변 중'}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className="px-4 mt-5 mb-2 shrink-0 z-10">
                {isPaidMode ? (
                    <button disabled={isChatClosed} onClick={() => setIsPaidMode(false)} className="w-full bg-white text-[#1A1A1A] font-bold text-[15px] py-3.5 rounded-xl flex items-center justify-center active:scale-[0.98] transition-all disabled:opacity-50">
                        무료 채팅으로 돌아가기
                    </button>
                ) : (
                    <button disabled={isChatClosed} onClick={() => setIsPaidMode(true)} className="w-full bg-[#FFCC00] text-[#1A1A1A] font-bold text-[15px] py-3.5 rounded-xl flex items-center justify-center shadow-[0_4px_16px_rgba(255,204,0,0.3)] active:scale-[0.98] transition-all disabled:opacity-50">
                        <Star className="w-4 h-4 mr-2" fill="currentColor" />
                        유료 질문하기
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5 z-10 custom-scrollbar">
                {/* 유료 질문을 걸러낸 순수 채팅 개수만 체크 */}
                {chats.filter((chat) => chat.type !== 'paid').length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                        채팅 내역이 없습니다. 첫 인사를 남겨보세요!
                    </div>
                ) : (
                    chats
                        // 유료 질문은 채팅창 화면에 아예 렌더링하지 않음
                        .filter((chat) => chat.type !== 'paid')
                        .map((chat) => {
                            const isMentor = sessionData?.host?.userId && String(chat.senderId) === String(sessionData.host.userId);
                            const profileImage = isMentor ? "/images/mentor_profile.jpg" : "/images/mentee_profile.jpg";

                            return (
                                <div key={chat.id} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <img
                                        src={profileImage}
                                        alt={isMentor ? "멘토 프로필" : "멘티 프로필"}
                                        className="w-9 h-9 rounded-full object-cover shrink-0 bg-gray-800 border-2 border-[#FFCC00]"
                                    />

                                    <div className="flex flex-col items-start w-full">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-semibold text-gray-400">{chat.author}</span>
                                        </div>

                                        <div className="text-[15px] break-all leading-relaxed text-gray-100">
                                            {chat.content}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="relative px-4 pb-6 pt-2 shrink-0">
                {isPaidMode && <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#FFCC00]/30 to-transparent pointer-events-none z-0 transition-all duration-500"></div>}

                <div className="relative z-10 flex flex-col items-end">
                    {!isChatClosed && (
                        <>
                            {/* AI 추천 토글 버튼 */}
                            <button onClick={() => setIsAiOpen(!isAiOpen)} className="flex items-center gap-1.5 px-3 py-1.5 mb-2 bg-[#222222] border border-gray-700/50 rounded-full shadow-md hover:bg-gray-800 transition-colors active:scale-95">
                                <Sparkles className="w-3.5 h-3.5 text-[#FFCC00]" />
                                <span className="text-[13px] font-medium text-gray-300">{isAiOpen ? "AI 추천 닫기" : "AI 질문 추천"}</span>
                                {isAiOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
                            </button>

                            {/* AI 추천 팝업 컨테이너 */}
                            <div className={`w-full bg-[#222222] border border-gray-700/50 rounded-2xl shadow-lg transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${isAiOpen ? "max-h-80 opacity-100 p-4 mb-3" : "max-h-0 opacity-0 p-0 m-0 border-transparent"}`}>
                                {/* 팝업 내부 상단 새로고침 컨트롤러 */}
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-700/50 shrink-0">
                                    <span className="text-xs text-gray-400 font-medium">AI 실시간 맞춤 질문</span>
                                    <button 
                                        onClick={fetchAiRecommendations} 
                                        disabled={isAiLoading}
                                        className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-[#FFCC00] transition-colors disabled:opacity-50"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin text-[#FFCC00]' : ''}`} />
                                        {isAiLoading ? '생성 중...' : '새로고침'}
                                    </button>
                                </div>

                                {/* 팝업 내부 하단 추천 질문 렌더 영역 */}
                                <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                                    {isAiLoading ? (
                                        // 1. 로딩 상태 UI
                                        <div className="flex flex-col items-center justify-center py-6 gap-2">
                                            <Loader2 className="w-6 h-6 text-[#FFCC00] animate-spin" />
                                            <span className="text-xs text-gray-400">AI가 맞춤 질문을 생성 중입니다...</span>
                                        </div>
                                    ) : aiQuestions.length > 0 ? (
                                        // 2. 추천 질문 리스트 렌더링
                                        aiQuestions.map((item, idx) => {
                                            // 매핑 객체에서 현재 카테고리에 맞는 라벨과 색상 추출
                                            const catInfo = CATEGORY_MAP[item.category?.toLowerCase()] || CATEGORY_MAP.default;

                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleSuggestionClick(item)}
                                                    // group 클래스를 추가하여 하위 요소들이 호버 상태를 공유하도록 함
                                                    className="group flex flex-col text-left w-full p-3 rounded-xl bg-gray-800/40 border border-gray-700/50 hover:bg-gray-700/80 hover:border-gray-600 active:bg-gray-700 transition-all"
                                                >
                                                    <div className="flex items-start gap-2.5 w-full">
                                                        {/* 한글화 및 전용 색상 테마 적용 */}
                                                        <span className={`shrink-0 text-[10.5px] px-2 py-0.5 font-bold rounded-md border ${catInfo.color}`}>
                                                            {catInfo.label}
                                                        </span>
                                                        
                                                        {/* 질문 내용 */}
                                                        <span className="text-[13px] font-medium text-gray-300 leading-relaxed group-hover:text-white transition-colors">
                                                            {item.content}
                                                        </span>
                                                    </div>

                                                    {/* 추천 이유 (Grid 트랜지션을 활용한 부드러운 아코디언 효과) */}
                                                    <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-300 ease-in-out w-full">
                                                        <div className="overflow-hidden">
                                                            <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-gray-600/50">
                                                                <HelpCircle className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                                                                <span className="text-[11.5px] text-gray-400 leading-snug">
                                                                    {item.reason}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })
                                    ) : (
                                        // 📭 3. 데이터가 없을 때의 예외 처리
                                        <p className="text-center text-xs text-gray-500 py-4">
                                            현재 추천할 질문이 없습니다.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* 채팅 입력 영역 */}
                    <div className="relative flex items-end gap-3 w-full">
                        <div className="relative flex items-center w-full">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                disabled={isChatClosed}
                                placeholder={isChatClosed ? "멘토링이 종료되어 채팅을 입력할 수 없습니다." : "메시지를 입력해주세요... (최대 200자)"}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                className="w-full bg-[#222222] disabled:opacity-60 disabled:cursor-not-allowed text-white border-none rounded-2xl py-4 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-[#FFCC00]/50 placeholder-gray-500 text-[15px] shadow-sm"
                                maxLength={200}
                            />
                            <button disabled={isChatClosed || !chatInput.trim()} onClick={handleSend} className="absolute right-3 p-2 text-[#FFCC00] disabled:text-gray-600 hover:bg-[#FFCC00]/10 rounded-xl transition-colors active:scale-90">
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {isPopupOpen && (
                <div className="absolute inset-0 bg-black/70 z-50 flex items-center justify-center p-6 backdrop-blur-sm transition-opacity">
                    <div className="bg-[#1A1A1A] w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-gray-800 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-4">
                            <div className="bg-[#FFCC00]/20 p-3 rounded-2xl">
                                <Star className="w-6 h-6 text-[#FFCC00]" fill="currentColor" />
                            </div>
                            <button onClick={() => setIsPopupOpen(false)} className="text-gray-400 hover:text-white p-1 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">유료 질문을 전송할까요?</h3>
                        <p className="text-gray-400 text-[15px] mb-4 leading-relaxed">보유하신 <strong className="text-[#FFCC00]">질문권 1개</strong>가 차감되며, 멘토에게 최우선으로 전달됩니다.</p>

                        <div className="mb-4">
                            <div className="flex items-center justify-between">
                                <div className="text-white font-semibold">비공개 질문</div>
                                <label className="inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isPrivateQuestion}
                                        onChange={(e) => setIsPrivateQuestion(e.target.checked)}
                                        className="w-5 h-5 accent-[#FFCC00]"
                                    />
                                </label>
                            </div>
                            <p className="text-gray-400 text-sm mt-2">비공개 질문 선택시 질문과 답변이 다른 멘티들에게 공개되지 않습니다.</p>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setIsPopupOpen(false)} className="flex-1 bg-gray-800 text-white font-bold py-3.5 rounded-xl hover:bg-gray-700 transition-colors active:scale-95">취소</button>
                            <button onClick={confirmPaidQuestion} className="flex-1 bg-[#FFCC00] text-[#1A1A1A] font-bold py-3.5 rounded-xl hover:bg-[#E6B800] transition-colors active:scale-95">보내기</button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

import React, { memo } from "react";

// ============================================================================
// [미디어 렌더러 컴포넌트] 비디오와 오디오를 구분하여 안전하게 재생 (깜빡임 방지 버전)
// ============================================================================
const MediaRenderer = memo(function MediaRenderer({ stream, onBlocked }: { stream: MediaStream, onBlocked: () => void }) {
    const mediaRef = useRef<HTMLMediaElement>(null);

    const isVideo = stream.getVideoTracks().length > 0;
    const hasAudio = stream.getAudioTracks().length > 0;

    // 1. 스트림 설정 및 재생 관리 Effect
    useEffect(() => {
        if (mediaRef.current && stream) {
            // 이미 엘리먼트에 같은 스트림이 주입되어 있다면 아무것도 하지 않습니다.
            // srcObject를 매번 새로 대입하면 비디오 파이프라인이 초기화되면서 깜빡임이 발생합니다.
            if (mediaRef.current.srcObject !== stream) {
                mediaRef.current.srcObject = stream;
                mediaRef.current.play().catch((err) => {
                    console.warn("미디어 자동재생 차단됨:", err.message);
                    if (err.name === "NotAllowedError" || err.message.includes("play() failed")) {
                        onBlocked();
                    }
                });
            }
        }
    }, [stream, onBlocked]); // 이펙트 재실행 시 srcObject를 null로 밀어버리는 코드를 제거함

    // 2. 진짜 컴포넌트가 '언마운트' 될 때만 미디어 자원을 깔끔하게 해제하는 별도 Effect
    useEffect(() => {
        return () => {
            if (mediaRef.current) {
                mediaRef.current.srcObject = null;
            }
        };
    }, []); // 의존성 배열을 비워둠으로써 화면에서 아예 사라질 때 딱 1번만 실행됩니다.

    if (isVideo) {
        return (
            <video
                ref={mediaRef as any}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                playsInline
                muted={!hasAudio}
            />
        );
    } else {
        return <audio ref={mediaRef as any} autoPlay playsInline className="hidden" />;
    }
});