import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.resolve(__dirname, '../../public/audio');
const MAX_SCRIPT_CHARS = 8000;
const MIN_SCRIPT_CHARS = 100;

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in backend/.env');
  }
  return new GoogleGenAI({ apiKey });
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TTS request timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Converts an episode script to speech audio using Google Gemini TTS.
 * Saves the audio as a WAV file and returns the filename and URL.
 *
 * @param {string} script - The episode script text
 * @param {string} episodeDate - e.g. "2026-10-28"
 * @returns {{ filename, audioUrl, filePath }}
 */
export async function generateTTSAudio(script, episodeDate) {
  const cleanScript = (script || '').trim();

  if (cleanScript.length < MIN_SCRIPT_CHARS) {
    throw new Error(`Script is too short for TTS generation (${cleanScript.length} chars, minimum ${MIN_SCRIPT_CHARS})`);
  }

  // Cost & token control: truncate to max characters
  const truncatedScript = cleanScript.slice(0, MAX_SCRIPT_CHARS);

  // Ensure the audio output directory exists
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }

  const filename = `episode_${episodeDate}.wav`;
  const filePath = path.join(AUDIO_DIR, filename);
  const audioUrl = `/audio/${filename}`;

  const ai = getGenAIClient();

  // Try Gemini TTS models in order
  const ttsCandidates = ['gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'];
  let lastError = null;

  for (const modelName of ttsCandidates) {
    try {
      console.log(`Attempting TTS with model: ${modelName}`);

      const response = await withTimeout(
        ai.models.generateContent({
          model: modelName,
          contents: truncatedScript,
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Kore'
                }
              }
            }
          }
        }),
        30000
      );

      // Extract audio data from the response
      const audioData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!audioData) {
        throw new Error('TTS model returned no audio data in response');
      }

      // Decode base64 audio and save as WAV
      const audioBuffer = Buffer.from(audioData, 'base64');

      if (audioBuffer.length < 1000) {
        throw new Error(`Audio buffer is too small (${audioBuffer.length} bytes) — likely an empty or error response`);
      }

      // Write WAV file: Gemini TTS returns raw PCM data, wrap in WAV header
      const wavBuffer = addWavHeader(audioBuffer, 24000, 1, 16);
      fs.writeFileSync(filePath, wavBuffer);

      console.log(`Audio saved to: ${filePath} (${Math.round(wavBuffer.length / 1024)} KB)`);

      // Estimate duration: PCM16 at 24kHz mono = 48000 bytes/second
      const durationSeconds = Math.round(audioBuffer.length / 48000);

      return { filename, audioUrl, filePath, durationSeconds };
    } catch (err) {
      console.warn(`TTS model ${modelName} failed: ${err.message?.slice(0, 100)}`);
      lastError = err;
    }
  }

  throw lastError || new Error('All TTS models failed');
}

/**
 * Adds a standard WAV file header to raw PCM audio bytes.
 * Required because Gemini TTS returns raw Linear16 PCM samples.
 *
 * @param {Buffer} pcmData - Raw PCM audio bytes
 * @param {number} sampleRate - e.g. 24000
 * @param {number} numChannels - 1 (mono)
 * @param {number} bitsPerSample - 16
 * @returns {Buffer} Complete WAV file buffer
 */
function addWavHeader(pcmData, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const chunkSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);        // PCM chunk size
  header.writeUInt16LE(1, 20);         // AudioFormat = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
