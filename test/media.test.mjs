import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { validateMedia } from '../server/post-media.mjs';
test('photos are decoded, resized and converted; invalid uploads and limits are rejected', async () => {
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#b6ff00' } }).png().toBuffer();
  const photo = { type: 'image/png', data: bytes.toString('base64') };
  const result = await validateMedia([photo, photo, photo]);
  assert.equal(result.length, 3);
  assert.equal((await sharp(result[0].bytes).metadata()).format, 'webp');
  await assert.rejects(validateMedia([photo,photo,photo,photo]));
  await assert.rejects(validateMedia([{ type: 'image/png', data: Buffer.from('<script>bad</script>').toString('base64') }]));
  await assert.rejects(validateMedia([{ type: 'image/png', data: Buffer.alloc(5*1024*1024+1).toString('base64') }]));
  await assert.rejects(validateMedia([{ type: 'video/mp4', data: bytes.toString('base64') }]));
  await assert.rejects(validateMedia([{ type: 'video/mp4', data: Buffer.alloc(25*1024*1024+1).toString('base64') }]));
});
