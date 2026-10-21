// Edge vrstva pro Cloudflare Workers: statické assety + země návštěvníka.
//
// Workers si zde stáhne statické assety (dist/) a předá je dál. Do HTML doplní
// `meta[name="ana-country"]`, podle kterého storefront vybírá jazyk, když
// návštěvník nemá uloženou ruční volbu a jeho prohlížeč neurčuje sk/cs ani ru/uk/be.
//
// Nasazení: `wrangler deploy` (viz wrangler.toml v kořeni repozitáře).
// Test lokálně: `node serve.mjs` a hlavička `CF-IPCountry: RU` nebo `?country=RU`.

export default {
  async fetch(request, env, ctx) {
    const url0 = new URL(request.url);
    if (url0.pathname.startsWith('/media/')) return media(request, env);
    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    const country = (request.cf && request.cf.country) || request.headers.get('CF-IPCountry') || '';
    const html = await response.text();
    const patched = html.replace(
      '<meta name="ana-country" content="">',
      `<meta name="ana-country" content="${String(country).toUpperCase()}">`,
    );
    const headers = new Headers(response.headers);
    headers.set('content-length', String(new TextEncoder().encode(patched).length));
    // Statické súbory s verziou (?v=…) a assety sú nemenné – dlhá cache.
    const url = new URL(request.url);
    const versioned = /\?v=/.test(url.search);
    if (/^\/assets\//.test(url.pathname) || versioned) {
      headers.set('cache-control', 'public, max-age=31536000, immutable');
    } else if (url.pathname.endsWith('.html') || url.pathname === '/') {
      headers.set('cache-control', 'public, max-age=0, must-revalidate');
    } else {
      headers.set('cache-control', 'public, max-age=86400');
    }
    return new Response(patched, {status: response.status, headers});
  },
};

// Videá a hudba: statické assety Cloudflare nevracajú 206 na hlavičku Range. iPhone (Safari) bez nej
// video vôbec nespustí a skok v ambiente (pokračovanie skladby na inej stránke) sa zasekne.
// Súbor sa preto načíta celý a vráti sa požadovaný rozsah bajtov.
async function media(request, env) {
  const range = request.headers.get('range');
  const plain = new Headers(request.headers);
  plain.delete('range');
  const response = await env.ASSETS.fetch(new Request(request.url, {method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers: plain}));
  const headers = new Headers(response.headers);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=86400');
  if (!response.ok || !range || request.method === 'HEAD') {
    return new Response(response.body, {status: response.status, headers});
  }
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start, end;
  if (m && m[1] !== '') { start = Number(m[1]); end = m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1; }
  else if (m && m[2] !== '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  if (start === undefined || start > end || start >= size) {
    headers.set('content-range', `bytes */${size}`);
    headers.delete('content-length');
    return new Response(null, {status: 416, headers});
  }
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), {status: 206, headers});
}
