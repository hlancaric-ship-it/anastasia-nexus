// Regresná kontrola: backend odmieta image/svg+xml, preto sa SVG nesmie ponúknať
// v žiadnom výbere súborov ani v klientskej kontrole nahrávania v knižnici médií.
// Spustenie: node anastasia-admin/test/media-upload-accept.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'app.mjs'), 'utf8');

let checks = 0;
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
  checks += 1;
};

// 1) Atribút accept pri výbere súborov v knižnici médií nesmie obsahovať SVG.
const accept = source.match(/<input type="file" id="md-file" accept="([^"]+)"/);
assert(accept, 'Výber súborov v knižnici médií sa nenašiel.');
assert(!/svg/i.test(accept[1]), `Výber súborov v knižnici médií stále pýta SVG: ${accept[1]}`);

// 2) Klientská kontrola typu súboru nesmie prepustiť SVG.
const check = source.match(/const bad = chosen\.find\(f => !\/\^(image[^;]+?)\$\/\.test\(f\.type\)/);
assert(check, 'Kontrola typu nahrávaného súboru sa nenašla.');
assert(!/svg/i.test(check[1]), `Kontrola typu stále prepúšťa SVG: ${check[1]}`);

// 3) Chybová hláška nesmie ponúkať SVG.
const message = source.match(/povolené sú obrázky \(([^)]*)\)/);
assert(message, 'Chybová hláška k nahrávaniu obrázkov sa nenašla.');
assert(!/svg/i.test(message[1]), `Chybová hláška stále ponúka SVG: ${message[1]}`);

// 4) Nahrávanie obrázka k produktu (samostatný výber) tiež bez SVG.
const productUpload = source.match(/<input type="file" id="p-file" accept="([^"]+)"/);
assert(productUpload, 'Výber obrázka k produktu sa nenašiel.');
assert(!/svg/i.test(productUpload[1]), `Výber obrázka k produktu stále pýta SVG: ${productUpload[1]}`);

console.log(JSON.stringify({ checks, status: 'PASS' }));
