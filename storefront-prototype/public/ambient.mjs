// Ambient: skladba je rozsekaná na části (src(i)) s překryvem `xfade` sekund. Nová návštěva začne náhodnou částí,
// další části navazují s prolnutím a po poslední se pokračuje první. Pozice se drží v session úložišti (čas běží dál
// i mezi stránkami). Modul nesahá na DOM, takže jde testovat s fake Audio/RAF.
//
// Souběh: každé play()/stop() zvýší generaci. Vše, co čeká (načtení, play, prolnutí), po await ověří, že jeho generace
// je stále aktuální; jinak nic nezapne a skončí. Nahrazený fade svou Promise vždy dokončí, aby nic nevisí.
export function createAmbient({
  createAudio, raf, caf, now, random = Math.random, storage = null,
  parts = 10, xfade = 4, volume = 0.6, key = 'ana-ambient',
  src = i => `/media/ambient/${String(i + 1).padStart(2, '0')}.mp3`,
  onChange = () => {},
}) {
  const decks = [0, 1].map(() => Object.assign(createAudio(), {preload: 'none', volume: 0}));
  const fades = new Map();
  let state = null;
  try { state = JSON.parse(storage?.getItem(key) || 'null'); } catch {}
  let cur = 0, part = 0, started = false, paused = true, gen = 0, xfading = null, savedAt = 0;

  function fadeTo(el, target, ms) {
    const prev = fades.get(el);
    if (prev) { caf(prev.id); fades.delete(el); prev.done(); }
    return new Promise(done => {
      const from = el.volume, t0 = now(), entry = {id: 0, done};
      const step = t => {
        const k = ms > 0 ? Math.min(1, Math.max(0, (t - t0) / ms)) : 1;
        el.volume = Math.min(1, Math.max(0, from + (target - from) * k));
        if (k < 1) entry.id = raf(step);
        else { if (fades.get(el) === entry) fades.delete(el); done(); }
      };
      fades.set(el, entry);
      entry.id = raf(step);
    });
  }
  function save() {
    const el = decks[cur];
    if (!started || !Number.isFinite(el.currentTime)) return;
    try { storage?.setItem(key, JSON.stringify({part, pos: el.currentTime, at: Date.now()})); } catch {}
  }
  function load(el, i) {
    el.src = src(i); el.preload = 'auto';
    if (el.readyState >= 1) return Promise.resolve();
    return new Promise((ok, fail) => {
      const off = () => { el.removeEventListener('loadedmetadata', onOk); el.removeEventListener('error', onErr); };
      const onOk = () => { off(); ok(); }, onErr = () => { off(); fail(new Error('AMBIENT_LOAD')); };
      el.addEventListener('loadedmetadata', onOk); el.addEventListener('error', onErr);
    });
  }
  const silence = el => { const f = fades.get(el); if (f) { caf(f.id); fades.delete(el); f.done(); } el.volume = 0; el.pause(); };

  // Vrací true, když zvuk opravdu hraje; false, když ho mezitím přerušil stop() nebo novější play().
  async function play() {
    const g = ++gen;
    paused = false; xfading = null;
    const el = decks[cur];
    silence(decks[1 - cur]);
    try {
      if (!started) {
        let p = Math.floor(random() * parts), pos = 0;
        if (state && Number.isInteger(state.part) && state.part >= 0 && state.part < parts && Number.isFinite(state.pos)) {
          p = state.part; pos = state.pos + Math.max(0, (Date.now() - (state.at || Date.now())) / 1000);
        }
        await load(el, p);
        if (g !== gen) return false;
        // Čas strávený mimo web může přeskočit i celou část – posuneme se o odpovídající počet částí.
        const len = Math.max(1, el.duration - xfade);
        if (pos >= len) {
          p = (p + Math.floor(pos / len)) % parts; pos %= len;
          await load(el, p);
          if (g !== gen) return false;
        }
        part = p; el.currentTime = pos; started = true;
      }
      await el.play();
    } catch (error) {
      if (g !== gen) return false;
      paused = true; onChange(false);
      throw error;
    }
    if (g !== gen) { if (paused) silence(el); return false; }
    onChange(true); save(); fadeTo(el, volume, 900);
    return true;
  }
  async function stop() {
    const g = ++gen;
    paused = true; xfading = null;
    onChange(false); save();
    await Promise.all(decks.map(el => fadeTo(el, 0, 400)));
    if (g === gen) decks.forEach(silence);
  }
  // Přechod na další část: druhý deck naběhne z ticha, aktuální dozní. Ruční přepnutí volá kratší `ms`.
  async function next(ms = xfade * 1000) {
    if (paused || xfading === gen) return;
    const g = gen; xfading = g;
    const from = decks[cur], to = decks[1 - cur], n = (part + 1) % parts;
    try {
      await load(to, n);
      if (g !== gen) return;
      to.currentTime = 0; to.volume = 0;
      await to.play();
      if (g !== gen) { if (paused) silence(to); return; }
      cur = 1 - cur; part = n; save();
      await Promise.all([fadeTo(to, volume, ms), fadeTo(from, 0, ms)]);
      if (g !== gen) return;
      from.pause(); from.removeAttribute('src'); from.load();
    } catch {
      // Další část se nenačetla – aktuální přehrajeme znovu, ať zvuk nevypadne.
      if (g === gen) from.currentTime = 0;
    } finally {
      if (xfading === g) xfading = null;
    }
  }
  decks.forEach(el => {
    el.addEventListener('timeupdate', () => {
      if (el !== decks[cur]) return;
      if (Number.isFinite(el.duration) && el.currentTime >= el.duration - xfade) next();
      const t = Date.now(); if (t - savedAt > 2000) { savedAt = t; save(); }
    });
    el.addEventListener('ended', () => { if (el === decks[cur]) next(); });
  });
  return {play, stop, save, next, fadeTo, decks, get paused() { return paused; }, get crossfading() { return xfading !== null; }};
}
