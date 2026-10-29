import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/index.js';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_AUDIO_DIR = path.resolve(__dirname, '../../public/audio');

// Ensure local audio directory exists for fallback or local dev
if (!fs.existsSync(LOCAL_AUDIO_DIR)) {
  fs.mkdirSync(LOCAL_AUDIO_DIR, { recursive: true });
}

/**
 * Deterministically parses a standard RIFF/WAVE header to calculate exact audio duration.
 * Accurately scans through RIFF chunks to find 'fmt ' and 'data' blocks.
 *
 * @param {Buffer} buffer - Raw audio file buffer
 * @returns {{ durationSeconds: number, sampleRate: number, channels: number, bitsPerSample: number, dataSize: number }}
 */
export function parseWavMetadata(buffer) {
  if (!buffer || buffer.length < 44) {
    throw new Error('Buffer is too small to be a valid WAV file (minimum 44 bytes).');
  }

  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error(`Invalid WAV signature: expected RIFF/WAVE, got ${riff}/${wave}`);
  }

  let offset = 12;
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let byteRate = 48000;
  let dataSize = 0;
  let foundFmt = false;
  let foundData = false;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      byteRate = buffer.readUInt32LE(offset + 16);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
      foundFmt = true;
    } else if (chunkId === 'data') {
      dataSize = chunkSize;
      foundData = true;
      break;
    }

    offset += 8 + chunkSize;
  }

  if (!foundData) {
    // Fallback: entire buffer minus 44 bytes header
    dataSize = Math.max(0, buffer.length - 44);
  }

  // Exact duration calculation
  const calculatedByteRate = byteRate > 0
    ? byteRate
    : sampleRate * channels * (bitsPerSample / 8);

  const durationSeconds = calculatedByteRate > 0
    ? Math.round((dataSize / calculatedByteRate) * 100) / 100
    : 0;

  return {
    durationSeconds,
    sampleRate,
    channels,
    bitsPerSample,
    dataSize: dataSize || buffer.length
  };
}

/**
 * Checks if S3 / Cloudflare R2 credentials and configuration are provided.
 */
export function isS3Configured() {
  const bucket = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  return Boolean(bucket && accessKey && secretKey);
}

/**
 * Returns an instantiated S3Client configured for AWS S3 or Cloudflare R2.
 */
let cachedS3Client = null;
export function getS3Client() {
  if (cachedS3Client) return cachedS3Client;

  if (!isS3Configured()) {
    return null;
  }

  const region = process.env.S3_REGION || process.env.AWS_REGION || 'auto';
  const endpoint = process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL || undefined;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  cachedS3Client = new S3Client({
    region,
    ...(endpoint ? { endpoint } : {}),
    credentials: {
      accessKeyId,
      secretAccessKey
    },
    // Required for MinIO or Cloudflare R2 path/bucket compatibility
    forcePathStyle: Boolean(process.env.S3_FORCE_PATH_STYLE === 'true')
  });

  return cachedS3Client;
}

/**
 * Uploads audio buffer to persistent storage (S3/Cloudflare R2 if configured, local disk as fallback).
 *
 * @param {Object} params
 * @param {number|string} params.episodeId
 * @param {string} params.episodeDate - e.g. '2026-10-28'
 * @param {Buffer} params.buffer - WAV audio bytes
 * @param {string} [params.filename] - optional filename
 * @returns {Promise<{ provider: 's3'|'local', key: string, bytes: number, durationSeconds: number, publicUrl: string }>}
 */
