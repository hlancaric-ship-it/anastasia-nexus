// Orezanie fotografie do výrezu šablóny newslettera: posun ťahaním, zväčšenie a zmenšenie posuvníkom.
// Výsledok je JPEG v dvojnásobnom rozlíšení výrezu. Obrázok sa číta cez data: URL, lebo CSP adminu nepovoľuje blob:.

/** Výrezy podľa štýlu sekcie, rozmery v px ako v e-maili. */
export const CROP_SHAPES = {
  dark: { width: 340, height: 453, radius: '173px 173px 105px 0', fill: '#45475a', label: 'oblúk ako na webe' },
  light: { width: 480, height: 362, radius: '150px 150px 14px 14px', fill: '#f8f3ea', label: 'oblúk' },
  olive: { width: 480, height: 360, radius: '14px', fill: '#2f3427', label: 'obdĺžnik' },
};
export const cropShape = style => CROP_SHAPES[style] || CROP_SHAPES.light;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const OUT_SCALE = 2;

/** Načíta súbor ako data: URL. */
export const fileToDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Fotografiu sa nepodarilo načítať.'));
  reader.readAsDataURL(file);
});

const loadImage = (src, cors) => new Promise((resolve, reject) => {
  const img = new Image();
  if (cors) img.crossOrigin = 'anonymous';
  img.onload = () => (img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error('Fotografia je prázdna.')));
  img.onerror = () => reject(new Error('Fotografiu sa nepodarilo načítať.'));
  img.src = src;
});

/** Pozícia obrázka vo výreze: zoom 1 = obrázok práve vyplní výrez, posun v px výrezu od stredu. */
export function cropLayout(imgW, imgH, shape, zoom, dx, dy) {
  const cover = Math.max(shape.width / imgW, shape.height / imgH);
  const w = imgW * cover * zoom;
  const h = imgH * cover * zoom;
  // Pri zväčšení sa nedá posunúť za okraj fotografie, pri zmenšení ostane fotografia vo výreze.
  const limX = Math.abs(w - shape.width) / 2;
  const limY = Math.abs(h - shape.height) / 2;
  const x = Math.max(-limX, Math.min(limX, dx));
  const y = Math.max(-limY, Math.min(limY, dy));
  return { w, h, x, y, left: (shape.width - w) / 2 + x, top: (shape.height - h) / 2 + y };
}

/** Vykreslí výrez do JPEG. Vráti Blob, alebo vyhodí chybu (napr. cudzí obrázok bez CORS). */
export function renderCrop(img, shape, zoom, dx, dy) {
  const l = cropLayout(img.naturalWidth, img.naturalHeight, shape, zoom, dx, dy);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(shape.width * OUT_SCALE);
  canvas.height = Math.round(shape.height * OUT_SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Prehliadač nevie upraviť fotografiu.');
  ctx.fillStyle = shape.fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, l.left * OUT_SCALE, l.top * OUT_SCALE, l.w * OUT_SCALE, l.h * OUT_SCALE);
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Fotografiu sa nepodarilo uložiť.'))), 'image/jpeg', 0.86);
    } catch {
      reject(new Error('Túto fotografiu z Médií nie je možné orezať. Nahrajte ju z počítača.'));
    }
  });
}

/**
 * Otvorí okno na orezanie. src je data: URL alebo https adresa (Médiá musia povoliť CORS).
 * Vráti File (JPEG) alebo null pri zrušení.
 */
export async function cropPhoto(src, shape, { esc = s => String(s), name = 'newsletter-foto' } = {}) {
  const img = await loadImage(src, !/^data:/i.test(src));
  return new Promise((resolve, reject) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'mp pc';
    const scale = Math.min(1, 440 / shape.width, 460 / shape.height);
    const vw = Math.round(shape.width * scale), vh = Math.round(shape.height * scale);
    dlg.innerHTML = `<form method="dialog" class="mp-box"><header class="mp-head"><h2>Upraviť výrez fotografie</h2><button type="submit" value="" class="btn ghost sm" aria-label="Zavrieť">✕</button></header>
      <div class="pc-body">
        <div class="pc-stage" style="width:${vw}px;height:${vh}px;border-radius:${esc(shape.radius)};background:${esc(shape.fill)}" tabindex="0" aria-label="Výrez fotografie, posúvajte ťahaním alebo šípkami">
          <img class="pc-img" src="${esc(src)}" alt="" draggable="false">
        </div>
        <div class="pc-ctl">
          <label for="pc-zoom">Veľkosť fotografie</label>
          <input id="pc-zoom" type="range" min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="0.01" value="1">
          <p class="muted">Fotografiu posuňte ťahaním myšou alebo prstom, šípkami na klávesnici po malých krokoch. Výrez: ${esc(shape.label)}.</p>
          <button type="button" class="btn ghost sm pc-reset">Vycentrovať</button>
        </div>
      </div>
      <footer class="mp-foot"><span class="muted pc-err" role="alert"></span><div><button type="submit" value="" class="btn ghost">Zrušiť</button> <button type="button" class="btn gold pc-ok">Použiť výrez</button></div></footer></form>`;
    document.body.appendChild(dlg);
    const stage = dlg.querySelector('.pc-stage'), view = dlg.querySelector('.pc-img'), zoomEl = dlg.querySelector('#pc-zoom');
    const ok = dlg.querySelector('.pc-ok'), err = dlg.querySelector('.pc-err');
    let zoom = 1, dx = 0, dy = 0, done = false;
    const draw = () => {
      const l = cropLayout(img.naturalWidth, img.naturalHeight, shape, zoom, dx, dy);
      dx = l.x; dy = l.y;
      view.style.cssText = `position:absolute;left:${l.left * scale}px;top:${l.top * scale}px;width:${l.w * scale}px;height:${l.h * scale}px;max-width:none;user-select:none;pointer-events:none`;
    };
    let drag = null;
    stage.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, dx, dy }; stage.setPointerCapture(e.pointerId); };
    stage.onpointermove = e => { if (!drag) return; dx = drag.dx + (e.clientX - drag.x) / scale; dy = drag.dy + (e.clientY - drag.y) / scale; draw(); };
    stage.onpointerup = stage.onpointercancel = () => { drag = null; };
    stage.onwheel = e => { e.preventDefault(); zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (e.deltaY < 0 ? 1.05 : 1 / 1.05))); zoomEl.value = String(zoom); draw(); };
    stage.onkeydown = e => {
      const step = e.shiftKey ? 40 : 8;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!move) return;
      e.preventDefault(); dx += move[0]; dy += move[1]; draw();
    };
    zoomEl.oninput = () => { zoom = Number(zoomEl.value) || 1; draw(); };
    dlg.querySelector('.pc-reset').onclick = () => { zoom = 1; dx = 0; dy = 0; zoomEl.value = '1'; draw(); };
    ok.onclick = async () => {
      ok.disabled = true; err.textContent = '';
      try {
        const blob = await renderCrop(img, shape, zoom, dx, dy);
        done = true;
        dlg.close('ok');
        resolve(new File([blob], `${name}.jpg`, { type: 'image/jpeg' }));
      } catch (e) {
        ok.disabled = false; err.textContent = e.message;
      }
    };
    dlg.addEventListener('close', () => { dlg.remove(); if (!done) resolve(null); });
    try { draw(); dlg.showModal(); } catch (e) { dlg.remove(); reject(e); }
  });
}
