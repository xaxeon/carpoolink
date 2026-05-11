"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Users, Send, Sparkles, Star, X, ChevronUp, ChevronDown, AlertCircle, Mic, MicOff, Play } from "lucide-react";
import { useMentoringSession } from "@/hooks/useMentoringSession";
import { useWebRtcSession } from "@/hooks/useWebRtcSession";

interface ChatMessage {
    id: number;
    type: "free" | "paid";
    author: string;
    avatar: string;
    content: string;
}

export default function LiveMentoringPage() {
    const [role, setRole] = useState<string>("MENTEE");
    const [userId, setUserId] = useState<number>(2);

    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    const [isPaidMode, setIsPaidMode] = useState(false);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [chatInput, setChatInput] = useState("");
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

    useEffect(() => {
        const storedRole = localStorage.getItem("role")?.toUpperCase();

        if (storedRole) setRole(storedRole);

        const storedUserId = localStorage.getItem("userId");
        if (storedUserId) setUserId(Number(storedUserId));
    }, []);

    // Hook 적용
    const { sessionData, participantCount, isLoading, error, isConnected, peerId, socket } =
        useMentoringSession({ role, userId });

    // WebRTC 세션 시작
    const { isMicOn, setMicOn, remoteStreams, isReady: webRtcReady, error: webRtcError } =
        useWebRtcSession({
            socket,
            mentoringId: sessionData?.mentoringId?.toString() || "",
            peerId: peerId || "",
            role,
            mentoringType: "GROUP"
        });

    const [chats, setChats] = useState<ChatMessage[]>([
        { id: 1, type: "free", author: "Marcus T.", avatar: "👩‍💻", content: "The point about insurance liability in carpooling is fascinating. How does this apply to cross-border routes?" },
        { id: 2, type: "free", author: "Elena R.", avatar: "🧔‍♂️", content: "Great insights, Sarah! Looking forward to the demo." },
    ]);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chats]);

    // 💡 [중요 수정] 분리되어 들어오는 오디오/비디오 트랙을 하나의 스트림으로 병합
    useEffect(() => {
        if (remoteVideoRef.current && remoteStreams.size > 0) {
            const combinedStream = new MediaStream();

            remoteStreams.forEach((stream) => {
                stream.getTracks().forEach((track) => {
                    // 중복 트랙 추가 방지
                    if (!combinedStream.getTracks().find(t => t.id === track.id)) {
                        combinedStream.addTrack(track);
                    }
                });
            });

            if (combinedStream.getTracks().length > 0) {
                remoteVideoRef.current.srcObject = combinedStream;
                remoteVideoRef.current.play().catch((err) => {
                    console.warn("오토플레이가 차단되었습니다:", err);
                    if (err.name === "NotAllowedError" || err.message.includes("play() failed")) {
                        setIsAutoplayBlocked(true);
                    }
                });
            }
        }
    }, [remoteStreams]);

    const addNewChat = (type: "free" | "paid", text: string) => {
        const newChat: ChatMessage = {
            id: Date.now(),
            type: type,
            author: "나 (멘티)",
            avatar: "👤",
            content: text,
        };
        setChats((prev) => [...prev, newChat]);
    };

    const handleSend = () => {
        if (!chatInput.trim()) return;
        if (isPaidMode) {
            setIsPopupOpen(true);
        } else {
            addNewChat("free", chatInput);
            setChatInput("");
        }
    };

    const confirmPaidQuestion = () => {
        setIsPopupOpen(false);
        addNewChat("paid", chatInput);
        setChatInput("");
        setIsPaidMode(false);
    };

    const handleSuggestionClick = (question: string) => {
        const cleanText = question.replace(/^\d+\.\s*/, '');
        setChatInput(cleanText);
        setIsAiOpen(false);
    };

    if (isLoading) {
        return (
            <main className="flex flex-col w-full h-full bg-[#161616] text-white font-sans overflow-hidden items-center justify-center">
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
                <Link href="/mentoring/live" className="bg-[#FFCC00] text-[#1A1A1A] font-bold px-6 py-3 rounded-xl hover:bg-[#E6B800]">
                    목록으로 돌아가기
                </Link>
            </main>
        );
    }

    return (
        <main className="flex flex-col w-full h-full bg-[#161616] text-white relative font-sans overflow-hidden">
            <header className="w-full px-5 py-4 flex items-center justify-between shrink-0 z-10">
                <Link href="/mentoring/live" className="inline-flex items-center hover:opacity-80 transition-opacity">
                    <img src="/icons/arrow.svg" alt="화살표 아이콘" className="w-5 h-5 mr-2 text-[#FFCC00]" />
                    <span className="font-bold text-[17px]">나가기</span>
                </Link>
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-[#2A2A2A] px-3 py-1.5 rounded-full">
                        <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-xs font-bold text-gray-200 tracking-wider">
                            {isConnected ? 'LIVE' : 'OFF'}
                        </span>
                    </div>
                    <div className="flex items-center text-gray-400 text-sm font-medium">
                        <Users className="w-4 h-4 mr-1.5" />
                        {participantCount}
                    </div>
                </div>
            </header>

            <div className="px-4 shrink-0 z-10">
                <div className="w-full aspect-[16/9] bg-gray-800 rounded-2xl relative overflow-hidden flex items-center justify-center">
                    {remoteStreams.size > 0 ? (
                        <>
                            <video
                                ref={remoteVideoRef}
                                className="absolute inset-0 w-full h-full object-cover"
                                autoPlay
                                playsInline
                            />
                            {/* 브라우저 오토플레이 차단 시 나타나는 재생 버튼 */}
                            {isAutoplayBlocked && (
                                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                    <p className="text-white mb-3 text-sm font-medium">오디오 정책으로 인해 영상이 일시정지되었습니다.</p>
                                    <button
                                        onClick={() => {
                                            remoteVideoRef.current?.play();
                                            setIsAutoplayBlocked(false);
                                        }}
                                        className="bg-[#FFCC00] text-[#1A1A1A] font-bold px-6 py-2.5 rounded-full flex items-center gap-2 active:scale-95 transition-transform shadow-lg"
                                    >
                                        <Play className="w-4 h-4" fill="currentColor" />
                                        화면 재생하기
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
                    <div className="absolute top-4 bg-red-600 text-white text-[11px] font-bold px-4 py-1.5 rounded-full shadow-lg z-10">
                        비공개 질문 답변중
                    </div>
                </div>
            </div>

            <div className="px-4 mt-5 mb-2 shrink-0 z-10">
                {isPaidMode ? (
                    <button onClick={() => setIsPaidMode(false)} className="w-full bg-white text-[#1A1A1A] font-bold text-[15px] py-3.5 rounded-xl flex items-center justify-center active:scale-[0.98] transition-all">
                        무료 채팅으로 돌아가기
                    </button>
                ) : (
                    <button onClick={() => setIsPaidMode(true)} className="w-full bg-[#FFCC00] text-[#1A1A1A] font-bold text-[15px] py-3.5 rounded-xl flex items-center justify-center shadow-[0_4px_16px_rgba(255,204,0,0.3)] active:scale-[0.98] transition-all">
                        <Star className="w-4 h-4 mr-2" fill="currentColor" />
                        유료 질문하기
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5 z-10 custom-scrollbar">
                {chats.map((chat) => (
                    <div key={chat.id} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${chat.type === 'paid' ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-[#FFCC00]/20'}`}>
                            <span className="text-xl">{chat.avatar}</span>
                        </div>
                        <div className="flex flex-col items-start">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-gray-300">{chat.author}</span>
                                {chat.type === 'paid' && (
                                    <span className="bg-[#FFCC00] text-[#1A1A1A] text-[10px] font-extrabold px-1.5 py-0.5 rounded tracking-wide">
                                        유료 질문
                                    </span>
                                )}
                            </div>
                            <p className={`text-[15px] leading-relaxed ${chat.type === 'paid' ? 'text-[#FFCC00]' : 'text-gray-200'}`}>
                                {chat.content}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="relative px-4 pb-6 pt-2 shrink-0">
                {isPaidMode && <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#FFCC00]/30 to-transparent pointer-events-none z-0 transition-all duration-500"></div>}
                <div className="relative z-10 flex flex-col items-end">
                    <button onClick={() => setIsAiOpen(!isAiOpen)} className="flex items-center gap-1.5 px-3 py-1.5 mb-2 bg-[#222222] border border-gray-700/50 rounded-full shadow-md hover:bg-gray-800 transition-colors active:scale-95">
                        <Sparkles className="w-3.5 h-3.5 text-[#FFCC00]" />
                        <span className="text-[13px] font-medium text-gray-300">{isAiOpen ? "AI 추천 닫기" : "AI 질문 추천"}</span>
                        {isAiOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
                    </button>

                    <div className={`w-full bg-[#222222] border border-gray-700/50 rounded-2xl shadow-lg transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${isAiOpen ? "max-h-64 opacity-100 p-4 mb-3" : "max-h-0 opacity-0 p-0 m-0 border-transparent"}`}>
                        <ul className="space-y-3">
                            {["1. How can I improve my technical skills?", "2. What should I focus on for my career?", "3. Do you have any feedback on my project?"].map((item, idx) => (
                                <li key={idx} onClick={() => handleSuggestionClick(item)} className="text-sm text-gray-300 hover:text-white cursor-pointer transition-colors line-clamp-1 p-2 rounded-lg hover:bg-gray-700/30 active:bg-gray-700/50">
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="relative flex items-center w-full">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Share your thoughts..."
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            className="w-full bg-[#222222] text-white border-none rounded-2xl py-4 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-[#FFCC00]/50 placeholder-gray-500 text-[15px] shadow-sm"
                        />
                        <button onClick={handleSend} className="absolute right-3 p-2 text-[#FFCC00] hover:bg-[#FFCC00]/10 rounded-xl transition-colors active:scale-90">
                            <Send className="w-5 h-5" />
                        </button>
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
                        <p className="text-gray-400 text-[15px] mb-6 leading-relaxed">보유하신 <strong className="text-[#FFCC00]">질문권 1개</strong>가 차감되며, 멘토에게 최우선으로 전달됩니다.</p>
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