export async function uploadAudio({ episodeId, episodeDate, buffer, filename }) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Cannot upload empty audio buffer.');
  }

  const safeFilename = filename || `episode_${episodeDate || episodeId || Date.now()}.wav`;
  const metadata = parseWavMetadata(buffer);
  const audioBytes = buffer.length;

  if (isS3Configured()) {
    const s3 = getS3Client();
    const bucket = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;
    const storageKey = `episodes/${safeFilename}`;

    try {
      console.log(`[AudioStorage] Uploading ${audioBytes} bytes to S3 bucket "${bucket}" with key "${storageKey}"...`);
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: 'audio/wav',
        Metadata: {
          episode_id: String(episodeId || ''),
          episode_date: String(episodeDate || ''),
          duration_seconds: String(metadata.durationSeconds)
        }
      }));

      // Verify upload succeeded via HeadObject
      await s3.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: storageKey
      }));

      console.log(`[AudioStorage] Upload verified in S3. Duration: ${metadata.durationSeconds}s, Bytes: ${audioBytes}`);

      // Public CDN / custom URL prefix if configured
      const publicPrefix = process.env.S3_PUBLIC_URL_PREFIX || '';
      const publicUrl = publicPrefix
        ? `${publicPrefix.replace(/\/$/, '')}/${storageKey}`
        : `/api/episodes/${episodeId}/audio`;

      return {
        provider: 's3',
        key: storageKey,
        bytes: audioBytes,
        durationSeconds: metadata.durationSeconds,
        publicUrl
      };
    } catch (s3Error) {
      console.error(`[AudioStorage] S3 upload failed: ${s3Error.message}. Falling back to local storage.`);
      // If S3 explicitly failed, fallback to local storage so the episode is not lost
    }
  }

  // Local storage fallback
  const localFilePath = path.join(LOCAL_AUDIO_DIR, safeFilename);
  fs.writeFileSync(localFilePath, buffer);
  console.log(`[AudioStorage] Saved ${audioBytes} bytes locally at: ${localFilePath}`);

  // Also persist binary audio buffer to PostgreSQL database so ephemeral host restarts never lose audio
  if (episodeId && buffer) {
    try {
      await pool.query('UPDATE episodes SET audio_data = $1 WHERE id = $2', [buffer, episodeId]);
    } catch (dbErr) {
      console.warn(`[AudioStorage] Database audio_data save warning: ${dbErr.message}`);
    }
  }

  return {
    provider: 'local',
    key: safeFilename,
    bytes: audioBytes,
    durationSeconds: metadata.durationSeconds,
    publicUrl: `/audio/${safeFilename}`
  };
}

/**
 * Streams audio to an Express response with HTTP 206 Partial Content (Range header support).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Object} episode
 */
export async function streamAudioResponse(req, res, episode) {
  const provider = episode.audio_storage_provider || 'local';
  const storageKey = episode.audio_storage_key || (episode.audio_url ? path.basename(episode.audio_url) : null);

  if (!storageKey) {
    return res.status(404).json({ error: 'Audio file not found for this episode.' });
  }

  if (provider === 's3' && isS3Configured()) {
    const s3 = getS3Client();
    const bucket = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;
    const rangeHeader = req.headers.range;

    try {
      const getParams = {
        Bucket: bucket,
        Key: storageKey,
        ...(rangeHeader ? { Range: rangeHeader } : {})
      };

      const s3Response = await s3.send(new GetObjectCommand(getParams));

      if (rangeHeader && s3Response.ContentRange) {
        res.writeHead(206, {
          'Content-Range': s3Response.ContentRange,
          'Accept-Ranges': 'bytes',
          'Content-Length': s3Response.ContentLength,
          'Content-Type': s3Response.ContentType || 'audio/wav'
        });
      } else {
        res.writeHead(200, {
          'Content-Length': s3Response.ContentLength,
          'Content-Type': s3Response.ContentType || 'audio/wav',
          'Accept-Ranges': 'bytes'
        });
      }

      s3Response.Body.pipe(res);
      return;
    } catch (s3Err) {
      console.warn(`[AudioStorage] S3 streaming failed for key "${storageKey}": ${s3Err.message}. Checking local disk.`);
    }
  }

  // Local file streaming fallback
  const localFilename = path.basename(storageKey);
  const localFilePath = path.join(LOCAL_AUDIO_DIR, localFilename);

  // If missing from ephemeral disk, automatically re-hydrate audio bytes from PostgreSQL database
  if (!fs.existsSync(localFilePath) && episode.id) {
    try {
      const dbRes = await pool.query('SELECT audio_data FROM episodes WHERE id = $1', [episode.id]);
      if (dbRes.rows[0]?.audio_data) {
        fs.writeFileSync(localFilePath, dbRes.rows[0].audio_data);
        console.log(`[AudioStorage] Re-hydrated audio file on disk from database for episode ${episode.id}`);
      }
    } catch (dbErr) {
      console.warn(`[AudioStorage] Database re-hydration check failed: ${dbErr.message}`);
    }
  }

  if (!fs.existsSync(localFilePath)) {
    return res.status(404).json({
      error: 'Audio file not found on server.',
      provider,
      storageKey
    });
  }

  const stat = fs.statSync(localFilePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send(`Requested range not satisfiable: ${start} >= ${fileSize}`);
      return;
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(localFilePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/wav'
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'audio/wav',
      'Accept-Ranges': 'bytes'
    };
    res.writeHead(200, head);
    fs.createReadStream(localFilePath).pipe(res);
  }
}

/**
 * Returns storage configuration diagnostics without exposing secrets.
 */
export function getStorageDiagnostics() {
  const configured = isS3Configured();
  const bucket = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || null;
  const maskedBucket = bucket ? `${bucket.slice(0, 3)}***` : null;

  return {
    provider: configured ? 's3' : 'local',
    s3Configured: configured,
    bucketMasked: maskedBucket,
    region: process.env.S3_REGION || process.env.AWS_REGION || (configured ? 'auto' : null),
    localDirectory: LOCAL_AUDIO_DIR
  };
}

