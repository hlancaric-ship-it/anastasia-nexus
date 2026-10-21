// Boot: odložené CSS, runtime aplikácie a pohybové knižnice sa načítajú až po prvom vykreslení.
//
// Pôvodne to boli klasické <script defer> – tie síce neblokujú parser, ale zdržujú
// DOMContentLoaded (a tým aj LCP). Teraz je kritické CSS inline v hlavičke, zvyšok
// CSS sa prepne na „all“ a GSAP/ScrollTrigger/Lenis + motion.mjs sa ťahajú až pri
// prvej interakcii (na mobile pri ťuknutí na „Vstúpte“).
const enableLateCss = () => {
  document.querySelectorAll('link[data-late]').forEach((link) => { link.media = 'all'; });
};

const loadScripts = (sources) => Promise.all(sources.map((src) => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = src;
  script.onload = resolve;
  script.onerror = reject;
  document.head.appendChild(script);
})));

let motionPromise = null;
let motionReady = false;

const loadMotion = async () => {
  if (!motionPromise) {
    motionPromise = (async () => {
      try {
        await loadScripts(['/vendor/lenis.min.js', '/vendor/gsap.min.js', '/vendor/ScrollTrigger.min.js']);
        await import('/motion.mjs');
        motionReady = true;
      } catch (error) {
        // Bez pohybu ostáva stránka čitateľná (bez JS je všetko statické).
        console.warn('Pohyb sa nepodarilo načítať.', error);
      }
    })();
  }
  return motionPromise;
};

// Ťuknutie na „Vstúpte“ pred načítaním pohybu: počkáme na motion.mjs a klik zopakujeme.
const wireIntroCue = () => {
  const cue = document.getElementById('lh-scroll-cue');
  if (!cue) return;
  cue.addEventListener('click', (event) => {
    if (motionReady) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loadMotion().then(() => { if (motionReady) cue.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }, { capture: true });
};

// Pohyb (GSAP + motion.mjs) sa ťahá až po vykreslení prvej obrazovky – neblokuje
// parser ani DOMContentLoaded. Na mobile sa dá urýchliť ťuknutím na „Vstúpte“.
const wireMotionTrigger = () => {
  const trigger = () => loadMotion();
  // Na mobile sa pohyb načíta pri prvej interakcii (ťuknutie na „Vstúpte“).
  // Na deskte sa ťahá po vykreslení, lebo škrob úvodu treba hneď.
  // Pohyb sa ťahá po vykreslení prvej obrazovky; na mobile sa dá urýchliť ťuknutím na „Vstúpte“.
  setTimeout(trigger, 400);
  ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach((type) => {
    window.addEventListener(type, trigger, { once: true, passive: true });
  });
};

const start = () => {
  enableLateCss();
  wireIntroCue();
  wireMotionTrigger();
  // Runtime aplikácie (košík, menu, i18n) sa načíta až po vykreslení – neblokuje DOMContentLoaded.
  import('/app.mjs').catch((error) => { console.warn('Aplikácia sa nepodarilo načítať.', error); });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
