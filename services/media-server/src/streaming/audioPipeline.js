// 오디오 스트리밍 파이프라인 관리를 위한 클래스 정의
export class AudioPipelineManager {
    constructor() {
        this.rooms = new Map();
    }

    // mentoringId에 해당하는 오디오 스트림 파이프라인 상태를 초기화하거나 조회하는 메서드
    ensureRoom(mentoringId) {
        const key = Number(mentoringId);

        if (!this.rooms.has(key)) {
            this.rooms.set(key, {
                mentorAudioProducerId: null,
                menteeAudioProducerId: null,
                ttsProducerIds: new Set(),
                pendingTtsMessages: []
            });
        }

        return this.rooms.get(key);
    }

    // 멘토의 오디오 프로듀서 ID를 방에 연결하는 메서드
    attachMentorAudioProducer(mentoringId, producerId) {
        const room = this.ensureRoom(mentoringId);
        room.mentorAudioProducerId = producerId;

        this.notifyAudioCompositeChange(mentoringId);
    }

    // 멘티의 오디오 프로듀서 ID를 방에 연결하는 메서드 (1:1 멘토링에서 사용)
    attachMenteeAudioProducer(mentoringId, producerId) {
        const room = this.ensureRoom(mentoringId);
        room.menteeAudioProducerId = producerId;

        this.notifyAudioCompositeChange(mentoringId);
    }

    // TTS(Text-to-Speech) 오디오 프로듀서 ID를 방에 연결하는 메서드
    attachTtsAudioProducer(mentoringId, producerId) {
        const room = this.ensureRoom(mentoringId);
        room.ttsProducerIds.add(producerId);

        this.notifyAudioCompositeChange(mentoringId);
    }

    // 특정 오디오 프로듀서 ID를 방에서 분리하는 메서드
    detachAudioProducer(mentoringId, producerId) {
        const room = this.ensureRoom(mentoringId);

        if (room.mentorAudioProducerId === producerId) {
            room.mentorAudioProducerId = null;
        }

        if (room.menteeAudioProducerId === producerId) {
            room.menteeAudioProducerId = null;
        }

        room.ttsProducerIds.delete(producerId);

        this.notifyAudioCompositeChange(mentoringId);
    }

    // 멘토링 세션에 대한 새로운 TTS 메시지를 큐에 추가하는 메서드
    enqueueTtsMessage(mentoringId, payload) {
        const room = this.ensureRoom(mentoringId);

        room.pendingTtsMessages.push({
            ...payload,
            createdAt: new Date().toISOString()
        });

        if (room.pendingTtsMessages.length > 100) {
            room.pendingTtsMessages.shift();
        }
    }

    // 오디오 합성 상태 변경을 외부 시스템에 알리는 메서드 (예: 믹서 또는 녹음 워커)
    notifyAudioCompositeChange(mentoringId) {
        const room = this.ensureRoom(mentoringId);

        // Placeholder hook for external mixer/recording worker.
        // In production this can trigger RTP forwarding to FFmpeg/GStreamer,
        // then branch to S3 upload and real-time STT processors.
        const compositePlan = {
            mentoringId: Number(mentoringId),
            mentorAudioProducerId: room.mentorAudioProducerId,
            menteeAudioProducerId: room.menteeAudioProducerId,
            ttsProducerIds: [...room.ttsProducerIds]
        };

        console.debug('[audio-pipeline] composite plan updated', compositePlan);
    }

    // mentoringId에 해당하는 방의 현재 오디오 스트림 상태를 스냅샷 형태로 반환하는 메서드
    getRoomSnapshot(mentoringId) {
        const room = this.ensureRoom(mentoringId);

        return {
            mentorAudioProducerId: room.mentorAudioProducerId,
            menteeAudioProducerId: room.menteeAudioProducerId,
            ttsProducerIds: [...room.ttsProducerIds],
            pendingTtsMessages: room.pendingTtsMessages.length
        };
    }

    // mentoringId에 해당하는 방을 완전히 제거하는 메서드
    closeRoom(mentoringId) {
        this.rooms.delete(Number(mentoringId));
    }
}
