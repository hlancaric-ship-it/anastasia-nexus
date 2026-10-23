import test from 'node:test'
import assert from 'node:assert/strict'
import { groupLibraryItems } from '../public/library-groups.mjs'

function makeMockEntitlements(handle, keys = []) {
  const media = keys.map(key => ({
    key,
    title: key.split('/').pop() || key,
    kind: key.endsWith('.pdf') ? 'pdf' : key.endsWith('.mp3') ? 'audio' : 'video',
  }))
  return [{ product: { id: `test-${handle}`, handle, media } }]
}

test('groupLibraryItems: RESET 40+ grouping', () => {
  const entitlements = makeMockEntitlements('reset-40-plus', [
    'reset-40-plus/lekcia-00.mp4',
    'reset-40-plus/lekcia-02.mp4',
    'reset-40-plus/lekcia-03.mp4',
  ])
  const grouped = groupLibraryItems(entitlements)
  assert.strictEqual(grouped.length, 3)
  assert.strictEqual(grouped[0].week, 1) // lekcia-00 → týždeň 1
  assert.strictEqual(grouped[1].week, 2) // lekcia-02 → týždeň 2
  assert.strictEqual(grouped[2].week, 3) // lekcia-03 → týždeň 3
})

test('groupLibraryItems: PDF grouping', () => {
  const entitlements = makeMockEntitlements('reset-40-plus', [
    'reset-40-plus/lekcia-01.mp4',
    'reset-40-plus/tyzden-01/samostudium.pdf',
    'reset-40-plus/tyzden-01/den-1.pdf',
  ])
  const grouped = groupLibraryItems(entitlements)
  assert.strictEqual(grouped.length, 1)
  assert.strictEqual(grouped[0].week, 1)
  assert.strictEqual(grouped[0].videos.length, 1)
  assert.strictEqual(grouped[0].pdfs.length, 2)
})

test('groupLibraryItems: titled week materials stay visible as PDFs', () => {
  const entitlements = makeMockEntitlements('reset-40-plus', [
    'reset-40-plus/tyzden-15/material.pdf',
    'reset-40-plus/tyzden-16/uvod.pdf',
    'reset-40-plus/tyzden-16/zaver.pdf',
  ])
  const grouped = groupLibraryItems(entitlements)
  assert.deepStrictEqual(grouped.map(week => week.week), [15, 16])
  assert.deepStrictEqual(grouped[0].pdfs.map(item => item.key), ['reset-40-plus/tyzden-15/material.pdf'])
  assert.deepStrictEqual(grouped[1].pdfs.map(item => item.key), [
    'reset-40-plus/tyzden-16/uvod.pdf', 'reset-40-plus/tyzden-16/zaver.pdf',
  ])
})

test('groupLibraryItems: Nic nemusíš includes preview and protected audios', () => {
  const entitlements = makeMockEntitlements('nic-nemusis', [
    'nic-nemusis/A1_navrat-zo-sluzby.mp3',
    'nic-nemusis/A6_nic-nemusis.mp3',
  ])
  const grouped = groupLibraryItems(entitlements)
  assert.strictEqual(grouped.length, 1)
  assert.deepStrictEqual(grouped[0].audios.map(item => item.title), [
    'Audio 0 · Ukážka', 'A1_navrat-zo-sluzby.mp3', 'A6_nic-nemusis.mp3',
  ])
  assert.equal(grouped[0].audios[0].previewUrl, '/media/a0_nic-nemusis.mp3')
  assert.equal(grouped[0].audios[1].productId, 'test-nic-nemusis')
})

test('groupLibraryItems: Mixed week with videos and PDFs', () => {
  const keys = []
  for (let i = 1; i <= 16; i++) {
    keys.push(`reset-40-plus/lekcia-${String(i).padStart(2, '0')}.mp4`)
    keys.push(`reset-40-plus/tyzden-${String(i).padStart(2, '0')}/samostudium.pdf`)
    for (let d = 1; d <= 7; d++) {
      keys.push(`reset-40-plus/tyzden-${String(i).padStart(2, '0')}/den-${d}.pdf`)
    }
  }
  const entitlements = makeMockEntitlements('reset-40-plus', keys)
  const grouped = groupLibraryItems(entitlements)
  assert.strictEqual(grouped.length, 16)
  for (let i = 0; i < 16; i++) {
    assert.strictEqual(grouped[i].week, i + 1)
    assert.strictEqual(grouped[i].videos.length, 1)
    assert.strictEqual(grouped[i].pdfs.length, 8) // samostudium + 7 dní
    assert.strictEqual(grouped[i].audios.length, 0)
  }
})

test('groupLibraryItems: Empty entitlements', () => {
  const grouped = groupLibraryItems([])
  assert.deepStrictEqual(grouped, [])
})

test('groupLibraryItems: Product without media', () => {
  const entitlements = [{ product: { id: 'no-media', handle: 'reset-40-plus' } }]
  const grouped = groupLibraryItems(entitlements)
  assert.deepStrictEqual(grouped, [])
})
