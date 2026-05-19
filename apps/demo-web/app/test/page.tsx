"use client";

import { useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Device } from "mediasoup-client";

const MEDIA_SERVER_URL = "http://localhost:4002";
const MENTORING_ID = 7;   // 테스트할 mentoringId로 변경
const USER_ID = 1;        // 테스트할 userId로 변경

type Log = { time: string; msg: string; type?: "command" | "stt" | "info" | "error" };

export default function TestPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [producing, setProducing] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const log = (msg: string, type: Log["type"] = "info") =>
    setLogs((p) => [...p, { time: new Date().toLocaleTimeString(), msg, type }]);

  function signal(socket: Socket, action: string, data = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).slice(2);
      socket.emit("signal", { requestId, action, data });
      const handler = (res: any) => {
        if (res.requestId !== requestId) return;
        socket.off("signal", handler);
        res.ok ? resolve(res.data) : reject(new Error(res.error));
      };
      socket.on("signal", handler);
      setTimeout(() => reject(new Error("timeout")), 10000);
    });
  }

  async function start() {
    log("소켓 연결 중...");
    const socket = io(MEDIA_SERVER_URL, {
      path: "/media/socket.io",
      auth: { userId: USER_ID },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    await new Promise<void>((r, j) => {
      socket.on("connect", () => { log("소켓 연결됨"); r(); });
      socket.on("connect_error", (e) => j(e));
    });

    // 음성 명령 이벤트 수신
    socket.on("signal", (msg: any) => {
      if (msg.event === "voice-command")
        log(`🟡 음성 명령: ${msg.data.type}`, "command");
    });

    try {
      const join = await signal(socket, "joinMentoring", {
        mentoringId: MENTORING_ID, role: "mentor", userId: USER_ID,
      });
      log(`멘토링 참가 완료 (peerId: ${join.peerId})`);

      const device = new Device();
      await device.load({ routerRtpCapabilities: join.routerRtpCapabilities });

      const tp = await signal(socket, "createWebRtcTransport", { direction: "send" });
      const transport = device.createSendTransport({ ...tp, id: tp.transportId });

      transport.on("connect", ({ dtlsParameters }, cb) =>
        signal(socket, "connectWebRtcTransport", { transportId: transport.id, dtlsParameters }).then(cb).catch(cb)
      );
      transport.on("produce", ({ kind, rtpParameters, appData }, cb, errback) =>
        signal(socket, "produce", { transportId: transport.id, kind, rtpParameters, appData })
          .then(({ producerId }) => cb({ id: producerId })).catch(errback)
      );

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await transport.produce({ track: stream.getAudioTracks()[0] });

      log("✅ 마이크 송출 중 — 명령어를 말해보세요", "info");
      setProducing(true);
    } catch (e: any) {
      log(`❌ ${e.message}`, "error");
    }
  }

  function stop() {
    socketRef.current?.disconnect();
    setProducing(false);
    log("연결 종료");
  }

  const colors: Record<string, string> = {
    command: "text-yellow-400 font-bold",
    error: "text-red-400",
    stt: "text-green-400",
    info: "text-zinc-300",
  };

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-6 font-mono">
      <h1 className="text-xl font-bold mb-4 text-yellow-400">음성 명령 테스트</h1>
      <div className="flex gap-3 mb-4">
        <button onClick={start} disabled={producing}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-lg font-bold">
          시작
        </button>
        <button onClick={stop} disabled={!producing}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-lg font-bold">
          종료
        </button>
        <button onClick={() => setLogs([])} className="px-4 py-2 bg-zinc-700 rounded-lg">지우기</button>
        {producing && <span className="self-center text-green-400 animate-pulse">🎙️ 송출 중</span>}
      </div>
      <div className="bg-zinc-800 rounded-xl p-4 h-[55vh] overflow-y-auto space-y-1 mb-4">
        {logs.map((l, i) => (
          <div key={i} className={`text-sm ${colors[l.type ?? "info"]}`}>
            <span className="text-zinc-600 mr-2">[{l.time}]</span>{l.msg}
          </div>
        ))}
      </div>
      <div className="text-zinc-500 text-xs space-y-0.5">
        <p>· "질문 읽어줘" / "다음 질문" → READ_QUESTION</p>
        <p>· "비공개 질문에 답변하겠습니다" → START_PRIVATE</p>
        <p>· "비공개 질문 답변 완료했습니다" → END_PRIVATE</p>
      </div>
    </main>
  );
}
