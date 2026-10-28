import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWavMetadata,
  isS3Configured,
  getStorageDiagnostics
} from '../src/services/audioStorage.js';

describe('Phase 3: Persistent Audio Storage & WAV Parsing', () => {
  // Helper to generate a dummy RIFF/WAVE header with PCM data
  function createTestWavBuffer({ sampleRate = 24000, channels = 1, bitsPerSample = 16, dataBytes = 48000 }) {
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const chunkSize = 36 + dataBytes;

    const buffer = Buffer.alloc(44 + dataBytes);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(chunkSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // subchunk1 size
    buffer.writeUInt16LE(1, 20); // PCM = 1
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataBytes, 40);

    return buffer;
  }

  it('accurately parses 1.00 second WAV file at 24kHz mono 16-bit', () => {
    // 24000 samples/sec * 1 channel * 2 bytes/sample = 48000 bytes/sec
    const wav = createTestWavBuffer({ sampleRate: 24000, channels: 1, bitsPerSample: 16, dataBytes: 48000 });
    const meta = parseWavMetadata(wav);

    assert.strictEqual(meta.sampleRate, 24000);
    assert.strictEqual(meta.channels, 1);
    assert.strictEqual(meta.bitsPerSample, 16);
    assert.strictEqual(meta.dataSize, 48000);
    assert.strictEqual(meta.durationSeconds, 1.00);
  });

  it('accurately parses fractional duration (e.g. 2.50 seconds) from data chunk size', () => {
    // 48000 * 2.5 = 120000 bytes
    const wav = createTestWavBuffer({ sampleRate: 24000, channels: 1, bitsPerSample: 16, dataBytes: 120000 });
    const meta = parseWavMetadata(wav);

    assert.strictEqual(meta.durationSeconds, 2.50);
  });

  it('accurately calculates duration for stereo 44.1kHz 16-bit audio', () => {
    // 44100 * 2 channels * 2 bytes = 176400 bytes/sec
    // 352800 bytes = exactly 2.00 seconds
    const wav = createTestWavBuffer({ sampleRate: 44100, channels: 2, bitsPerSample: 16, dataBytes: 352800 });
    const meta = parseWavMetadata(wav);

    assert.strictEqual(meta.sampleRate, 44100);
    assert.strictEqual(meta.channels, 2);
    assert.strictEqual(meta.durationSeconds, 2.00);
  });

  it('rejects truncated buffer (< 44 bytes)', () => {
    const tinyBuffer = Buffer.alloc(30);
    assert.throws(() => parseWavMetadata(tinyBuffer), /Buffer is too small/);
  });

  it('rejects buffer without valid RIFF/WAVE header signature', () => {
    const fakeBuffer = Buffer.alloc(100);
    fakeBuffer.write('FAKE', 0);
    assert.throws(() => parseWavMetadata(fakeBuffer), /Invalid WAV signature/);
  });

  it('reports safe storage diagnostics without leaking credentials', () => {
    const diag = getStorageDiagnostics();
    assert.ok(['s3', 'local'].includes(diag.provider));
    assert.strictEqual(typeof diag.s3Configured, 'boolean');
    assert.ok(typeof diag.localDirectory === 'string');

    // Never leak raw keys in diagnostics
    assert.strictEqual(diag.secretAccessKey, undefined);
    assert.strictEqual(diag.accessKeyId, undefined);
  });
});

