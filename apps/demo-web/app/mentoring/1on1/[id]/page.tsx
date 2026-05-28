"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Mic, MicOff, Volume2, VolumeX, Send, PhoneOff } from "lucide-react";
import { io, Socket } from "socket.io-client";
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
  const [userName, setUserName] = useState<string>("익명");
  const [opponentNickname, setOpponentNickname] = useState<string>("상대방 연결 대기 중...");

  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const [isChatMode, setIsChatMode] = useState(false);
  const [isEndPopupOpen, setIsEndPopupOpen] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);

  // 실시간 채팅 상태
  const [chatSocket, setChatSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]); // 더미 데이터 제거
  const [isChatClosed, setIsChatClosed] = useState(false);

  useEffect(() => {
    const storedRole = localStorage.getItem("userRole")?.toUpperCase();
    if (storedRole) setRole(storedRole);

    const storedUserId = localStorage.getItem("userId");
    if (storedUserId) setUserId(Number(storedUserId));

    const storedName = localStorage.getItem("nickname") || "익명";
    setUserName(storedName);
  }, []);

  // 1. 소켓 및 멘토링 세션 연결 (화상/음성용 4002번)
  const { sessionData, isLoading, error, isConnected, peerId, socket, endMentoring } =
    useMentoringSession({ role, userId });

  // 1:1 오디오 전용 방을 위한 비디오 트랙 에러 우회 처리
  const webRtcArgs = useMemo(() => ({
    socket,
    mentoringId: sessionData?.mentoringId?.toString() || "",
    peerId: peerId || "",
    role,
    mentoringType: "ONE_ON_ONE" as const, 
    isJoined: isConnected, 
  }), [socket, sessionData?.mentoringId, peerId, role, isConnected]);

  const webRtcSession = useWebRtcSession(webRtcArgs);

  const localStream = webRtcSession.localStream;
  const isMicOn = webRtcSession.isMicOn;
  const setMicOn = webRtcSession.setMicOn;
  const remoteStreams = webRtcSession.remoteStreams;
  const isReady = webRtcSession.isReady;
  
  // 비디오 트랙 미검출 에러 발생 시 앱이 크래시되지 않도록 마스킹 처리
  const webRtcError = useMemo(() => {
    if (!webRtcSession.error) return null;
    const errMsg = String(webRtcSession.error);
    if (errMsg.includes("비디오 트랙") || errMsg.includes("video track") || errMsg.includes("produceVideo")) {
      console.log("ℹ️ [WebRTC 방어]: 오디오 전용 세션이므로 비디오 트랙 에러를 무시합니다.");
      return null;
    }
    return webRtcSession.error;
  }, [webRtcSession.error]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 접속한 사용자에 따라 기본 상대방 이름 세팅
  useEffect(() => {
    if (sessionData) {
      if (role === "MENTEE") {
        // 내가 멘티면 상대방은 당연히 방장(멘토)
        setOpponentNickname(sessionData.host.nickname);
      } else {
        // 내가 멘토면 멘티 접속을 기다림
        setOpponentNickname("멘티 (연결 대기 중)");
      }
    }
  }, [sessionData, role]);

  // 실제 채팅 서버(4001번) 연결 로직
  useEffect(() => {
    const mentoringIdStr = sessionData?.mentoringId?.toString();
    if (!mentoringIdStr || !userId) return;

    // 배포 환경이면 Nginx 라우팅, 로컬이면 4001번 포트로 연결
    const CHAT_SERVER_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4001";
    const socketPath = "/chat/socket.io";

    const newChatSocket = io(CHAT_SERVER_URL, {
      path: socketPath,
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    newChatSocket.on("connect", () => {
      console.log("✅ [1:1 채팅] 소켓 연결 성공!");

      newChatSocket.emit("join_chat", {
        mentoringId: Number(mentoringIdStr),
        userId: Number(userId),
        userName
      }, (res: any) => {
        if (res?.ok) {
          console.log("✅ [1:1 채팅] 방 입장 완료!");
          newChatSocket.emit("get_message_history", { mentoringId: Number(mentoringIdStr) });
        } else {
          console.error(`❌ [1:1 채팅] 방 입장 실패:`, res?.error);
          alert(res?.error || "채팅방 참여 권한이 없습니다.");
          window.location.href = "/mentoring_list/1on1_list";
        }
      });
    });

    // 상대방이 접속했을 때 실시간으로 이름표 업데이트
    newChatSocket.on("user_joined", (data: any) => {
      console.log("👋 상대방 입장 이벤트 수신:", data);

      const incomingNickname = data.nickname || data.userName;

      // 내 닉네임과 다른 사람(상대방)이 들어왔을 때만 업데이트
      if (incomingNickname && incomingNickname !== userName) {
        setOpponentNickname(incomingNickname);
      }
    });

    // 과거 채팅 내역에서 상대방 진짜 이름 가져오기
    newChatSocket.on("message_history", (historyData: any[]) => {
      const mapped = historyData.map(m => {
        const isMe = String(m.userId) === String(userId);

        // 내 메시지가 아닌데 이름 정보가 있다면 업데이트!
        if (!isMe && (m.user?.nickname || m.userName)) {
          setOpponentNickname(m.user?.nickname || m.userName);
        }

        return {
          id: m.mentoringChatId || m.id,
          sender: isMe ? "me" : "other",
          text: m.content,
        };
      }) as ChatMessage[];

      setMessages(mapped);
    });

    // 새 메시지가 왔을 때도 상대방 진짜 이름 업데이트
    newChatSocket.on("new_message", (m: any) => {
      if (String(m.userId) === String(userId)) return;

      // 상대방 이름 정보가 포함되어 있다면 업데이트
      if (m.user?.nickname || m.userName) {
        setOpponentNickname(m.user?.nickname || m.userName);
      }

      setMessages(prev => [...prev, {
        id: m.mentoringChatId || m.id || Date.now(),
        sender: "other",
        text: m.content,
      }]);
    });

    newChatSocket.on("room_closed", (data: any) => {
      setIsChatClosed(true);
      alert("멘토링이 종료되었습니다.");
      window.location.href = "/mentoring_list/1on1_list";
    });

    setChatSocket(newChatSocket);

    return () => {
      newChatSocket.disconnect();
    };
  }, [sessionData?.mentoringId, userId, userName, role]); // role 의존성 추가 권장

  // 1. 최적화된 원격 오디오 스트림 수신 및 연결
  useEffect(() => {
    if (!remoteAudioRef.current || remoteStreams.size === 0) return;

    // 1:1 멘토링이므로 복잡한 병합(Merge) 없이 첫 번째 원격 스트림을 그대로 사용합니다.
    const streamArray = Array.from(remoteStreams.values());
    const stream = streamArray[streamArray.length - 1];

    // 이미 오디오 태그에 같은 스트림이 연결되어 있다면 덮어쓰지 않습니다.
    // (채팅을 입력할 때마다 srcObject가 재할당되어 미세하게 음성이 끊기는 현상을 원천 차단)
    if (remoteAudioRef.current.srcObject !== stream) {
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.play().catch((err) => {
        console.warn("오디오 재생 실패 (오토플레이 정책 등):", err);
      });
    }
  }, [remoteStreams]);

  // 2. 페이지 이탈 시 오디오 자원 완벽 해제 (메모리 누수 및 백그라운드 재생 방지)
  useEffect(() => {
    return () => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
      }
    };
  }, []);

  // [타이머 로직]: 서버 시간에 맞춰 동기화
  useEffect(() => {
    // DB에 시작 시간이 기록되어 있지 않다면 타이머를 돌리지 않음
    if (!sessionData?.startedAt) return;

    // 방이 공식적으로 시작된 시간 (절대 시간)
    const startTimeMs = new Date(sessionData.startedAt).getTime();

    const timerInterval = setInterval(() => {
      const nowMs = Date.now(); // 내 컴퓨터의 현재 시간
      const diffInSeconds = Math.floor((nowMs - startTimeMs) / 1000);

      // 멘티가 약간 일찍 들어왔을 때 타이머가 음수로 가는 것 방지
      setElapsedTime(diffInSeconds > 0 ? diffInSeconds : 0);
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [sessionData?.startedAt]);

  useEffect(() => {
    if (!socket) return;
    const handleMentoringEnded = () => {
      window.location.href = "/mentoring_list/1on1_list";
    };
    socket.on("mentoring:ended", handleMentoringEnded);
    return () => {
      socket.off("mentoring:ended", handleMentoringEnded);
    };
  }, [socket]);

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

  // [채팅 전송 함수]
  const handleSendMessage = () => {
    // 1. 방어 로직 (내용이 없거나, 소켓이 없거나, 방 번호가 없으면 중단)
    if (!chatInput.trim() || !chatSocket || !sessionData?.mentoringId || isChatClosed) {
      console.warn("⚠️ 전송 불가 상태:", { input: chatInput, socket: !!chatSocket, roomId: sessionData?.mentoringId });
      return;
    }

    // 2. 서버로 메시지 전송
    chatSocket.emit("send_message", {
      mentoringId: Number(sessionData.mentoringId),
      userId: Number(userId),
      content: chatInput
    });

    // 3. 서버 응답을 기다리지 않고 내 화면에 즉시 메시지 말풍선 띄우기
    setMessages(prev => [...prev, {
      id: Date.now(), // 임시 고유 ID 부여
      sender: "me",
      text: chatInput,
    }]);

    // 4. 입력창 비우고 채팅 모드 유지
    setChatInput("");
    setIsChatMode(true);
  };

  const handleEndMentoring = async () => {
    await endMentoring();
    window.location.href = "/mentoring_list/1on1_list";
  };

  return (
    <main className="flex flex-col w-full h-full bg-[#F8F9FA] text-[#1A1A1A] relative font-sans overflow-hidden">
      <audio ref={remoteAudioRef} autoPlay />

      <header className="w-full px-5 py-3 flex items-center justify-between shrink-0 bg-white z-30 shadow-sm relative h-[60px]">

        {/* 1. 왼쪽 영역 (뒤로가기 버튼) - flex-1을 주어 공간 확보 */}
        <div className="flex-1 flex justify-start z-10">
          <button
            onClick={() => setIsChatMode(false)}
            className={`p-1 hover:bg-gray-100 rounded-full transition-all duration-300
              ${isChatMode ? 'opacity-100 cursor-pointer' : 'opacity-0 pointer-events-none'}
            `}
          >
            <img src="/icons/arrow.svg" alt="화살표 아이콘" className="w-5 h-5 text-[#FFCC00]" />
          </button>
        </div>

        {/* 2. 중앙 영역 (닉네임/시간) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none w-max">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-extrabold tracking-tight text-[#1A1A1A]">
              {opponentNickname}
            </h1>
            <div className={`w-2 h-2 rounded-full ${(isConnected && !isChatClosed) ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          </div>
          <span className="text-[12px] font-medium text-gray-500 mt-0.5 font-mono tracking-tight">
            {formatTime(elapsedTime)}
          </span>
        </div>

        {/* 3. 오른쪽 영역 (종료 버튼) */}
        <div className="flex-1 flex justify-end z-10">
          {role !== "MENTEE" ? (
            <button onClick={() => setIsEndPopupOpen(true)} className="text-red-500 font-bold text-[15px] p-1">
              종료
            </button>
          ) : (
            // 멘티일 경우 빈 공간 대신 '나가기' 버튼 렌더링 및 페이지 이동 연결
            <button
              onClick={() => window.location.href = "/mentoring_list/1on1_list"}
              className="text-gray-500 hover:text-gray-700 font-bold text-[15px] p-1 transition-colors"
            >
              나가기
            </button>
          )}
        </div>

      </header>

      <div className="flex-1 relative overflow-hidden flex flex-col">
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

        <div className={`absolute inset-0 flex flex-col transition-all duration-500 ease-in-out ${isChatMode ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
          <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-0">
            <div className="flex-1 w-full min-h-[30px]"></div>

            <div className="flex flex-col items-center shrink-0">
              <div className="relative flex items-center justify-center w-52 h-52 mb-3">
                <div className="absolute inset-0 border border-gray-300 rounded-full animate-[ping_3s_ease-out_infinite] opacity-50"></div>
                <div className="absolute inset-4 border border-gray-200 rounded-full animate-[ping_3s_ease-out_infinite_1s] opacity-70"></div>
                <div className="absolute inset-8 border border-gray-100 rounded-full animate-[ping_3s_ease-out_infinite_2s]"></div>

                <div className="relative z-10 w-36 h-36 rounded-full overflow-hidden shadow-2xl border-4 border-white bg-gray-200">
                  <img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=500&auto=format&fit=crop" alt="Profile" className="w-full h-full object-cover" />
                </div>
              </div>

              {/* 중앙 프로필 이름 변경 */}
              <h2 className="text-2xl font-extrabold mb-1">{opponentNickname}</h2>
              <p className="text-gray-500 text-[14px]">{isLoading ? "세션 정보를 불러오는 중입니다" : "1:1 멘토링 세션"}</p>

              <div className="flex gap-4 mt-8">
                <button onClick={() => setMicOn(!isMicOn)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 ${isMicOn ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-white text-gray-700'}`}>
                  {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button onClick={() => setIsSpeakerOn(!isSpeakerOn)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 ${isSpeakerOn ? 'bg-[#FFCC00] text-[#1A1A1A]' : 'bg-white text-gray-700'}`}>
                  {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                </button>
              </div>
            </div>

            <div className="flex-1 w-full pb-6"></div>
          </div>

          <div
            onClick={() => setIsChatMode(true)}
            className="w-full bg-white rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.06)] pt-4 px-5 pb-2 cursor-pointer flex flex-col relative z-10 transition-transform hover:translate-y-[-2px]"
          >
            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-5"></div>

            <div className="flex flex-col gap-3 pointer-events-none">
              {messages.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-2">아직 메시지가 없습니다.</div>
              ) : (
                messages.slice(-2).map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[14px] leading-snug break-keep shadow-sm ${msg.sender === 'me' ? 'bg-[#FFCC00] text-[#1A1A1A] rounded-tr-sm' : 'bg-[#F2F4F6] text-[#1A1A1A] rounded-tl-sm'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className={`absolute inset-0 flex flex-col bg-white transition-all duration-500 ease-in-out ${!isChatMode ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 custom-scrollbar pb-4">
            <div className="flex justify-center my-2">
              <span className="bg-gray-100 text-gray-500 text-[11px] font-bold px-3 py-1.5 rounded-full">오늘</span>
            </div>

            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                메시지를 입력해 첫 인사를 나눠보세요.
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                  <div className={`max-w-[80%] px-4 py-3.5 rounded-2xl text-[15px] leading-relaxed break-keep shadow-sm ${msg.sender === 'me' ? 'bg-[#FFCC00] text-[#1A1A1A] rounded-tr-sm' : 'bg-[#F2F4F6] text-[#1A1A1A] rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

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
            disabled={!chatSocket}
            className="absolute right-2 p-2 bg-[#FFCC00] hover:bg-[#E6B800] disabled:opacity-50 rounded-full transition-colors active:scale-90 shadow-sm"
          >
            <Send className="w-4 h-4 text-[#1A1A1A]" />
          </button>
        </div>
      </div>

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