import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import FormData from 'form-data';
import fetch from 'node-fetch';

const PCM_BYTES_PER_SEC = 16000 * 2; // 16kHz mono s16le

function buildSdp(port, rtpParameters) {
    const codec = rtpParameters.codecs[0];
    const pt = codec.payloadType;
    return [
        'v=0', 'o=- 0 0 IN IP4 127.0.0.1', 's=stt',
        'c=IN IP4 127.0.0.1', 't=0 0',
        `m=audio ${port} RTP/AVP ${pt}`,
        `a=rtpmap:${pt} opus/48000/2`,
        `a=fmtp:${pt} minptime=10;useinbandfec=1`,
        'a=recvonly',
    ].join('\r\n') + '\r\n';
}

function toWav(pcm, sampleRate = 16000) {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

export class RtpForwarder {
    constructor({ sttServiceUrl }) {
        this.sttServiceUrl = sttServiceUrl;
        this.active = new Map();
        this._usedPorts = new Set();
    }

    _allocPort() {
        for (let p = 5100; p <= 5200; p++) {
            if (!this._usedPorts.has(p)) {
                this._usedPorts.add(p);
                return p;
            }
        }
        throw new Error('RTP 포트 부족');
    }

    async start({ router, producer, mentoringId, userId }) {
        const port = this._allocPort();

        const plainTransport = await router.createPlainTransport({
            listenIp: { ip: '127.0.0.1', announcedIp: null },
            rtcpMux: true,
            comedia: false,
        });
        await plainTransport.connect({ ip: '127.0.0.1', port });

        const consumer = await plainTransport.consume({
            producerId: producer.id,
            rtpCapabilities: router.rtpCapabilities,
            paused: false,
        });

        const sdpPath = join(tmpdir(), `stt-${producer.id}.sdp`);
        writeFileSync(sdpPath, buildSdp(port, consumer.rtpParameters));

        const ffmpeg = spawn('ffmpeg', [
            '-protocol_whitelist', 'file,udp,rtp',
            '-i', sdpPath,
            '-af', 'silencedetect=noise=-30dB:d=1.5',
            '-f', 's16le', '-ar', '16000', '-ac', '1',
            'pipe:1',
        ]);

        const state = {
            plainTransport, consumer, ffmpeg, sdpPath, port,
            pcmBuffer: Buffer.alloc(0),
            pcmByteOffset: 0,              // 플러시로 제거된 pcmBuffer 앞부분 누적 길이
            pendingPcm: Buffer.alloc(0),   // 발화 구간만 누적
            lastCutByte: 0,                // pcmBuffer 내 상대 위치
            lastSpeechStartSec: 0,
            lastSilenceStartSec: null,
            chunkIndex: 0,
            mentoringId,
            userId,
        };

        // 긴 침묵 기준: 3초 이상이면 문장 경계로 판단해 flush
        const LONG_SILENCE_SEC = 3.0;
        // 누적 발화가 25초를 넘으면 강제 flush (Whisper 적정 길이)
        const MAX_PENDING_BYTES = 25 * PCM_BYTES_PER_SEC;

        ffmpeg.stdout.on('data', (chunk) => {
            state.pcmBuffer = Buffer.concat([state.pcmBuffer, chunk]);
        });

        ffmpeg.stderr.on('data', (data) => {
            const text = data.toString();

            const startMatch = text.match(/silence_start:\s*([\d.]+)/);
            if (startMatch) {
                const silenceStartSec = parseFloat(startMatch[1]);
                state.lastSilenceStartSec = silenceStartSec;

                // 절대 바이트 위치 → pcmBuffer 내 상대 위치로 변환
                const absEndByte = Math.floor(silenceStartSec * PCM_BYTES_PER_SEC);
                const relEndByte = absEndByte - state.pcmByteOffset;

                const speechPcm = state.pcmBuffer.slice(state.lastCutByte, relEndByte);
                if (speechPcm.length > 0) {
                    state.pendingPcm = Buffer.concat([state.pendingPcm, speechPcm]);
                }
                state.lastCutByte = relEndByte;

                // 누적량이 최대치를 넘으면 강제 flush
                if (state.pendingPcm.length >= MAX_PENDING_BYTES) {
                    this._flushPending(state);
                }
            }

            const endMatch = text.match(/silence_end:\s*([\d.]+)/);
            if (endMatch) {
                const silenceEndSec = parseFloat(endMatch[1]);
                const silenceDuration = state.lastSilenceStartSec !== null
                    ? silenceEndSec - state.lastSilenceStartSec
                    : 0;

                const absEndByte = Math.floor(silenceEndSec * PCM_BYTES_PER_SEC);
                state.lastCutByte = absEndByte - state.pcmByteOffset;
                state.lastSpeechStartSec = silenceEndSec;

                // 긴 침묵이면 누적된 발화를 flush
                if (silenceDuration >= LONG_SILENCE_SEC) {
                    this._flushPending(state);
                }
            }
        });

        ffmpeg.on('close', () => {
            // 세션 종료 시 남은 발화 flush
            const remaining = state.pcmBuffer.slice(state.lastCutByte);
            if (remaining.length > 0) {
                state.pendingPcm = Buffer.concat([state.pendingPcm, remaining]);
            }
            this._flushPending(state);

            try { unlinkSync(state.sdpPath); } catch {}
            this._usedPorts.delete(state.port);
            this.active.delete(producer.id);
        });

        this.active.set(producer.id, state);
    }

    // 누적된 pendingPcm을 STT로 전송하고 pcmBuffer 앞부분을 정리
    _flushPending(state) {
        if (state.pendingPcm.length < PCM_BYTES_PER_SEC * 0.5) {
            state.pendingPcm = Buffer.alloc(0);
            return;
        }

        const wav = toWav(state.pendingPcm);
        const sessionOffset = state.lastSpeechStartSec;
        state.chunkIndex++;
        state.pendingPcm = Buffer.alloc(0);

        // 이미 처리된 pcmBuffer 앞부분 제거 → 바이트 오프셋 보정
        state.pcmByteOffset += state.lastCutByte;
        state.pcmBuffer = state.pcmBuffer.slice(state.lastCutByte);
        state.lastCutByte = 0;

        this._sendChunk(state, wav, sessionOffset)
            .catch((e) => console.error('[RtpForwarder] STT 전송 실패', e.message));
    }

    async _sendChunk(state, wav, sessionOffset) {
        const form = new FormData();
        form.append('audio', wav, {
            filename: `chunk_${state.chunkIndex}.wav`,
            contentType: 'audio/wav',
        });
        form.append('userId', String(state.userId));
        form.append('mentoringId', String(state.mentoringId));
        form.append('chunkIndex', String(state.chunkIndex));
        form.append('sessionOffset', String(sessionOffset));

        await fetch(`${this.sttServiceUrl}/stt/chunk`, { method: 'POST', body: form });
    }

    stop(producerId) {
        const state = this.active.get(producerId);
        if (!state) return;
        state.ffmpeg.kill('SIGTERM');
        state.consumer.close();
        state.plainTransport.close();
    }
}
