import { stat } from 'node:fs/promises';
import { join } from 'node:path';

export const REQUIRED_PUBLIC_MEDIA = [
  'hero-480p.mp4', 'hero-720p.mp4', 'hero-1080p.mp4', 'hero-1080p.webm',
  'night-sky.mp4', 'poster.jpg', 'night-sky.jpg', 'nature-ambient.mp3',
];

export async function assertPublicMedia(directory) {
  const missing = [];
  for (const name of REQUIRED_PUBLIC_MEDIA) {
    try {
      const file = await stat(join(directory, name));
      if (!file.isFile() || file.size === 0) missing.push(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing.push(name);
    }
  }
  if (missing.length) throw new Error(`Missing public media: ${missing.join(', ')}. Restore public/media from the supplied media before building; refusing to publish a site without videos.`);
}
