import { fileURLToPath } from 'node:url';
import { assertPublicMedia } from './media-manifest.mjs';

await assertPublicMedia(fileURLToPath(new URL('./public/media/', import.meta.url)));
await assertPublicMedia(fileURLToPath(new URL('./dist/media/', import.meta.url)));
console.log('Public video/audio assets present in source and deployment artifact.');
