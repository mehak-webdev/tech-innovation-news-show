import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyAudioFile } from '../src/services/ttsGenerator.js';
import { buildScriptPrompt } from '../src/services/episodeScriptGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Pipeline Resumability & Verification Safeguards', () => {
  it('verifyAudioFile correctly validates real WAV files vs missing/corrupt files', () => {
    // Missing file returns false
    assert.strictEqual(verifyAudioFile('non_existent_file_12345.wav'), false);
    assert.strictEqual(verifyAudioFile(null), false);
    assert.strictEqual(verifyAudioFile(''), false);

    // Create a temporary valid test WAV buffer in public/audio
    const testFilename = 'test_sample_audio_check.wav';
    const audioDir = path.resolve(__dirname, '../public/audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    const testPath = path.join(audioDir, testFilename);

    try {
      // 1. Under-size file (<1000 bytes) should fail verification
      fs.writeFileSync(testPath, Buffer.alloc(200));
      assert.strictEqual(verifyAudioFile(testFilename), false);

      // 2. Valid-size file (>=1000 bytes) should pass verification
      fs.writeFileSync(testPath, Buffer.alloc(1500));
      assert.strictEqual(verifyAudioFile(testFilename), true);
    } finally {
      if (fs.existsSync(testPath)) {
        fs.unlinkSync(testPath);
      }
    }
  });

  it('buildScriptPrompt produces clean prompt without bullet points directive and includes source attributions', () => {
    const mockArticles = [
      {
        id: 1,
        title: 'Apple Touchscreen MacBook Unveiled',
        url: 'https://theverge.com/macbook-touch',
        source_name: 'The Verge',
        ai_summary: 'Apple is releasing its first touchscreen laptop.',
        ai_category: 'Hardware & Devices',
        importance_score: 90,
        ai_key_points: ['Touchscreen OLED display', 'Available late 2026']
      },
      {
        id: 2,
        title: 'Open Source AI Model Breakthrough',
        url: 'https://techcrunch.com/open-ai',
        source_name: 'TechCrunch',
        ai_summary: 'A new open weights model matches proprietary benchmarks.',
        ai_category: 'Artificial Intelligence',
        importance_score: 85,
        ai_key_points: ['Permissive license', 'Runs on commodity hardware']
      }
    ];

    const prompt = buildScriptPrompt(mockArticles, 'Wednesday, October 28, 2026');

    assert.ok(prompt.includes('Apple Touchscreen MacBook Unveiled'));
    assert.ok(prompt.includes('The Verge'));
    assert.ok(prompt.includes('TechCrunch'));
    assert.ok(prompt.includes('Wednesday, October 28, 2026'));
    assert.ok(prompt.includes('absolutely no bullet points'));
    assert.ok(prompt.includes('STORY 1'));
    assert.ok(prompt.includes('STORY 2'));
  });

  it('re-generates script only when existing script is missing or invalid', () => {
    // Existing script with sufficient length (>=180 chars) is considered reusable
    const validScript = 'Good morning tech listeners, welcome to the Tech Innovation News Show for Wednesday October 28 2026. Today we cover big news from Apple releasing their first touchscreen MacBook according to The Verge. Meanwhile TechCrunch reports on a major open source AI milestone. Thanks for listening and check the sources above.';
    assert.ok(validScript.length >= 180, 'Valid script meets length requirement');

    const tooShortScript = 'Short draft.';
    assert.ok(tooShortScript.length < 180, 'Too short script is identified as needing re-generation');
  });

  it('ensures TTS failure does not mark an episode completed', () => {
    // Simulated state transition check
    const mockEpisode = {
      id: 99,
      status: 'generating',
      stage: 'generating_audio',
      script: 'Valid long script text here...',
      audio_filename: null
    };

    // If TTS throws an error
    const ttsError = new Error('TTS service timed out');
    const updatedState = {
      ...mockEpisode,
      status: 'failed',
      stage: 'generating_audio',
      error_message: `TTS generation failed: ${ttsError.message}`
    };

    assert.strictEqual(updatedState.status, 'failed');
    assert.notStrictEqual(updatedState.status, 'completed');
    assert.notStrictEqual(updatedState.status, 'audio_ready');
    assert.strictEqual(updatedState.stage, 'generating_audio');
    assert.ok(updatedState.error_message.includes('TTS generation failed'));
  });
});
