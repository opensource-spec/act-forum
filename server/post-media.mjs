import sharp from 'sharp';
import ffprobe from 'ffprobe-static';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const probe = promisify(execFile);
export async function validateMedia(items = []) {
  if (!Array.isArray(items) || items.length > 4) throw Error('INVALID_MEDIA');
  let photos = 0, videos = 0, total = 0;
  const result = [];
  for (const item of items) {
    if (!item || typeof item.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data)) throw Error('INVALID_MEDIA');
    const bytes = Buffer.from(item.data, 'base64');
    if (item.type === 'video/mp4') {
      if (++videos > 1 || !bytes.length || bytes.length > 25 * 1024 * 1024) throw Error('INVALID_MEDIA');
      const dir = await mkdtemp(path.join(tmpdir(), 'forum-media-'));
      try {
        const file = path.join(dir, 'video.mp4'); await writeFile(file, bytes);
        const { stdout } = await probe(ffprobe.path, ['-v','error','-protocol_whitelist','file','-show_format','-show_streams','-of','json',file], { timeout: 15000, maxBuffer: 1024 * 1024 });
        const info = JSON.parse(stdout), duration = Number(info.format?.duration);
        if (!info.format?.format_name?.includes('mp4') || !(duration > 0 && duration <= 30) ||
          !info.streams.some((s) => s.codec_type === 'video' && s.codec_name === 'h264') ||
          info.streams.some((s) => !['h264','aac'].includes(s.codec_name) || Number(s.duration || 0) > 30)) throw Error('INVALID_MEDIA');
        result.push({ type: 'video/mp4', bytes });
      } finally { await rm(dir, { recursive: true, force: true }); }
    } else {
      total += bytes.length;
      if (++photos > 3 || !bytes.length || bytes.length > 5 * 1024 * 1024 || total > 15 * 1024 * 1024) throw Error('INVALID_MEDIA');
      const image = sharp(bytes, { limitInputPixels: 16000000, animated: false });
      const metadata = await image.metadata();
      if (!['jpeg','png','webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw Error('INVALID_MEDIA');
      result.push({ type: 'image/webp', bytes: await image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer() });
    }
  }
  return result;
}
