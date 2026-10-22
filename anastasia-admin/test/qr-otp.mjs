// Regresný test QR generátora pre dvojfaktorové overenie (TOTP).
// Mriežka musí byť presne rovnaká ako pri referenčnej implementácii (bajtový režim,
// úroveň korekcie M) – kontroluje sa rozmer, počet tmavých modulov a odtlačok mriežky.
// Spustenie: node anastasia-admin/test/qr-otp.mjs
import { createHash } from 'node:crypto';
import { qrSvg } from '../qr-encode.mjs';

let checks = 0;
const assert = (ok, msg) => { if (!ok) throw new Error(msg); checks++; };

// [odkaz, rozmer mriežky (vrátane tichého okraja 4), počet tmavých modulov, odtlačok mriežky]
const CASES = [
  ['otpauth://totp/ANASTASIA:lucia@anastasia.sk?secret=JBSWY3DPEHPK3PXP&issuer=ANASTASIA', 45, 670, '6a44021cbb6cb5821ec1969dc7a271dd'],
  ['otpauth://totp/ANASTASIA:ceo@l-code-dynamics.com?secret=GEZDGNBVGY3TQOJQ&issuer=ANASTASIA', 49, 867, '9b2c9639a8d659151bdc6b2c78387aa7'],
];

for (const [url, dim, dark, sha] of CASES) {
  const svg = qrSvg(url, { size: 220 });
  assert(!!svg, `QR sa nepodarilo vygenerovať: ${url}`);
  const path = svg.match(/ d="([^"]*)"/)[1];
  const size = Number(svg.match(/viewBox="0 0 (\d+) (\d+)"/)[1]);
  assert(size === dim, `rozmer QR nesúhlasí: ${size} ≠ ${dim}`);
  assert((path.match(/h1v1h-1z/g) || []).length === dark, 'počet tmavých modulov nesúhlasí');
  assert(createHash('sha256').update(path).digest('hex').slice(0, 32) === sha, 'mriežka QR sa zmenila (odtlačok nesúhlasí)');
  assert(svg.includes('width="220"') && svg.includes('height="220"'), 'QR nemá nastavenú veľkosť');
  assert(svg.includes('role="img"') && svg.includes('aria-label='), 'QR nemá prístupný popis');
  assert(svg.includes('<rect width='), 'QR nemá biely podklad');
}

// Príliš dlhý odkaz sa nesmie vykresliť poškodený – radšej nič.
assert(qrSvg('x'.repeat(4000), { size: 220 }) === null, 'príliš dlhý text by sa mal odmietnuť');
// Krátky text prejde.
assert(!!qrSvg('A', { size: 220 }), 'krátky text sa nevykreslil');

console.log(JSON.stringify({ checks, status: 'PASS' }));
