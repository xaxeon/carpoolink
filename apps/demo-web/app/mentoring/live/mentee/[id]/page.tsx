"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// 💡 프로젝트 환경에 맞게 apiClient 경로를 확인해주세요. (예: "@/lib/apiClient" 또는 "@/api/client")
import apiClient from "@/lib/apiClient";

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

    const [chatSocket, setChatSocket] = useState<Socket | null>(null);
    const [chats, setChats] = useState<ChatMessage[]>([]);
    const [onlineUserCount, setOnlineUserCount] = useState<number>(0);
    const [isChatClosed, setIsChatClosed] = useState(false);

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
            const payload = {
                mentoringId,
                userId: String(userId),
                userName,
                content: `[유료] ${chatInput}`
            };

            // 유료 질문은 core-api에 등록하여 잔액 차감 및 실시간 이벤트 전파를 수행합니다.
            (async () => {
                try {
                    await apiClient.post(`/api/mentorings/${mentoringId}/questions`, {
                        content: chatInput,
                        isPaid: true,
                    });
                    // 등록 성공하면 입력 초기화
                    setChatInput("");
                    setIsPaidMode(false);
                } catch (err: any) {
                    console.error('유료 질문 등록 실패', err);
                    alert(err?.response?.data?.message || '유료 질문 전송에 실패했습니다.');
                }
            })();
        }
    };

    const handleSuggestionClick = (question: string) => {
        const cleanText = question.replace(/^\d+\.\s*/, '');
        setChatInput(cleanText);
        setIsAiOpen(false);
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
                <div className="w-full aspect-[16/9] bg-gray-800 rounded-2xl relative overflow-hidden flex items-center justify-center">
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

import React, { memo } from "react";

// ============================================================================
// [미디어 렌더러 컴포넌트] 비디오와 오디오를 구분하여 안전하게 재생 (깜빡임 방지 버전)
// ============================================================================
const MediaRenderer = memo(function MediaRenderer({ stream, onBlocked }: { stream: MediaStream, onBlocked: () => void }) {
    const mediaRef = useRef<HTMLMediaElement>(null);

    const isVideo = stream.getVideoTracks().length > 0;
    const hasAudio = stream.getAudioTracks().length > 0;

    // 1. 💡 스트림 설정 및 재생 관리 Effect
    useEffect(() => {
        if (mediaRef.current && stream) {
            // 🚨 [핵심] 이미 엘리먼트에 같은 스트림이 주입되어 있다면 아무것도 하지 않습니다.
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

    // 2. 💡 진짜 컴포넌트가 '언마운트' 될 때만 미디어 자원을 깔끔하게 해제하는 별도 Effect
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