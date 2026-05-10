import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * @param {import("fs").ReadStream} audioStream - 오디오 파일 스트림
 * @returns {Promise<string>} 변환된 텍스트
 */
export async function transcribeAudio(audioStream) {
  const transcription = await openai.audio.transcriptions.create({
    file: audioStream,
    model: "gpt-4o-transcribe",
    language: "ko",
  });
  return transcription.text;
}