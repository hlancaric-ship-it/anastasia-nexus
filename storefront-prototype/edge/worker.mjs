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
    return new Response(patched, {status: response.status, headers});
  },
};
