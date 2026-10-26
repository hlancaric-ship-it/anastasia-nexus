// Izolovaný test ambientu: fake Audio a RAF, bez prohlížeče a médií.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAmbient} from '../public/ambient.mjs';

const tick = () => new Promise(r => setImmediate(r));

class FakeAudio {
  constructor() { this.listeners = {}; this.paused = true; this.volume = 1; this.readyState = 0; this.duration = NaN; this.currentTime = 0; this._src = ''; this.pendingPlay = null; this.autoLoad = true; this.autoPlay = true; }
  set src(v) { this._src = v; this.readyState = 0; this.duration = NaN; if (this.autoLoad) queueMicrotask(() => this.loaded()); }
  get src() { return this._src; }
  addEventListener(t, f) { (this.listeners[t] ||= new Set()).add(f); }
  removeEventListener(t, f) { this.listeners[t]?.delete(f); }
  emit(t) { [...(this.listeners[t] || [])].forEach(f => f({type: t})); }
  loaded() { this.readyState = 1; this.duration = 60; this.emit('loadedmetadata'); }
  play() {
    return new Promise((ok, fail) => {
      const start = () => { this.paused = false; this.pendingPlay = null; ok(); };
      this.pendingPlay = {start, fail};
      if (this.autoPlay) queueMicrotask(start);
    });
  }
  pause() { this.paused = true; if (this.pendingPlay) { const {fail} = this.pendingPlay; this.pendingPlay = null; fail(Object.assign(new Error('aborted'), {name: 'AbortError'})); } }
  removeAttribute() { this._src = ''; }
  load() {}
}

function setup(opts = {}) {
  let t = 0, id = 0;
  const frames = new Map(), audios = [], changes = [];
  const amb = createAmbient({
    createAudio: () => { const a = new FakeAudio(); audios.push(a); return a; },
    raf: f => { frames.set(++id, f); return id; },
    caf: i => frames.delete(i),
    now: () => t, random: () => 0, onChange: on => changes.push(on), ...opts,
  });
  // Posune čas o ms a spustí naplánované snímky (opakovaně, dokud nějaké jsou).
  const advance = async ms => {
    await tick(); await tick(); // nechá rozběhnuté načítání/play naplánovat fade ještě před posunem času
    t += ms;
    for (let guard = 0; frames.size && guard < 50; guard++) {
      const batch = [...frames.values()]; frames.clear(); batch.forEach(f => f(t));
      await tick();
    }
    await tick();
  };
  const audible = () => audios.filter(a => !a.paused && a.volume > 0);
  return {amb, audios, changes, advance, frames};
}

test('nahrazený fade dokončí svou Promise', async () => {
  const {amb, audios, advance} = setup();
  let firstDone = false;
  amb.fadeTo(audios[0], 1, 1000).then(() => { firstDone = true; });
  amb.fadeTo(audios[0], 0, 100);
  await tick();
  assert.equal(firstDone, true);
  await advance(200);
  assert.equal(audios[0].volume, 0);
});

test('stop během načítání: zvuk se po načtení nespustí', async () => {
  const {amb, audios, advance} = setup();
  audios.forEach(a => { a.autoLoad = false; });
  const started = amb.play();
  const stopped = amb.stop();
  await advance(500); await stopped;
  audios[0].loaded();
  assert.equal(await started, false);
  await advance(100);
  assert.ok(audios.every(a => a.paused), 'oba decky stojí');
  assert.equal(amb.paused, true);
});

test('stop během čekání na play(): deck zůstane zticha', async () => {
  const {amb, audios, advance} = setup();
  audios[0].autoPlay = false;
  const started = amb.play();
  await tick(); await tick();
  assert.ok(audios[0].pendingPlay, 'play čeká');
  const stopped = amb.stop();
  audios[0].pendingPlay.start();
  assert.equal(await started, false);
  await advance(500); await stopped;
  assert.ok(audios.every(a => a.paused && a.volume === 0));
});

