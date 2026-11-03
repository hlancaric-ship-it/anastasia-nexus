import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const REQUIRED_PUBLIC_MEDIA = [
  'hero-480p.mp4', 'hero-720p.mp4', 'hero-1080p.mp4', 'hero-1080p.webm',
  'night-sky.mp4', 'poster.jpg', 'night-sky.jpg', 'nature-ambient.mp3',
];

export async function assertPublicMedia(directory) {
  const missing = [];
  const invalid = [];
  for (const name of REQUIRED_PUBLIC_MEDIA) {
    try {
      const file = await stat(join(directory, name));
      if (!file.isFile() || file.size === 0) { missing.push(name); continue; }
      // These are full-size required hero/ambient assets, never tiny placeholders.
      if (file.size < 1024) { invalid.push(name); continue; }
      const handle = await open(join(directory, name), 'r');
      let head;
      try { head = Buffer.alloc(16); await handle.read(head, 0, head.length, 0); }
      finally { await handle.close(); }
      const signature = name.endsWith('.mp4') ? head.toString('ascii', 4, 8) === 'ftyp'
        : name.endsWith('.webm') ? head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        : name.endsWith('.jpg') ? head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
        : name.endsWith('.mp3') ? head.toString('ascii', 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)
        : false;
      if (!signature) invalid.push(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing.push(name);
    }
  }
  if (missing.length) throw new Error(`Missing public media: ${missing.join(', ')}. Restore public/media from the supplied media before building; refusing to publish a site without videos.`);
  if (invalid.length) throw new Error(`Invalid public media: ${invalid.join(', ')}. Required media must be at least 1 KiB and have the expected file signature; refusing to publish placeholders.`);
}
