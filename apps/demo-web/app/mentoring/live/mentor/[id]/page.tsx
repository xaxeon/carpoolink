"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { PhoneOff, Users, Volume2, Settings, Mic, MicOff, Video, VideoOff, MessageSquare, Lock, AlertCircle } from "lucide-react";

import { useMentoringSession } from "@/hooks/useMentoringSession";
import { useWebRtcSession } from "@/hooks/useWebRtcSession";
// core-api 호출용 클라이언트
import apiClient from "@/lib/apiClient";

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
    author: string;
    senderId: string;
    content: string;
    isQuestion?: boolean;
    questionId?: string | null;
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

    // 💡 정보가 확정된 후, 실제 소켓 로직이 있는 Content 컴포넌트 실행
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

    // 💡 이제 이 훅들은 컴포넌트가 마운트될 때 단 한 번, 올바른 userId로 실행됩니다.
    const mentoringOptions = useMemo(() => ({ role, userId }), [role, userId]);
    const { sessionData, isConnected, peerId, socket, endMentoring, isLoading, error } = useMentoringSession(mentoringOptions);

    const webRtcConfig = useMemo(() => ({
        socket,
        mentoringId: sessionData?.mentoringId?.toString() || mentoringId,
        peerId: peerId || "",
        role: "MENTOR",
        mentoringType: "GROUP" as const,
        isJoined: isConnected
    }), [socket, sessionData?.mentoringId, mentoringId, peerId]);

    const { localStream, isCameraOn, isMicOn, setCameraOn, setMicOn, error: webRtcError } = useWebRtcSession(webRtcConfig);

