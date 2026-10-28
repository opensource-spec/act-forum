import { inflateSync } from 'node:zlib';

// The browser crops uploads to PNG. Bound both compressed and decoded sizes,
// validate the image, and discard metadata before storing it.
export function cleanAvatar(buffer) {
  if (buffer.length > 524288 || buffer.length < 45 ||
    !buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return null;
  const kept = [buffer.subarray(0, 8)], data = [];
  let offset = 8, width, height, channels, ended = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), end = offset + 12 + length;
    if (end > buffer.length) return null;
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, end - 4);
    let crc = 0xffffffff;
    for (const byte of buffer.subarray(offset + 4, end - 4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== buffer.readUInt32BE(end - 4)) return null;
    if (offset === 8 && type !== 'IHDR') return null;
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) return null;
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4);
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[chunk[9]];
      if (!width || !height || width > 512 || height > 512 || !channels ||
        chunk[8] !== 8 || chunk[10] !== 0 || chunk[11] !== 0 || chunk[12] !== 0) return null;
    } else if (type === 'IDAT') data.push(chunk);
    else if (type === 'IEND') {
      if (length || end !== buffer.length) return null;
      ended = true;
    } else if (!(buffer[offset + 4] & 32)) return null;
    if (['IHDR', 'IDAT', 'IEND'].includes(type)) kept.push(buffer.subarray(offset, end));
    offset = end;
  }
  if (!ended || !data.length) return null;
  try {
    const stride = width * channels + 1;
    const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: height * stride });
    if (decoded.length !== height * stride) return null;
    for (let row = 0; row < height; row++) if (decoded[row * stride] > 4) return null;
  } catch { return null; }
  return Buffer.concat(kept);
}
