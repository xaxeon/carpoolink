"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
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

export default function MentorLivePage() {
    const [role, setRole] = useState<string>("MENTEE");
    const [userId, setUserId] = useState<number>(2);

    const videoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    const [isChatOpen, setIsChatOpen] = useState(true);
    const [isExitPopupOpen, setIsExitPopupOpen] = useState(false);
    const [isReading, setIsReading] = useState(false);
    const [currentIdx, setCurrentIdx] = useState(0);

    // Hook 적용
    const { sessionData, participantCount, isLoading, error, isConnected, peerId, socket, endMentoring } =
        useMentoringSession({ role, userId });

    // WebRTC 세션 시작
    const { localStream, isCameraOn, isMicOn, setCameraOn, setMicOn, isReady: webRtcReady, error: webRtcError } =
        useWebRtcSession({
            socket,
            mentoringId: sessionData?.mentoringId?.toString() || "",
            peerId: peerId || "",
            role: "MENTOR",
            mentoringType: "GROUP"
        });

    const questionQueue: Question[] = [
        {
            id: 1,
            type: "paid",
            isPrivate: true,
            author: "김세종",
            avatar: "👨‍💼",
            content: '"How do you negotiate equity in a Series B startup without losing the offer?"'
        },
        {
            id: 2,
            type: "free",
            isPrivate: false,
            author: "이유진",
            avatar: "👩‍💼",
            content: '"Can you share some tips on building a tech portfolio from scratch?"'
        },
        {
            id: 3,
            type: "free",
            isPrivate: true,
            author: "이세종",
            avatar: "👨‍💼",
            content: '"임시 질문1 입니다?"'
        },
        {
            id: 4,
            type: "paid",
            isPrivate: false,
            author: "김유진",
            avatar: "👩‍💼",
            content: '"임시 질문2 입니다?"'
        }
    ];

    const currentQuestion = questionQueue[currentIdx];

    useEffect(() => {
        const storedRole = localStorage.getItem("role")?.toUpperCase();

        if (storedRole) setRole(storedRole);

        const storedUserId = localStorage.getItem("userId");
        if (storedUserId) setUserId(Number(storedUserId));
    }, []);

    // 로컬 스트림을 video element에 연결
    useEffect(() => {
        if (videoRef.current && localStream) {
            videoRef.current.srcObject = localStream;

            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch((err) => {
                    // AbortError는 무시하고, 진짜 에러만 콘솔에 찍습니다.
                    if (err.name !== "AbortError") {
                        console.error("비디오 재생 실패:", err);
                    }
                });
            }
        }
    }, [localStream, isCameraOn]);

    // 다음 질문으로 넘어가는 공통 함수 (넘어갈 때 읽기 상태 초기화)
    const handleNextQuestion = () => {
        setCurrentIdx((prev) => (prev + 1) % questionQueue.length);
        setIsReading(false);
    };

    const handleExitClick = async () => {
        setIsExitPopupOpen(true);
    };

    const handleConfirmExit = async () => {
        await endMentoring();
        window.location.href = "/mentoring_list/live_list"; // 종료 후 라이브 멘토링 목록 페이지로 이동
    };

    // 로딩/에러 상태 표시
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
        <main className="flex flex-col w-full h-full bg-[#161616] text-white font-sans overflow-hidden relative">

            {/* 헤더 영역 */}
            <header className="w-full px-5 py-4 flex items-center justify-between shrink-0 z-20">
                <button onClick={handleExitClick} className="inline-flex items-center text-red-500 hover:opacity-80 transition-opacity">
                    <PhoneOff className="w-5 h-5 mr-2" strokeWidth={2.5} />
                    <span className="font-bold text-[17px] text-white">종료</span>
                </button>
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

            <div className="flex-1 flex flex-col px-4 overflow-hidden relative">
                <div className={`flex flex-col transition-all duration-500 ease-in-out ${!isChatOpen ? 'flex-1 justify-center' : 'justify-start pt-2'}`}>

                    {/* 💡 상단 질문 카드 */}
                    <div className={`w-full rounded-[24px] p-5 mb-4 shrink-0 shadow-xl transition-all duration-500 flex justify-between gap-4
            ${currentQuestion.type === 'paid' ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-[#F0F0F0] text-[#1A1A1A]'}
          `}>
                        <div className="flex flex-col gap-3 flex-1">
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-black/10 rounded-full flex items-center justify-center text-sm">{currentQuestion.avatar}</div>
                                    <span className="font-bold text-[14px]">{currentQuestion.author}</span>
                                </div>

                                {currentQuestion.isPrivate && (
                                    <div className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-extrabold px-2 py-1 rounded-lg shadow-sm">
                                        <Lock className="w-3 h-3" strokeWidth={3} />
                                        비공개 질문
                                    </div>
                                )}
                            </div>
                            <p className="font-extrabold text-[16px] leading-snug break-keep">{currentQuestion.content}</p>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0 justify-center">
                            {/* 💡 [수정됨] 질문 읽기 버튼 - isReading 상태에 따라 화려하게 변경됨 */}
                            <button
                                onClick={() => setIsReading(true)}
                                className={`px-3 py-2.5 rounded-xl text-[12px] font-bold flex items-center justify-center transition-all duration-300
                  ${isReading
                                        ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.6)] ring-2 ring-red-400/50'
                                        : currentQuestion.type === 'paid' ? 'bg-[#1A1A1A] text-[#FFCC00] hover:bg-black' : 'bg-[#E0E0E0] hover:bg-[#D0D0D0]'
                                    }
                `}
                            >
                                <Volume2 className={`w-3.5 h-3.5 mr-1.5 ${isReading ? 'animate-pulse' : ''}`} />
                                {isReading ? '읽는 중...' : '질문 읽기'}
                            </button>

                            <button onClick={handleNextQuestion} className={`px-3 py-2.5 rounded-xl text-[12px] font-bold transition-colors ${currentQuestion.type === 'paid' ? 'bg-[#1A1A1A]/10 hover:bg-[#1A1A1A]/20' : 'bg-[#E0E0E0] hover:bg-[#D0D0D0]'}`}>
                                답변 완료
                            </button>
                        </div>
                    </div>

                    {/* 비디오 화면 영역 */}
                    <div className="w-full aspect-[16/9] bg-[#1A1A1A] rounded-2xl relative overflow-hidden flex flex-col justify-between shadow-2xl shrink-0 border border-gray-800">
                        {isCameraOn ? (
                            <video
                                ref={videoRef}
                                className="absolute inset-0 w-full h-full object-cover"
                                autoPlay
                                playsInline
                                muted
                            />
                        ) : (
                            <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-[#1A1A1A] animate-in fade-in duration-300">
                                <div className="bg-[#2A2A2A] p-4 rounded-full mb-3 shadow-inner">
                                    <VideoOff className="w-8 h-8 text-gray-500" />
                                </div>
                                <span className="text-[13px] font-medium text-gray-500 tracking-wide">카메라가 꺼져 있습니다</span>
                            </div>
                        )}

                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>

                        <div className="relative w-full flex justify-center pt-4 z-10">
                            <div className={`text-[11px] font-bold px-4 py-1.5 rounded-full shadow-lg transition-colors duration-300 ${currentQuestion.isPrivate ? 'bg-red-600 text-white' : 'bg-[#FFCC00] text-[#1A1A1A]'}`}>
                                {currentQuestion.isPrivate ? "비공개 질문 답변중" : "공개 질문 답변중"}
                            </div>
                        </div>

                        <div className="relative w-full flex items-center justify-between px-3 pb-3 gap-2 z-10">
                            <div className="flex gap-2">
                                <button onClick={handleNextQuestion} className="bg-[#FFCC00] text-[#1A1A1A] text-[11px] font-bold px-3 py-2 rounded-full active:scale-95 transition-transform">다음 질문</button>
                                <button onClick={handleNextQuestion} className="bg-[#FFCC00] text-[#1A1A1A] text-[11px] font-bold px-3 py-2 rounded-full active:scale-95 transition-transform">질문 답변 완료</button>

                                {/* 💡 [수정됨] 하단 질문 다시 읽기 버튼 */}
                                <button
                                    onClick={() => setIsReading(true)}
                                    className="bg-[#FFCC00] text-[#1A1A1A] text-[11px] font-bold px-3 py-2 rounded-full text-center active:scale-95 transition-transform"
                                >
                                    질문 다시 읽기
                                </button>
                            </div>
                            <button className="bg-black/50 backdrop-blur-md p-2 rounded-full text-white hover:bg-black/70 transition-colors"><Settings className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>

                {/* 채팅 내역 */}
                {isChatOpen && (
                    <div className="flex-1 overflow-y-auto mt-4 space-y-4 custom-scrollbar pb-6 pr-2 animate-in fade-in slide-in-from-bottom-8 duration-500">
                        <div className="flex gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#FFCC00]/20 flex items-center justify-center shrink-0">👩‍💻</div>
                            <div className="flex flex-col">
                                <span className="text-[13px] font-semibold text-gray-400">Marcus T.</span>
                                <p className="text-[14px] text-gray-200">The point about insurance liability is fascinating.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#FFCC00]/20 flex items-center justify-center shrink-0">🧔‍♂️</div>
                            <div className="flex flex-col">
                                <span className="text-[13px] font-semibold text-gray-400">Elena R.</span>
                                <p className="text-[14px] text-gray-200">I agree! Let's discuss further.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 푸터 컨트롤 바 */}
            <footer className="w-full bg-[#111111] border-t border-gray-800/50 py-3 px-6 flex justify-around items-center shrink-0 z-20 pb-safe relative">
                <button
                    onClick={() => setMicOn(!isMicOn)}
                    className={`p-3.5 rounded-full transition-all cursor-pointer ${!isMicOn ? 'bg-red-500/20 text-red-500' : 'text-white hover:bg-white/5'}`}
                >
                    {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button
                    onClick={() => setCameraOn(!isCameraOn)}
                    className={`p-4 rounded-full shadow-lg transition-all cursor-pointer ${isCameraOn ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-gray-700 text-white'}`}
                >
                    {isCameraOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
                <button onClick={() => setIsChatOpen(!isChatOpen)} className={`p-3.5 rounded-full transition-all cursor-pointer ${isChatOpen ? 'text-[#FFCC00] bg-white/5' : 'text-white hover:bg-white/10'}`}>
                    <MessageSquare className="w-6 h-6" />
                </button>
            </footer>

            {/* 종료 팝업 */}
            {isExitPopupOpen && (
                <div className="absolute inset-0 bg-black/80 z-[100] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#1A1A1A] w-full max-w-sm rounded-[32px] p-8 shadow-2xl border border-gray-800 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-center mb-6">
                            <div className="bg-red-500/20 p-4 rounded-2xl">
                                <PhoneOff className="w-8 h-8 text-red-500" strokeWidth={2.5} />
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-white text-center mb-2">정말 종료하시겠습니까?</h3>
                        <p className="text-gray-400 text-[15px] text-center mb-8 leading-relaxed">
                            지금 종료하시면 라이브 멘토링 세션이 완전히 닫히게 됩니다.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setIsExitPopupOpen(false)} className="flex-1 bg-gray-800 text-white font-bold py-4 rounded-2xl hover:bg-gray-700 transition-colors">
                                취소
                            </button>
                            <button onClick={handleConfirmExit} className="flex-1 bg-red-600 text-white font-bold py-4 rounded-2xl hover:bg-red-700 transition-colors text-center">
                                종료
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}