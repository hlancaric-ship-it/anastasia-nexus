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
    if (url0.pathname.startsWith('/backend-media/static/')) return backendMedia(request, env, url0);
    // Stará adresa minerálního krému má velké M, statická stránka je malými písmeny (build na macOS nerozliší velikost).
    if (/^\/eshop\/produkt\/Mineralny-ochranny-krem-pre-citlivu-pokozku\/?$/.test(url0.pathname)) return Response.redirect(new URL('/eshop/produkt/mineralny-ochranny-krem-pre-citlivu-pokozku/' + url0.search, url0).toString(), 301);
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
    // HTML sa nesmie držať v cache prehliadača ani na hrane: po nasadení musí každý hneď vidieť novú verziu
    // (CSS/JS sú verzované cez ?v=…, takže samotné HTML ich načíta nanovo).
    headers.set('cache-control', 'no-cache, must-revalidate');
    return new Response(patched, {status: response.status, headers});
  },
};

// Obrázky nahraté v administrácii: storefront ich kvôli CSP (img-src 'self') načítava z vlastnej domény
// cez /backend-media/static/… a Worker ich preberá z /static/… backendu (API_ORIGIN). Len GET/HEAD a len
// jeden súbor bez podadresárov, takže sa cez proxy nedá dostať na iné cesty backendu.
async function backendMedia(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, {status: 405, headers: {allow: 'GET, HEAD'}});
  const name = url.pathname.slice('/backend-media/static/'.length);
  let decoded = '';
  try { decoded = decodeURIComponent(name); } catch { decoded = '/'; }
  const parts = decoded.split('/');
  if (!env.API_ORIGIN || !name || parts.some(part => !part || part === '.' || part === '..' || !/^[\p{L}\p{N} _.-]+$/u.test(part)) || !/\.(?:jpe?g|png|webp|avif|gif)$/i.test(parts.at(-1))) return new Response('Not found', {status: 404});
  try {
    const upstream = await fetch(new URL('/static/' + decoded, env.API_ORIGIN), {method: request.method, redirect: 'manual', cf: {cacheTtl: 86400, cacheEverything: true}});
    const headers = new Headers();
    for (const h of ['content-type', 'content-length', 'etag', 'last-modified']) { const v = upstream.headers.get(h); if (v) headers.set(h, v); }
    headers.set('cache-control', upstream.ok ? 'public, max-age=86400' : 'no-store');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(upstream.ok ? upstream.body : null, {status: upstream.ok ? 200 : upstream.status === 404 ? 404 : 502, headers});
  } catch {
    return new Response(null, {status: 502, headers: {'cache-control': 'no-store'}});
  }
}

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
