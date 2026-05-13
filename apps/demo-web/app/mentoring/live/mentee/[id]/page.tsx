"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

//import { useSearchParams } from "next/navigation"; 
import { useParams } from "next/navigation";

import { io, Socket } from "socket.io-client"; 
import { Users, Send, Sparkles, Star, X, ChevronUp, ChevronDown, AlertCircle, Play } from "lucide-react";

import { useMentoringSession } from "@/hooks/useMentoringSession";
import { useWebRtcSession } from "@/hooks/useWebRtcSession";

interface ChatMessage {
    id: string | number;
    type: "free" | "paid";
    author: string;
    senderId: string;
    content: string;
}

export default function LiveMentoringPage() {
    const params = useParams();
    const mentoringId = params?.id as string; 

    const [role, setRole] = useState<string>("MENTEE");
    const [userId, setUserId] = useState<number | null>(null);
    const [userName, setUserName] = useState<string>("멘티");

    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [isPaidMode, setIsPaidMode] = useState(false);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [chatInput, setChatInput] = useState("");
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

    const [chatSocket, setChatSocket] = useState<Socket | null>(null);
    const [chats, setChats] = useState<ChatMessage[]>([]);
    const [onlineUserCount, setOnlineUserCount] = useState<number>(0);
    const [isChatClosed, setIsChatClosed] = useState(false);

    useEffect(() => {
        const storedRole = localStorage.getItem("role")?.toUpperCase();
        if (storedRole) setRole(storedRole);

        const storedUserId = localStorage.getItem("userId");
        if (storedUserId) setUserId(Number(storedUserId));

        const storedName = localStorage.getItem("nickname") || "익명멘티";
        setUserName(storedName);
    }, []);

    const { sessionData, isLoading, error, isConnected, peerId, socket: rtcSocket } =
        useMentoringSession({ role, userId: userId ?? 0 });

    const { remoteStreams, error: webRtcError } = useWebRtcSession({
        socket: rtcSocket,
        mentoringId: mentoringId || "",
        peerId: peerId || "",
        role,
        mentoringType: "GROUP"
    });

    useEffect(() => {
    if (!mentoringId || !userId) {
        console.log("⏳ [채팅] 방 ID 또는 유저 ID가 없어서 연결 대기중...");
        return;
    }

    // 환경 변수 이름 매칭
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

    // 🚨 디버깅용 콘솔 출력 코드
    socket.on("connect_error", (err) => {
        console.error("❌ [채팅] 소켓 연결 실패! 상세 원인:", err.message);
    });

        socket.on("message_history", (messages: any[]) => {
            const mapped = messages.map(m => ({
                id: m.mentoringChatId,
                type: m.content.startsWith("[유료]") ? "paid" : "free", 
                author: m.user?.nickname || m.userName || "익명멘티",
                senderId: String(m.userId),
                content: m.content.replace("[유료] ", ""),
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
            }]);
        });

        socket.on("user_joined", (data: any) => setOnlineUserCount(data.userCount));
        socket.on("user_left", (data: any) => setOnlineUserCount(data.userCount));
        socket.on("online_users", (data: any) => setOnlineUserCount(data.userCount));

        socket.on("room_closed", (data: any) => {
            setIsChatClosed(true);
            alert("멘토링이 종료되어 채팅이 마감되었습니다.");
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

    useEffect(() => {
        if (remoteVideoRef.current && remoteStreams.size > 0) {
            const combinedStream = new MediaStream();
            remoteStreams.forEach((stream) => {
                stream.getTracks().forEach((track) => {
                    if (!combinedStream.getTracks().find(t => t.id === track.id)) {
                        combinedStream.addTrack(track);
                    }
                });
            });

            if (combinedStream.getTracks().length > 0) {
                remoteVideoRef.current.srcObject = combinedStream;
                remoteVideoRef.current.play().catch((err) => {
                    if (err.name === "NotAllowedError" || err.message.includes("play() failed")) {
                        setIsAutoplayBlocked(true);
                    }
                });
            }
        }
    }, [remoteStreams]);

    
    const handleSend = () => {
        // 1. 버튼이 눌렸는지 확인
        console.log("👉 [디버그] 전송 버튼 클릭됨! 입력값:", chatInput);
        
        // 2. 차단 조건 상태 확인
        console.log("👉 [디버그] 상태 체크:", { 
            hasSocket: !!chatSocket, 
            isSocketConnected: chatSocket?.connected, 
            isChatClosed 
        });

        if (!chatInput.trim() || !chatSocket || isChatClosed) {
            console.warn("🚨 [디버그] 차단 조건에 걸려 전송 취소됨!");
            return;
        }
        
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
            
            console.log("🚀 [디버그] 소켓으로 데이터 발사 payload:", payload); // 3. 발사 직전 확인
            chatSocket.emit("send_message", payload);
            setChatInput(""); 
        }
    };

    const confirmPaidQuestion = () => {
        setIsPopupOpen(false);
        if (chatSocket && !isChatClosed) {
            const payload = { 
                mentoringId, 
                userId: String(userId), 
                userName, 
                content: `[유료] ${chatInput}` 
            };
            
            chatSocket.emit("send_message", payload);
            setChatInput("");
            setIsPaidMode(false);
        }
    };

    const handleSuggestionClick = (question: string) => {
        const cleanText = question.replace(/^\d+\.\s*/, '');
        setChatInput(cleanText);
        setIsAiOpen(false);
    };

    if (isLoading || !userId) {
        return (
            <main className="flex flex-col w-full h-full bg-[#161616] text-white items-center justify-center">
                <div className="w-8 h-8 border-4 border-[#FFCC00]/30 border-t-[#FFCC00] rounded-full animate-spin mb-4"></div>
                <p className="text-gray-300">멘토링 세션 연결 중...</p>
            </main>
        );
    }

    if (error || webRtcError) {
        return (
            <main className="flex flex-col w-full h-full bg-[#161616] text-white items-center justify-center">
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

            {/* 방 정보 및 비디오 송출 영역 */}
            <div className="px-4 shrink-0 z-10 flex flex-col gap-3">
                
                <div className="w-full aspect-[16/9] bg-gray-800 rounded-2xl relative overflow-hidden flex items-center justify-center">
                    {remoteStreams.size > 0 ? (
                        <>
                            <video ref={remoteVideoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline />
                            {isAutoplayBlocked && (
                                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                    <p className="text-white mb-3 text-sm font-medium">오디오 정책으로 인해 영상이 일시정지되었습니다.</p>
                                    <button onClick={() => { remoteVideoRef.current?.play(); setIsAutoplayBlocked(false); }} className="bg-[#FFCC00] text-[#1A1A1A] font-bold px-6 py-2.5 rounded-full flex items-center gap-2 active:scale-95 transition-transform shadow-lg">
                                        <Play className="w-4 h-4" fill="currentColor" /> 화면 재생하기
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
                {chats.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                        채팅 내역이 없습니다. 첫 인사를 남겨보세요!
                    </div>
                ) : (
                    chats.map((chat) => {
                        const isMentor = sessionData?.host?.userId && String(chat.senderId) === String(sessionData.host.userId);
                        const profileImage = isMentor ? "/images/mentor_profile.jpg" : "/images/mentee_profile.jpg";

                        return (
                            <div key={chat.id} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <img 
                                    src={profileImage} 
                                    alt={isMentor ? "멘토 프로필" : "멘티 프로필"} 
                                    className="w-9 h-9 rounded-full object-cover shrink-0 bg-gray-800 border-2 border-[#FFCC00]"
                                />

                                <div className="flex flex-col items-start">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-semibold text-gray-400">{chat.author}</span>
                                        {chat.type === 'paid' && (
                                            <span className="bg-[#FFCC00] text-[#1A1A1A] text-[10px] font-extrabold px-1.5 py-0.5 rounded tracking-wide">
                                                유료 질문
                                            </span>
                                        )}
                                    </div>
                                    <p className={`text-[15px] break-all leading-relaxed ${chat.type === 'paid' ? 'text-[#FFCC00]' : 'text-gray-100'}`}>
                                        {chat.content}
                                    </p>
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
                            <button onClick={() => setIsAiOpen(!isAiOpen)} className="flex items-center gap-1.5 px-3 py-1.5 mb-2 bg-[#222222] border border-gray-700/50 rounded-full shadow-md hover:bg-gray-800 transition-colors active:scale-95">
                                <Sparkles className="w-3.5 h-3.5 text-[#FFCC00]" />
                                <span className="text-[13px] font-medium text-gray-300">{isAiOpen ? "AI 추천 닫기" : "AI 질문 추천"}</span>
                                {isAiOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
                            </button>

                            <div className={`w-full bg-[#222222] border border-gray-700/50 rounded-2xl shadow-lg transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${isAiOpen ? "max-h-64 opacity-100 p-4 mb-3" : "max-h-0 opacity-0 p-0 m-0 border-transparent"}`}>
                                <ul className="space-y-3">
                                    {["1. 신입 개발자로서 가장 중요하게 생각하시는 역량이 무엇인가요?", "2. 향후 커리어 방향을 어떻게 잡아야 할까요?", "3. 이력서에서 보완해야 할 점이 있다면 무엇일까요?"].map((item, idx) => (
                                        <li key={idx} onClick={() => handleSuggestionClick(item)} className="text-sm text-gray-300 hover:text-white cursor-pointer transition-colors line-clamp-1 p-2 rounded-lg hover:bg-gray-700/30 active:bg-gray-700/50">
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </>
                    )}

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