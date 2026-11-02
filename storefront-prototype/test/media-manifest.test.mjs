import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPublicMedia, REQUIRED_PUBLIC_MEDIA } from '../media-manifest.mjs';

test('a fresh checkout without ignored public media cannot build', async () => {
  await assert.rejects(assertPublicMedia(join(tmpdir(), 'absent-anastasia-media')), /Missing public media:.*hero-1080p.mp4.*night-sky.mp4/);
});

test('missing or empty videos are rejected; restored complete media passes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'anastasia-media-'));
  try {
    for (const name of REQUIRED_PUBLIC_MEDIA) await writeFile(join(dir, name), 'fixture');
    await assertPublicMedia(dir);
    await writeFile(join(dir, 'night-sky.mp4'), '');
    await assert.rejects(assertPublicMedia(dir), /Missing public media: night-sky.mp4/);
    await rm(join(dir, 'night-sky.mp4'));
    await mkdir(join(dir, 'night-sky.mp4'));
    await assert.rejects(assertPublicMedia(dir), /Missing public media: night-sky.mp4/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
