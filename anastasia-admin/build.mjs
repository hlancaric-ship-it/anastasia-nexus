// Produkčný build vlastného adminu pre Cloudflare Pages:
//   ANASTASIA_API_ORIGIN=https://api.… [ANASTASIA_MEDIA_ORIGIN=https://media.…] node build.mjs
// Výstup dist/: statické súbory, adresa jadra v <meta name="ana-api"> a _headers (CSP, noindex, bez rámcov).
import { mkdir, readFile, writeFile, copyFile, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'dist');
const origin = (name, required) => {
  const v = (process.env[name] || '').trim().replace(/\/+$/, '');
  if (!v) { if (required) throw new Error(`Chýba ${name} (https origin jadra Medusa).`); return ''; }
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(v)) throw new Error(`${name} musí byť https origin bez cesty.`);
  return v;
};
const api = origin('ANASTASIA_API_ORIGIN', true);
const media = origin('ANASTASIA_MEDIA_ORIGIN', false);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of ['app.mjs', 'guide.mjs', 'library-editor.mjs', 'qr.mjs', 'qr-encode.mjs', 'print.mjs', 'voucher.mjs', 'content.mjs', 'media-rules.mjs', 'security.mjs', 'styles.css', 'reference.css', 'logo-mark.png'])await copyFile(join(root, f), join(out, f));
await cp(join(root, 'assets'), join(out, 'assets'), { recursive: true });
const html = await readFile(join(root, 'index.html'), 'utf8');
if (!html.includes('<meta name="robots"')) throw new Error('index.html: chýba meta robots');
await writeFile(join(out, 'index.html'), html.replace('<meta name="robots"', `<meta name="ana-api" content="${api}">\n<meta name="robots"`));
await writeFile(join(out, '_headers'), `/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-cache
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Strict-Transport-Security: max-age=31536000
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: ${api}${media ? ' ' + media : ''}; connect-src 'self' ${api}; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
`);
await writeFile(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(`Admin build: dist/ → jadro ${api}${media ? `, médiá ${media}` : ''}`);
