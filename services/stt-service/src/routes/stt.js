import { Router } from "express";
import multer from "multer";
import { transcribeAudio } from "../services/whisper.js";
import { saveScript } from "../services/scriptSave.js";
import { splitAudioIntoChunks } from "../services/audioChunk.js";
import { prisma } from "@carpoolink/database";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() }); // 파일을 메모리에 임시 저장

/*
POST /stt/chunk
multipart/form-data:
    - audio: 오디오 파일 (wav, mp3 등)
    - userId: string
    - mentoringId: string
    - chunkIndex: string (숫자)
    - startTime?: string (초 단위, 선택)
    - endTime?: string (초 단위, 선택)
*/
router.post("/chunk", upload.single("audio"), async (req, res) => {
  try {
    const { userId, mentoringId, chunkIndex, startTime, endTime, sessionOffset } = req.body;

    // 필수값 체크
    if (!req.file || !userId || !mentoringId || chunkIndex === undefined) {
      return res.status(400).json({ error: "audio, userId, mentoringId, chunkIndex는 필수입니다." });
    }

    // multer 메모리 버퍼 → Whisper가 읽을 수 있는 File 객체로 변환
    const audioFile = new File(
      [req.file.buffer],
      req.file.originalname || `chunk_${chunkIndex}.wav`,
      { type: req.file.mimetype }
    );

    // 1. Whisper STT
    const text = await transcribeAudio(audioFile);

    // 2. DB 저장
    const saved = await saveScript(
      {
        text,
        chunkIndex: parseInt(chunkIndex),
        startTime: startTime ? parseFloat(startTime) : undefined,
        endTime: endTime ? parseFloat(endTime) : undefined,
        sessionOffset: sessionOffset ? parseFloat(sessionOffset) : undefined,
      },
      {
        userId,
        mentoringId,
      }
    );

    res.json({
      scriptId: saved.scriptId.toString(),
      text,
      chunkIndex: parseInt(chunkIndex),
    });
  } catch (err) {
    console.error("[STT ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

//긴 오디오 파일 업로드 → 청크 분할 → STT → DB 저장
router.post("/upload", upload.single("audio"), async (req, res) => {
  try {
    const { userId, mentoringId } = req.body;

    if (!req.file || !userId || !mentoringId) {
      return res.status(400).json({ error: "audio, userId, mentoringId는 필수입니다." });
    }

    // 멘토링 정보 조회
    const mentoring = await prisma.mentoring.findUnique({
      where: { mentoringId: BigInt(mentoringId) },
    });

    if (!mentoring) {
      return res.status(404).json({ error: "멘토링을 찾을 수 없습니다." });
    }

    // 발화자 userId 결정(1:N인 경우 멘토로 고정)
    const speakerUserId = mentoring.isGroup ? mentoring.userId.toString() : userId;

    // 현재 비공개 질문/답변 여부는 false로 기본값 설정. 질문 관리 상태를 먼저 알아야 함
    const isPrivate = false;

    // 1. 청크 분할
    const chunks = await splitAudioIntoChunks(req.file.buffer, req.file.mimetype);

    // 2. 각 청크 STT + DB 저장
    const results = [];
    for (const chunk of chunks) {
      const audioFile = new File(
        [chunk.buffer],
        `chunk_${chunk.index}.wav`,
        { type: req.file.mimetype }
      );

      const text = await transcribeAudio(audioFile);

      const saved = await saveScript(
        {
          text,
          chunkIndex: chunk.index,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          isPrivate,
        },
        { userId: speakerUserId, mentoringId }
      );

      results.push({
        scriptId: saved.scriptId.toString(),
        chunkIndex: chunk.index,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        speakerUserId,
        text,
      });
    }

    res.json({
      mentoringId,
      isGroup: mentoring.isGroup,
      speakerUserId,
      totalChunks: chunks.length,
      scripts: results
    });
  } catch (err) {
    console.error("[STT UPLOAD ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});


export default router;