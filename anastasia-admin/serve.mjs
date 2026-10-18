// Jednoduchý statický server pro vlastní ANASTASIA admin.
//   node serve.mjs [port]   (výchozí 4178)
// Admin volá Medusa Admin API na http://localhost:9100 (přepíš přes localStorage 'ana_api').
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, sep } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 4178);
// Obrázky produktov idú z file providera jadra (lokálne /static) alebo z CDN/R2 (ANASTASIA_MEDIA_ORIGIN).
const media = (process.env.ANASTASIA_MEDIA_ORIGIN || '').trim();
if (media && !/^https:\/\/[^\s'";]+$/.test(media)) throw new Error('ANASTASIA_MEDIA_ORIGIN musí byť https origin');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
http.createServer(async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: http://localhost:9100 http://127.0.0.1:9100${media ? ' ' + media : ''}; connect-src 'self' http://localhost:9100 http://127.0.0.1:9100`);
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = resolve(root, '.' + p);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<h1>404</h1>'); }
}).listen(port, '127.0.0.1', () => console.log(`ANASTASIA admin: http://127.0.0.1:${port}`));