test('stop během prolnutí: nic nevisí a další prolnutí znovu proběhne', async () => {
  const {amb, audios, advance} = setup();
  assert.equal(await amb.play(), true);
  await advance(1000);
  audios[1].autoPlay = false;
  audios[0].currentTime = 57; audios[0].emit('timeupdate');
  await tick(); await tick();
  assert.equal(amb.crossfading, true);
  assert.ok(audios[1].pendingPlay, 'druhý deck čeká na play');
  const stopped = amb.stop();
  audios[1].pendingPlay?.start();
  await advance(500); await stopped;
  assert.equal(amb.crossfading, false, 'příznak prolnutí se uvolnil');
  assert.ok(audios.every(a => a.paused && a.volume === 0), 'po stopu oba decky zticha');

  audios[1].autoPlay = true;
  assert.equal(await amb.play(), true);
  await advance(1000);
  const cur = audios.find(a => !a.paused);
  cur.currentTime = 57; cur.emit('timeupdate');
  await advance(5000);
  assert.equal(amb.crossfading, false);
  assert.equal(audios.filter(a => !a.paused).length, 1, 'po prolnutí hraje jen jeden deck');
});

test('stop uprostřed běžícího fade prolnutí přeruší přechod', async () => {
  const {amb, audios, advance} = setup();
  await amb.play(); await advance(1000);
  audios[0].currentTime = 57; audios[0].emit('timeupdate');
  await advance(1000); // prolnutí běží (4 s)
  assert.equal(amb.crossfading, true);
  const stopped = amb.stop();
  await advance(500); await stopped;
  assert.equal(amb.crossfading, false);
  assert.ok(audios.every(a => a.paused && a.volume === 0));
});

test('rychlé přepínání play/stop/play skončí hraním jednoho decku', async () => {
  const {amb, audios, changes, advance} = setup();
  const a = amb.play(), b = amb.stop(), c = amb.play();
  const results = await Promise.all([a, c]); await advance(1000); await b;
  assert.deepEqual(results, [false, true]);
  assert.equal(amb.paused, false);
  assert.equal(changes.at(-1), true);
  assert.equal(audios.filter(x => !x.paused).length, 1);
  assert.ok(audios[0].volume > 0.5);
});

test('rychlé stop/play/stop skončí tichem', async () => {
  const {amb, audios, advance} = setup();
  await amb.play(); await advance(1000);
  const s1 = amb.stop(), p = amb.play(), s2 = amb.stop();
  await p; await advance(1000); await Promise.all([s1, s2]);
  assert.equal(amb.paused, true);
  assert.ok(audios.every(x => x.paused && x.volume === 0));
});

test('ruční přepnutí skladby prolne na další část a hraje jen jeden deck', async () => {
  const {amb, audios, advance} = setup();
  await amb.play(); await advance(1000);
  const before = audios.find(a => !a.paused).src;
  const done = amb.next(1500);
  await advance(2000); await done;
  const playing = audios.filter(a => !a.paused);
  assert.equal(playing.length, 1);
  assert.notEqual(playing[0].src, before);
  assert.equal(amb.crossfading, false);
});

test('přepnutí skladby při vypnutém zvuku nic nespustí', async () => {
  const {amb, audios, advance} = setup();
  await amb.next(1500); await advance(500);
  assert.ok(audios.every(a => a.paused));
});

test('bez ovladatelné hlasitosti (iPhone) se části nepřekrývají', async () => {
  class FixedVolumeAudio extends FakeAudio { get volume() { return 1; } set volume(v) {} }
  const audios = [];
  let t = 0, id = 0;
  const frames = new Map();
  const amb = createAmbient({
    createAudio: () => { const a = new FixedVolumeAudio(); audios.push(a); return a; },
    raf: f => { frames.set(++id, f); return id; }, caf: i => frames.delete(i), now: () => t, random: () => 0,
  });
  const run = async () => { for (let i = 0; i < 6; i++) { await tick(); t += 16; for (const [k, f] of [...frames]) { frames.delete(k); f(t); } } };
  await amb.play(); await run();
  const next = amb.next(); await run(); await next;
  assert.equal(audios.filter(a => !a.paused).length, 1);
});
