"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { PhoneOff, Users, Volume2, Settings, Mic, MicOff, Video, VideoOff, MessageSquare, Lock, AlertCircle } from "lucide-react";

import { useMentoringSession } from "@/hooks/useMentoringSession";
import { useWebRtcSession } from "@/hooks/useWebRtcSession";

interface Question {
    id: number;
    type: "free" | "paid";
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
}

export default function MentorLivePage() {
    const params = useParams();
    const mentoringId = params?.id as string;

    const [role, setRole] = useState<string>("MENTOR");
    const [userId, setUserId] = useState<number>(2);
    const [userName, setUserName] = useState<string>("멘토");

    const videoRef = useRef<HTMLVideoElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [isChatOpen, setIsChatOpen] = useState(true);
    const [isExitPopupOpen, setIsExitPopupOpen] = useState(false);
    const [isReading, setIsReading] = useState(false);
    const [currentIdx, setCurrentIdx] = useState(0);

    const [chatSocket, setChatSocket] = useState<Socket | null>(null);
    const [chats, setChats] = useState<ChatMessage[]>([]);
    const [onlineUserCount, setOnlineUserCount] = useState<number>(0);

    const { sessionData, isLoading, error, isConnected, peerId, socket, endMentoring } =
        useMentoringSession({ role, userId: userId || 0 });

    const { localStream, isCameraOn, isMicOn, setCameraOn, setMicOn, error: webRtcError } =
        useWebRtcSession({
            socket,
            mentoringId: sessionData?.mentoringId?.toString() || mentoringId || "",
            peerId: peerId || "",
            role: "MENTOR",
            mentoringType: "GROUP"
        });

    const questionQueue: Question[] = [
        { id: 1, type: "paid", isPrivate: true, author: "김세종", avatar: "👨‍💼", content: '"How do you negotiate equity in a Series B startup without losing the offer?"' },
        { id: 2, type: "free", isPrivate: false, author: "이유진", avatar: "👩‍💼", content: '"Can you share some tips on building a tech portfolio from scratch?"' }
    ];

    const currentQuestion = questionQueue[currentIdx];

    useEffect(() => {
        const storedRole = localStorage.getItem("role")?.toUpperCase();
        if (storedRole) setRole(storedRole);
        const storedUserId = localStorage.getItem("userId");
        if (storedUserId) setUserId(Number(storedUserId));
        const storedName = localStorage.getItem("nickname") || "멘토";
        setUserName(storedName);
    }, []);

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

        newSocket.on("message_history", (messages: any[]) => {
            const mapped = messages.map(m => ({
                id: m.mentoringChatId,
                type: m.content.startsWith("[유료]") ? "paid" : "free",
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
            }]);
        });

        newSocket.on("user_joined", (data: any) => setOnlineUserCount(data.userCount));
        newSocket.on("user_left", (data: any) => setOnlineUserCount(data.userCount));
        newSocket.on("online_users", (data: any) => setOnlineUserCount(data.userCount));

        setChatSocket(newSocket);

        return () => {
            newSocket.emit("leave_chat", { mentoringId, userId: String(userId), userName });
            newSocket.disconnect();
        };
    }, [mentoringId, userId, userName]);

    useEffect(() => {
        if (isChatOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [chats, isChatOpen]);

    useEffect(() => {
        if (videoRef.current && localStream) {
            videoRef.current.srcObject = localStream;
            videoRef.current.play().catch(console.error);
        }
    }, [localStream, isCameraOn]);

    const handleNextQuestion = () => {
        setCurrentIdx((prev) => (prev + 1) % questionQueue.length);
        setIsReading(false);
    };

    // 멘토링 세션 완전 종료 처리
    const handleConfirmExit = async () => {
        try {
            // 프론트엔드 WebRTC/Socket.io 세션 종료
            if (endMentoring) {
                await endMentoring();
            }

            // 목록으로 이동
            window.location.href = "/mentoring_list/live_list";
        } catch (err) {
            console.error("멘토링 종료 실패:", err);
            alert("방송 종료 중 오류가 발생했습니다.");
        }
    };

    if (isLoading) {
        return (
            <main className="flex flex-col w-full h-[100dvh] bg-[#161616] text-white items-center justify-center">
                <div className="w-8 h-8 border-4 border-[#FFCC00]/30 border-t-[#FFCC00] rounded-full animate-spin mb-4"></div>
                <p className="text-gray-300">멘토링 세션 로드 중...</p>
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

    return (
        <main className="flex flex-col w-full h-[100dvh] bg-[#161616] text-white font-sans overflow-hidden relative">

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

                <div className={`flex flex-col transition-all duration-500 ${!isChatOpen ? 'flex-1 justify-center' : 'justify-start pt-2'}`}>

                    {/* 상단 질문 카드 */}
                    <div className={`w-full rounded-[24px] p-5 mb-4 shrink-0 shadow-xl flex justify-between gap-4 ${currentQuestion.type === 'paid' ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-[#F0F0F0] text-[#1A1A1A]'}`}>
                        <div className="flex flex-col gap-3 flex-1">
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-black/10 rounded-full flex items-center justify-center text-sm">{currentQuestion.avatar}</div>
                                    <span className="font-bold text-[14px]">{currentQuestion.author}</span>
                                </div>
                                {currentQuestion.isPrivate && (
                                    <div className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-extrabold px-2 py-1 rounded-lg">
                                        <Lock className="w-3 h-3" strokeWidth={3} /> 비공개 질문
                                    </div>
                                )}
                            </div>
                            <p className="font-extrabold text-[16px] leading-snug">{currentQuestion.content}</p>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0 justify-center">
                            <button onClick={() => setIsReading(true)} className={`px-3 py-2.5 rounded-xl text-[12px] font-bold flex items-center justify-center transition-all ${isReading ? 'bg-red-500 text-white shadow-lg' : 'bg-[#1A1A1A] text-[#FFCC00]'}`}>
                                <Volume2 className={`w-3.5 h-3.5 mr-1.5 ${isReading ? 'animate-pulse' : ''}`} />
                                {isReading ? '읽는 중...' : '질문 읽기'}
                            </button>
                            <button onClick={handleNextQuestion} className="px-3 py-2.5 rounded-xl text-[12px] font-bold bg-[#E0E0E0] hover:bg-[#D0D0D0]">답변 완료</button>
                        </div>
                    </div>

                    {/* 비디오 화면 */}
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
                        <div className="relative w-full flex justify-center pt-4 z-10">
                            <div className={`text-[11px] font-bold px-4 py-1.5 rounded-full ${currentQuestion.isPrivate ? 'bg-red-600 text-white' : 'bg-[#FFCC00] text-[#1A1A1A]'}`}>
                                {currentQuestion.isPrivate ? "비공개 질문 답변중" : "공개 질문 답변중"}
                            </div>
                        </div>
                        <div className="relative w-full flex items-center justify-between px-3 pb-3 gap-2 z-10">
                            <div className="flex gap-2">
                                <button onClick={handleNextQuestion} className="bg-[#FFCC00] text-[#1A1A1A] text-[11px] font-bold px-3 py-2 rounded-full">다음 질문</button>
                                <button onClick={handleNextQuestion} className="bg-[#FFCC00] text-[#1A1A1A] text-[11px] font-bold px-3 py-2 rounded-full">답변 완료</button>
                                <button
                                    onClick={() => setIsReading(true)}
                                    className="bg-[#FFCC00] text-[#1A1A1A] text-[11px] font-bold px-3 py-2 rounded-full text-center active:scale-95 transition-transform"
                                >
                                    질문 다시 읽기
                                </button>
                            </div>
                            <button className="bg-black/50 backdrop-blur-md p-2 rounded-full text-white"><Settings className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>

                {/* 실시간 채팅 내역 (읽기 전용) */}
                {isChatOpen && (
                    <div className="flex-1 flex flex-col mt-4 animate-in fade-in slide-in-from-bottom-8 duration-500 overflow-hidden">
                        <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pb-6 pr-2">
                            {chats.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                                    아직 채팅 내역이 없습니다.
                                </div>
                            ) : (
                                chats.map((chat) => {
                                    const isMentor = sessionData?.host?.userId && String(chat.senderId) === String(sessionData.host.userId);
                                    const profileImage = isMentor ? "/images/mentor_profile.jpg" : "/images/mentee_profile.jpg";

                                    return (
                                        <div key={chat.id} className="flex gap-3">
                                            <img
                                                src={profileImage}
                                                alt={isMentor ? "멘토 프로필" : "멘티 프로필"}
                                                className="w-9 h-9 rounded-full object-cover shrink-0 bg-gray-800 border-2 border-[#FFCC00]"
                                            />

                                            <div className="flex flex-col items-start">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-semibold text-gray-400">{chat.author}</span>
                                                    {chat.type === 'paid' && <span className="bg-[#FFCC00] text-[#1A1A1A] text-[10px] font-extrabold px-1.5 py-0.5 rounded">유료 질문</span>}
                                                </div>
                                                <p className={`text-[15px] leading-relaxed break-all ${chat.type === 'paid' ? 'text-[#FFCC00]' : 'text-gray-100'}`}>
                                                    {chat.content}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        <div className="pb-4 text-center">
                            <span className="text-[11px] text-gray-600 font-medium tracking-tight">멘토 화면에서는 채팅 조회만 가능합니다.</span>
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

            {/* 종료 팝업 */}
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