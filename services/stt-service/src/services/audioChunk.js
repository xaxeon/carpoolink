import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * 오디오 파일을 침묵 지점 기준으로 분할
 * @param {Buffer} audioBuffer
 * @param {string} mimetype
 * @param {object} options
 * @param {number} options.silenceThreshold - 침묵으로 판단할 음량 기준 (dB, 기본 -30)
 * @param {number} options.silenceDuration - 최소 침묵 길이 (초, 기본 1.0)
 * @param {number} options.maxChunkDuration - 청크 최대 길이 (초, 기본 60)
 */
export async function splitAudioIntoChunks(audioBuffer, mimetype, options = {}) {
  const {
    silenceThreshold = -30,
    silenceDuration = 1.0,
    maxChunkDuration = 60,
  } = options;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stt-"));
  const ext = mimetype.includes("mp3") ? "mp3" : "wav";
  const inputPath = path.join(tmpDir, `input.${ext}`);

  fs.writeFileSync(inputPath, audioBuffer);

  // 1. 전체 길이 + 침묵 구간 감지
  const totalDuration = await getAudioDuration(inputPath);
  const silenceRanges = await detectSilence(inputPath, silenceThreshold, silenceDuration);

  // 2. 침묵 지점 기준으로 청크 구간 계산
  const cutPoints = getCutPoints(silenceRanges, totalDuration, maxChunkDuration);

  // 3. 구간별로 오디오 자르기
  const chunks = [];
  for (let i = 0; i < cutPoints.length - 1; i++) {
    const startTime = cutPoints[i];
    const endTime = cutPoints[i + 1];
    const outputPath = path.join(tmpDir, `chunk_${i}.${ext}`);

    await cutAudio(inputPath, outputPath, startTime, endTime - startTime);

    const buffer = fs.readFileSync(outputPath);
    chunks.push({ buffer, startTime, endTime, index: i });
  }

  fs.rmSync(tmpDir, { recursive: true });

  return chunks;
}

/**
 * ffmpeg silencedetect로 침묵 구간 감지
 * @returns {Promise<Array<{ start: number, end: number }>>}
 */
function detectSilence(filePath, threshold, duration) {
  return new Promise((resolve, reject) => {
    const silenceRanges = [];
    let currentStart = null;

    ffmpeg(filePath)
      .audioFilters(`silencedetect=noise=${threshold}dB:d=${duration}`)
      .format("null")
      .output("-")
      .on("stderr", (line) => {
        // silence_start 감지
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        if (startMatch) {
          currentStart = parseFloat(startMatch[1]);
        }
        // silence_end 감지
        const endMatch = line.match(/silence_end:\s*([\d.]+)/);
        if (endMatch && currentStart !== null) {
          silenceRanges.push({ start: currentStart, end: parseFloat(endMatch[1]) });
          currentStart = null;
        }
      })
      .on("end", () => resolve(silenceRanges))
      .on("error", reject)
      .run();
  });
}

/**
 * 침묵 구간 중간 지점을 컷포인트로 변환
 * maxChunkDuration 초과 시 강제로 추가
 */
function getCutPoints(silenceRanges, totalDuration, maxChunkDuration) {
  const cutPoints = [0];

  for (const silence of silenceRanges) {
    const midPoint = (silence.start + silence.end) / 2;
    const lastCut = cutPoints[cutPoints.length - 1];

    // 마지막 컷포인트로부터 너무 짧으면 스킵 (5초 미만)
    if (midPoint - lastCut < 5) continue;

    cutPoints.push(midPoint);
  }

  // maxChunkDuration 초과 구간이 있으면 강제로 중간에 컷포인트 추가
  const finalPoints = [0];
  for (let i = 1; i < cutPoints.length; i++) {
    const prev = finalPoints[finalPoints.length - 1];
    const curr = cutPoints[i];

    if (curr - prev > maxChunkDuration) {
      // 초과 구간은 maxChunkDuration 단위로 강제 분할
      let t = prev + maxChunkDuration;
      while (t < curr) {
        finalPoints.push(t);
        t += maxChunkDuration;
      }
    }
    finalPoints.push(curr);
  }

  finalPoints.push(totalDuration);
  return finalPoints;
}

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });
}

function cutAudio(inputPath, outputPath, startTime, duration) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}