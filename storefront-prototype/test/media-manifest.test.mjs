import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPublicMedia, REQUIRED_PUBLIC_MEDIA } from '../media-manifest.mjs';

// Header fixtures exercise the build gate, not full codec/decoder validity.
const headerFixture = name => {
  const file = Buffer.alloc(1024);
  if (name.endsWith('.mp4')) Buffer.from('000000206674797069736f6d00000200', 'hex').copy(file);
  else if (name.endsWith('.webm')) Buffer.from('1a45dfa39f428681', 'hex').copy(file);
  else if (name.endsWith('.jpg')) Buffer.from('ffd8ffe000104a464946', 'hex').copy(file);
  else if (name.endsWith('.mp3')) Buffer.from('49443304000000000023', 'hex').copy(file);
  return file;
};

test('a fresh checkout without ignored public media cannot build', async () => {
  await assert.rejects(assertPublicMedia(join(tmpdir(), 'absent-anastasia-media')), /Missing public media:.*hero-1080p.mp4.*night-sky.mp4/);
});

test('missing or empty videos are rejected; restored complete media passes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'anastasia-media-'));
  try {
    for (const name of REQUIRED_PUBLIC_MEDIA) await writeFile(join(dir, name), headerFixture(name));
    await assertPublicMedia(dir);
    await writeFile(join(dir, 'night-sky.mp4'), '');
    await assert.rejects(assertPublicMedia(dir), /Missing public media: night-sky.mp4/);
    await rm(join(dir, 'night-sky.mp4'));
    await mkdir(join(dir, 'night-sky.mp4'));
    await assert.rejects(assertPublicMedia(dir), /Missing public media: night-sky.mp4/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('nonempty tiny placeholders and text disguised as media are rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'anastasia-media-invalid-'));
  try {
    for (const name of REQUIRED_PUBLIC_MEDIA) await writeFile(join(dir, name), headerFixture(name));
    for (const name of REQUIRED_PUBLIC_MEDIA) {
      await writeFile(join(dir, name), 'x\n');
      await assert.rejects(assertPublicMedia(dir), error => error.message.startsWith(`Invalid public media: ${name}.`));
      await writeFile(join(dir, name), Buffer.alloc(2048, 'x'));
      await assert.rejects(assertPublicMedia(dir), error => error.message.startsWith(`Invalid public media: ${name}.`));
      await writeFile(join(dir, name), headerFixture(name));
    }
    await assertPublicMedia(dir);
    const mp3 = Buffer.alloc(1024); mp3[0] = 0xff; mp3[1] = 0xfb;
    await writeFile(join(dir, 'nature-ambient.mp3'), mp3);
    await assertPublicMedia(dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
