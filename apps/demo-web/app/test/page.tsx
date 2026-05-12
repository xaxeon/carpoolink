'use client';

import { useState } from 'react';
import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const MEDIA_SERVER_URL = 'http://localhost:4002';
const MENTORING_ID = 7;    //
const USER_ID = 1;         //

export default function TestPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);

  function log(msg: string) {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  async function start() {
    try {
      const socket = io(MEDIA_SERVER_URL, { auth: { userId: USER_ID } });

      await new Promise<void>((res) => socket.on('connect', res));
      log('Socket 연결됨');

      function signal(action: string, data: object = {}): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
          const requestId = Math.random().toString(36).slice(2);
          socket.emit('signal', { requestId, action, data });
          const handler = (msg: { requestId: string; ok: boolean; data: Record<string, unknown>; error: string }) => {
            if (msg.requestId !== requestId) return;
            socket.off('signal', handler);
            msg.ok ? resolve(msg.data) : reject(new Error(msg.error));
          };
          socket.on('signal', handler);
        });
      }

      // 1. 멘토링 참여
      const joined = await signal('joinMentoring', {
        mentoringId: MENTORING_ID,
        role: 'mentor',
        userId: USER_ID,
      });
      log('멘토링 참여 완료');

      // 2. mediasoup Device 초기화
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: joined.routerRtpCapabilities as mediasoupClient.types.RtpCapabilities });
      log('Device 초기화 완료');

      // 3. Send Transport 생성
      const transportParams = await signal('createWebRtcTransport', { direction: 'send' });
      const sendTransport = device.createSendTransport({
        ...transportParams,
        id: transportParams.transportId,
      } as mediasoupClient.types.TransportOptions);
      log(`Send Transport 생성: ${sendTransport.id}`);

      sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        signal('connectWebRtcTransport', { transportId: sendTransport.id, dtlsParameters })
          .then(callback)
          .catch(errback);
      });

      sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        signal('produce', { transportId: sendTransport.id, kind, rtpParameters, appData })
          .then((res) => callback({ id: res.producerId as string }))
          .catch(errback);
      });

      // 4. 마이크 스트림 획득
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      log(`마이크 획득: ${track.label}`);

      // 5. 오디오 송출 시작 → RtpForwarder 동작 시작
      const producer = await sendTransport.produce({ track });
      log(`오디오 Producer 생성: ${producer.id}`);
      log('✅ 스트리밍 중 — 말하고 0.8초 이상 침묵하면 STT 처리됩니다');
      setStreaming(true);
    } catch (e) {
      log(`❌ 오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', background: '#0d1117', color: '#c9d1d9', minHeight: '100vh' }}>
      <h2 style={{ color: '#58a6ff' }}>STT 파이프라인 테스트</h2>
      <p>mentoringId: <b>{MENTORING_ID}</b> &nbsp; userId: <b>{USER_ID}</b></p>
      <p style={{ color: '#8b949e', fontSize: 13 }}>
        media-server → RtpForwarder → FFmpeg (silencedetect) → stt-service → DB
      </p>

      {!streaming && (
        <button
          onClick={start}
          style={{ padding: '10px 20px', background: '#238636', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginBottom: 16 }}
        >
          마이크 연결 시작
        </button>
      )}

      {streaming && (
        <p style={{ color: '#3fb950', fontWeight: 'bold' }}>
          🎙 스트리밍 중 — 말하고 침묵하면 자동으로 STT 처리 후 DB 저장됩니다
        </p>
      )}

      <div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.8 }}>
        {logs.map((l, i) => (
          <div key={i} style={{ color: l.includes('❌') ? '#f85149' : l.includes('✅') ? '#3fb950' : '#c9d1d9' }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