// [질문 목록 로드 - 초기 DB 데이터 반영]
    useEffect(() => {
        const fetchQuestions = async () => {
            if (!mentoringId) return;
            setIsLoadingQuestions(true);
            try {
                const response = await apiClient.get(`/api/mentorings/${mentoringId}/questions`, {
                    params: { status: "BEFORE" }
                });
                if (response.data?.questions) {
                    // 팀원의 API 응답 데이터를 본인의 데이터 구조(type, avatar 등)와 호환되도록 매핑
                    const mappedQuestions = response.data.questions.map((q: any) => ({
                        id: q.questionId,
                        type: q.isPaid ? "paid" : "free",
                        isPaid: q.isPaid || false, // 💡 [추가 1] 타입스크립트 에러 해결
                        isPrivate: q.isPrivate || false,
                        author: q.user?.nickname || "익명멘티",
                        avatar: q.isPaid ? "💎" : "👤",
                        content: q.content,
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

    // 💡 [하이브리드 큐 생성] DB의 기존 질문들과 실시간 채팅창의 질문들을 중복 없이 결합합니다.
    const questionQueue = useMemo(() => {
        // 1. 실시간 채팅 목록에서 질문들만 필터링하여 매핑
        const chatQuestions = chats
            .filter((chat) => chat.isQuestion || chat.type === 'paid')
            .map((chat) => ({
                id: chat.questionId || chat.id,
                type: chat.type,
                isPaid: chat.type === 'paid', // 💡 [추가 2] 타입스크립트 에러 해결
                isPrivate: chat.isPrivate || false,
                author: chat.author,
                avatar: chat.type === 'paid' ? "💎" : "👤",
                content: chat.content
            }));

        // 2. 초기 DB 질문 리스트(questions)를 기반으로 두고, 실시간 질문 중 중복되지 않은 것만 큐에 추가
        const unified = [...questions];
        chatQuestions.forEach((cq) => {
            const isDuplicate = unified.some((q) => String(q.id) === String(cq.id));
            if (!isDuplicate) {
                unified.push(cq);
            }
        });
        // 3. 유료 질문 우선 정렬 로직
        // 결합된 배열(unified)을 유료와 무료로 분리.
        const paidQuestions = unified.filter(q => q.isPaid);
        const freeQuestions = unified.filter(q => !q.isPaid);

        // 유료 질문들을 무조건 배열의 맨 앞으로 보내고, 그 뒤에 무료 질문들을 붙임.
        // 각각의 배열 내에서는 FIFO 유지.
        return [...paidQuestions, ...freeQuestions];
    }, [questions, chats]);

    // 현재 인덱스에 해당하는 질문 가져오기 (결합된 완성형 큐 사용)
    const currentQuestion = questionQueue[currentIdx];

    // 질문 목록(questionQueue)의 길이가 줄어들거나 변경될 때 인덱스를 안전하게 가리키도록 동기화
    useEffect(() => {
        if (questionQueue.length === 0) {
            setCurrentIdx(0);
        } else if (currentIdx >= questionQueue.length) {
            // 모든 질문을 다 본 상태(currentIdx === questionQueue.length)를 허용.
            // 새치기 등으로 인해 인덱스가 전체 길이를 '초과'했을 때만 마지막 인덱스로 보정.
            setCurrentIdx(questionQueue.length);
        }
    }, [questionQueue.length, currentIdx]);

    // page.tsx의 컴포넌트 내부 적절한 위치에 추가해서 로그를 확인해보세요.
    useEffect(() => {
        console.log("현재 들어온 전체 채팅 목록:", chats);
    }, [chats]);

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

        newSocket.on('question:completed', (data: any) => {
            try {
                const q = data?.question;
                if (!q) return;

                const removeId = Number(q.questionId);

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

    // 💡 [수정 2] 다음 질문/답변 완료 버튼 로직 수정
    const handleNextQuestion = () => {
    // 💡 실시간 하이브리드 큐(questionQueue)의 범위를 벗어나지 않도록 안전하게 인덱스 증가
        if (currentIdx < questionQueue.length) {
            setCurrentIdx((prev) => prev + 1); // 인덱스를 올려 다음 질문으로 이동 (끝에 도달 시 빈 카드 노출)
            setIsReading(false); // 새로운 질문을 읽기 위해 기존 읽기 상태 초기화
        }
    };

    const acknowledgeQuestion = async (questionId: number) => {
        try {
            await apiClient.post(`/api/mentorings/${mentoringId}/questions/${questionId}/acknowledge`);
            setIsReading(true);
        } catch (err: any) {
            console.error('질문 확인 실패', err);
            alert(err?.response?.data?.message || '질문 확인에 실패했습니다.');
        }
    };

    const completeQuestion = async (questionId: number) => {
        try {
            await apiClient.post(`/api/mentorings/${mentoringId}/questions/${questionId}/complete`);
            setIsReading(false);

            setQuestions((prev) => prev.filter(q => q.id !== questionId));
        } catch (err: any) {
            console.error('질문 완료 처리 실패', err);
            alert(err?.response?.data?.message || '질문 완료 처리에 실패했습니다.');
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

    // 메인 라이브 화면 UI (기존과 동일)
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
                        // 1. 로딩 중 상태
                        <div className="w-full rounded-[24px] p-5 mb-4 shrink-0 shadow-xl bg-[#222222] text-white flex items-center justify-center min-h-[120px]">
                            <div className="w-6 h-6 border-2 border-[#FFCC00]/30 border-t-[#FFCC00] rounded-full animate-spin"></div>
                        </div>
                    ) : currentQuestion ? (
                        // 2. 대기 중인 질문이 있을 때
                        <div className={`w-full rounded-[24px] p-5 mb-4 shrink-0 shadow-xl flex justify-between gap-4 transition-all duration-300 ${currentQuestion?.isPaid ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-[#F0F0F0] text-[#1A1A1A]'}`}>
                            <div className="flex flex-col gap-3 flex-1">
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-black/10 rounded-full flex items-center justify-center text-sm">
                                            {currentQuestion?.avatar}
                                        </div>
                                        <span className="font-bold text-[14px]">{currentQuestion?.author}</span>
                                        {/* 질문 순서 표시 */}
                                        <span className="text-[11px] font-bold bg-black/5 px-2 py-1 rounded-md ml-1">
                                            {currentIdx + 1} / {questionQueue.length}
                                        </span>
                                    </div>
                                    {currentQuestion?.isPrivate && (
                                        <div className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-extrabold px-2 py-1 rounded-lg">
                                            <Lock className="w-3 h-3" strokeWidth={3} /> 비공개 질문
                                        </div>
                                    )}
                                </div>
                                <p className="font-extrabold text-[16px] leading-snug">{currentQuestion?.content}</p>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0 justify-center">
                                <button onClick={() => setIsReading(true)} className={`px-3 py-2.5 rounded-xl text-[12px] font-bold flex items-center justify-center transition-all ${isReading ? 'bg-red-500 text-white shadow-lg' : 'bg-[#1A1A1A] text-[#FFCC00]'}`}>
                                    <Volume2 className={`w-3.5 h-3.5 mr-1.5 ${isReading ? 'animate-pulse' : ''}`} />
                                    {isReading ? '읽는 중...' : '질문 읽기'}
                                </button>
                                <button onClick={handleNextQuestion} className="px-3 py-2.5 rounded-xl text-[12px] font-bold bg-[#E0E0E0] hover:bg-[#D0D0D0] text-gray-700">
                                    답변 완료
                                </button>
                            </div>
                        </div>
                    ) : (
                        // 3. 대기 중인 질문이 없을 때의 빈 상태(Empty State) UI
                        <div className="w-full rounded-[24px] p-5 mb-4 shrink-0 shadow-sm border border-gray-800 bg-[#1A1A1A] text-gray-400 flex flex-col items-center justify-center min-h-[120px]">
                            <MessageSquare className="w-6 h-6 mb-2 opacity-50" />
                            <p className="text-sm font-medium">현재 대기 중인 질문이 없습니다.</p>
                            <p className="text-xs text-gray-500 mt-1">채팅창에 올라온 질문이 이곳에 표시됩니다.</p>
                        </div>
                    )}

                    {/* [2] 비디오 화면 영역 (조건부 렌더링 {currentQuestion &&} 제거) */}
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

                        {/* 비디오 내부 상단 뱃지 (질문이 있을 때만 노출) */}
                        <div className="relative w-full flex justify-center pt-4 z-10">
                            {/* 현재 질문이 있을 때만 뱃지 렌더링 */}
                            {currentQuestion && (
                                <div className={`text-[11px] font-bold px-4 py-1.5 rounded-full ${currentQuestion.isPrivate ? 'bg-red-600 text-white' : 'bg-[#FFCC00] text-[#1A1A1A]'}`}>
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
                                        <button onClick={() => acknowledgeQuestion(currentQuestion.id)} className="bg-[#FFCC00] text-[#1A1A1A] text-[11px] font-bold px-3 py-2 rounded-full text-center active:scale-95 transition-transform">질문 다시 읽기</button>
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
                            
                            {/* 💡 수정됨: 채팅이 0개일 때 빈 화면 표시, 아닐 때 채팅 목록 렌더링 */}
                            {chats.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                                    아직 대화 내용이 없습니다.
                                </div>
                            ) : (
                                chats.map((chat) => (
                                    <div key={chat.id} className="flex gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gray-800 border-2 border-[#FFCC00] shrink-0" />
                                        {/* 넓이를 차지하도록 w-full 추가 */}
                                        <div className="flex flex-col items-start w-full"> 
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-semibold text-gray-400">{chat.author}</span>
                                                
                                                {/* 기존 유료 질문 배지 */}
                                                {chat.type === 'paid' && (
                                                    <span className="bg-[#FFCC00] text-[#1A1A1A] text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                                                        유료 질문
                                                    </span>
                                                )}
                                                
                                                {/* 💡 [추가] 일반 질문 배지 (유료가 아니면서 isQuestion이 true일 때) */}
                                                {chat.isQuestion && chat.type !== 'paid' && (
                                                    <span className="bg-blue-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                                        💡 질문
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* 💡 [수정] 질문 여부에 따른 말풍선 조건부 스타일링 */}
                                            <div 
                                                className={`text-[15px] leading-relaxed break-all ${
                                                    chat.type === 'paid' 
                                                        ? 'text-[#FFCC00]' // 유료 질문 텍스트 스타일
                                                        : chat.isQuestion 
                                                            ? 'bg-blue-900/30 border border-blue-500/50 text-blue-50 px-3 py-2 rounded-2xl rounded-tl-sm w-fit max-w-[90%]' // 🎯 질문 말풍선 (다크 테마 호환 파란색)
                                                            : 'text-gray-100' // 일반 채팅 텍스트 스타일
                                                }`}
                                            >
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