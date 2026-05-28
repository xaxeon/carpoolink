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
    model: "whisper-1",
    language: "ko",
    temperature: 0,
    response_format: 'verbose_json',
  });
  const noSpeechProb = transcription.segments?.[0]?.no_speech_prob ?? 0;
  if (noSpeechProb > 0.6) {
    return '';
  }
  return transcription.text ?? '';
}