"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2, VolumeX, Send, PhoneOff } from "lucide-react";
import { useMentoringSession } from "@/hooks/useMentoringSession";
import { useWebRtcSession } from "@/hooks/useWebRtcSession";

interface ChatMessage {
  id: number;
  sender: "me" | "other";
  text: string;
}

export default function PrivateMentoringPage() {
  const [role, setRole] = useState<string>("MENTEE");
  const [userId, setUserId] = useState<number>(2);

  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const [isChatMode, setIsChatMode] = useState(false);
  const [isEndPopupOpen, setIsEndPopupOpen] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const storedRole = localStorage.getItem("role")?.toUpperCase();

    if (storedRole) setRole(storedRole);

    const storedUserId = localStorage.getItem("userId");
    if (storedUserId) setUserId(Number(storedUserId));
  }, []);

  // 1. 소켓 및 멘토링 세션 연결
  const { sessionData, isLoading, error, isConnected, peerId, socket, endMentoring } =
    useMentoringSession({ role, userId });

  // 2. WebRTC 1:1 오디오 세션 연결
  const { isMicOn, setMicOn, remoteStreams, isReady, error: webRtcError } =
    useWebRtcSession({
      socket,
      mentoringId: sessionData?.mentoringId?.toString() || "",
      peerId: peerId || "",
      role,
      mentoringType: "ONE_ON_ONE", // 💡 1:1 멘토링 타입 명시
    });

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, sender: "other", text: "Let's look at the color system. The \"No-Line\" rule is critical for that premium feel." },
    { id: 2, sender: "me", text: "Got it. I'm removing all the 1px borders now and using tonal layering instead." },
    { id: 3, sender: "other", text: "Excellent. Also, make sure the surface hierarchy follows that \"stacked paper\" logic we talked about earlier." },
    { id: 4, sender: "other", text: "That makes sense. Have you considered the typographic hierarchy for the display font?" },
    { id: 5, sender: "me", text: "I'm trying to use Manrope for" },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 💡 [추가] 원격 오디오 스트림 수신 및 연결
  useEffect(() => {
    if (remoteAudioRef.current && remoteStreams.size > 0) {
      const combinedStream = new MediaStream();

      remoteStreams.forEach((stream) => {
        stream.getAudioTracks().forEach((track) => {
          if (!combinedStream.getTracks().find(t => t.id === track.id)) {
            combinedStream.addTrack(track);
          }
        });
      });

      if (combinedStream.getAudioTracks().length > 0) {
        remoteAudioRef.current.srcObject = combinedStream;
        remoteAudioRef.current.play().catch((err) => {
          console.error("오디오 재생 실패 (오토플레이 정책 등):", err);
        });
      }
    }
  }, [remoteStreams]);

  // 💡 [추가] 스피커 On/Off에 따른 오디오 음소거 처리
  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerOn;
    }
  }, [isSpeakerOn]);

  // 타이머
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setElapsedTime((prevTime) => prevTime + 1);
    }, 1000);
    return () => clearInterval(timerInterval);
  }, []);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num: number) => String(num).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  useEffect(() => {
    if (isChatMode) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isChatMode]);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    setMessages((prev) => [...prev, { id: Date.now(), sender: "me", text: chatInput }]);
    setChatInput("");
    setIsChatMode(true);
  };

  const handleEndMentoring = async () => {
    await endMentoring();
    window.location.href = "/"; // 종료 후 이동할 경로 (필요시 수정)
  };

  return (
    <main className="flex flex-col w-full h-full bg-[#F8F9FA] text-[#1A1A1A] relative font-sans overflow-hidden">

      {/* 💡 숨겨진 오디오 태그 (상대방 음성 출력용) */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* 상단 헤더 */}
      <header className="w-full px-5 py-3 flex items-center justify-between shrink-0 bg-white z-30 shadow-sm relative">
        <button
          onClick={() => setIsChatMode(false)}
          className={`p-1 hover:bg-gray-100 rounded-full transition-all duration-300
            ${isChatMode ? 'opacity-100 cursor-pointer' : 'opacity-0 pointer-events-none'}
          `}
        >
          <img src="/icons/arrow.svg" alt="화살표 아이콘" className="w-5 h-5 text-[#FFCC00]" />
        </button>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-extrabold tracking-tight">
              {sessionData ? sessionData.host.nickname : "멘토링 중"}
            </h1>
            {/* 연결 상태 표시 뱃지 */}
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          </div>
          <span className="text-[12px] font-medium text-gray-500 mt-0.5 font-mono tracking-tight">
            {formatTime(elapsedTime)}
          </span>
        </div>

        <button onClick={() => setIsEndPopupOpen(true)} className="text-red-500 font-bold text-[15px] p-1">
          종료
        </button>
      </header>

      {/* 내부 가변 콘텐츠 영역 */}
      <div className="flex-1 relative overflow-hidden flex flex-col">

        {/* 전역 상태 알림 플로팅 팝업 컨테이너 (마이크, 스피커) */}
        <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center pointer-events-none">
          <div className={`transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] origin-top flex justify-center
            ${!isMicOn ? 'max-h-14 opacity-100 scale-100 translate-y-0 mb-2' : 'max-h-0 opacity-0 scale-95 -translate-y-2 mb-0'}
          `}>
            <div className="bg-[#1A1A1A]/90 backdrop-blur-md text-white text-[13px] font-bold px-5 py-2.5 rounded-full flex items-center gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.15)] whitespace-nowrap">
              <MicOff className="w-4 h-4 text-red-400" />
              마이크 사용 중지됨
            </div>
          </div>

          <div className={`transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] origin-top flex justify-center
            ${!isSpeakerOn ? 'max-h-14 opacity-100 scale-100 translate-y-0 mb-2' : 'max-h-0 opacity-0 scale-95 -translate-y-2 mb-0'}
          `}>
            <div className="bg-[#1A1A1A]/90 backdrop-blur-md text-white text-[13px] font-bold px-5 py-2.5 rounded-full flex items-center gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.15)] whitespace-nowrap">
              <VolumeX className="w-4 h-4 text-red-400" />
              스피커 사용 중지됨
            </div>
          </div>
        </div>

        {/* ------------------------------------
            A. 1:1 통화 모드 (접힌 상태)
            ------------------------------------ */}
        <div className={`absolute inset-0 flex flex-col transition-all duration-500 ease-in-out ${isChatMode ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>

          <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-0">
            <div className="flex-1 w-full min-h-[30px]"></div>

            <div className="flex flex-col items-center shrink-0">
              <div className="relative flex items-center justify-center w-52 h-52 mb-3">
                {/* 오디오가 들어오고 있을 때만 파동 애니메이션을 보여줄 수도 있습니다 */}
                <div className="absolute inset-0 border border-gray-300 rounded-full animate-[ping_3s_ease-out_infinite] opacity-50"></div>
                <div className="absolute inset-4 border border-gray-200 rounded-full animate-[ping_3s_ease-out_infinite_1s] opacity-70"></div>
                <div className="absolute inset-8 border border-gray-100 rounded-full animate-[ping_3s_ease-out_infinite_2s]"></div>

                <div className="relative z-10 w-36 h-36 rounded-full overflow-hidden shadow-2xl border-4 border-white bg-gray-200">
                  <img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=500&auto=format&fit=crop" alt="Profile" className="w-full h-full object-cover" />
                </div>
              </div>

              <h2 className="text-2xl font-extrabold mb-1">{sessionData ? sessionData.host.nickname : "연결 중..."}</h2>
              <p className="text-gray-500 text-[14px]">{isLoading ? "세션 정보를 불러오는 중입니다" : "Product Design Lead @ Studio"}</p>

              <div className="flex gap-4 mt-8">
                {/* 💡 마이크 제어 (useWebRtcSession의 setMicOn 연동) */}
                <button onClick={() => setMicOn(!isMicOn)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 ${isMicOn ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-white text-gray-700'}`}>
                  {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                {/* 💡 스피커 제어 */}
                <button onClick={() => setIsSpeakerOn(!isSpeakerOn)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 ${isSpeakerOn ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-white text-gray-700'}`}>
                  {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                </button>
              </div>
            </div>

            <div className="flex-1 w-full pb-6"></div>
          </div>

          {/* 채팅 미리보기 시트 */}
          <div
            onClick={() => setIsChatMode(true)}
            className="w-full bg-white rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.06)] pt-4 px-5 pb-2 cursor-pointer flex flex-col relative z-10 transition-transform hover:translate-y-[-2px]"
          >
            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-5"></div>

            <div className="flex flex-col gap-3 pointer-events-none">
              {messages.slice(-2).map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[14px] leading-snug break-keep shadow-sm ${msg.sender === 'me' ? 'bg-[#FFCC00] text-[#1A1A1A] rounded-tr-sm' : 'bg-[#F2F4F6] text-[#1A1A1A] rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ------------------------------------
            B. 전체 텍스트 채팅 모드
            ------------------------------------ */}
        <div className={`absolute inset-0 flex flex-col bg-white transition-all duration-500 ease-in-out ${!isChatMode ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 custom-scrollbar pb-4">
            <div className="flex justify-center my-2">
              <span className="bg-gray-100 text-gray-500 text-[11px] font-bold px-3 py-1.5 rounded-full">오늘</span>
            </div>

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`max-w-[80%] px-4 py-3.5 rounded-2xl text-[15px] leading-relaxed break-keep shadow-sm ${msg.sender === 'me' ? 'bg-[#FFCC00] text-[#1A1A1A] rounded-tr-sm' : 'bg-[#F2F4F6] text-[#1A1A1A] rounded-tl-sm'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* 공통 전역 하단 입력창 */}
      <div className={`w-full px-5 bg-white shrink-0 z-30 transition-all duration-500 ease-in-out flex flex-col justify-end py-3
        ${isChatMode ? 'border-t border-gray-100 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]' : ''}
      `}>
        <div className="relative flex items-center w-full">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onFocus={() => setIsChatMode(true)}
            placeholder="메시지를 입력하세요"
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            className="w-full bg-[#F2F4F6] text-[#1A1A1A] border-none rounded-full py-3.5 pl-5 pr-14 focus:outline-none focus:ring-2 focus:ring-[#FFCC00]/50 placeholder-gray-400 text-[15px] shadow-sm transition-all"
          />
          <button
            onClick={handleSendMessage}
            className="absolute right-2 p-2 bg-[#FFCC00] hover:bg-[#E6B800] rounded-full transition-colors active:scale-90 shadow-sm"
          >
            <Send className="w-4 h-4 text-[#1A1A1A]" />
          </button>
        </div>
      </div>

      {/* 종료 팝업 모달 */}
      {isEndPopupOpen && (
        <div className="absolute inset-0 bg-black/60 z-[100] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-[320px] rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col items-center">
            <div className="bg-red-50 p-4 rounded-full mb-6">
              <PhoneOff className="w-8 h-8 text-red-500" strokeWidth={2.5} />
            </div>
            <h3 className="text-xl font-extrabold text-[#1A1A1A] text-center mb-3">
              정말 멘토링을<br />종료하시겠습니까?
            </h3>
            <p className="text-gray-500 text-[13px] text-center mb-8 leading-relaxed break-keep">
              멘토링을 종료하면 즉시 연결이 끊어집니다.<br />
              추후 녹음본은 제공되지 않습니다.
            </p>
            <div className="flex flex-col gap-3 w-full">
              {/* 💡 멘토링 종료 로직 연동 */}
              <button
                onClick={handleEndMentoring}
                className="w-full bg-[#FFCC00] text-[#1A1A1A] text-[15px] font-bold py-4 rounded-2xl hover:bg-[#E6B800] transition-colors text-center active:scale-[0.98]"
              >
                멘토링 종료하기
              </button>
              <button
                onClick={() => setIsEndPopupOpen(false)}
                className="w-full bg-[#F2F4F6] text-[#1A1A1A] text-[15px] font-bold py-4 rounded-2xl hover:bg-[#E5E7EB] transition-colors active:scale-[0.98]"
              >
                멘토링 계속 진행
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}