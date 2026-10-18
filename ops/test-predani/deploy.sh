#!/usr/bin/env bash
# Testovací předání ANASTASIA: build + kontrola + nasazení storefrontu a adminu na subdomény L-Code.
#   ./deploy.sh            build, kontroly, wrangler --dry-run (nic se nenasadí)
#   ./deploy.sh --deploy   totéž a pak skutečné nasazení (jen se souhlasem Luckyho)
#   ./deploy.sh --smoke    kontrola už nasazených adres (noindex, hlavičky, robots.txt)
# Vstup (veřejné hodnoty, ne secrety): ANASTASIA_API_ORIGIN, ANASTASIA_PUBLISHABLE_KEY, ANASTASIA_REGION_ID,
# ANASTASIA_STRIPE_PUBLISHABLE_KEY (jen pk_test_), volitelně ANASTASIA_MEDIA_ORIGIN.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WRANGLER="$ROOT/nexus/node_modules/.bin/wrangler"
WEB_HOST="anastasia-test.l-code-dynamics.com"
ADMIN_HOST="anastasia-test-admin.l-code-dynamics.com"
MODE="${1:-}"

fail() { echo "STOP: $*" >&2; exit 1; }

smoke() {
  local ok=1
  for url in "https://$WEB_HOST/" "https://$WEB_HOST/eshop/" "https://$ADMIN_HOST/"; do
    local headers
    headers="$(curl -sS -D - -o /dev/null --max-time 20 "$url")" || { echo "FAIL $url nedostupné"; ok=0; continue; }
    grep -qi '^HTTP/[0-9.]* 200' <<<"$headers" || { echo "FAIL $url není 200"; ok=0; }
    grep -qi '^x-robots-tag: noindex' <<<"$headers" || { echo "FAIL $url chybí X-Robots-Tag noindex"; ok=0; }
    grep -qi '^content-security-policy:' <<<"$headers" || { echo "FAIL $url chybí CSP"; ok=0; }
  done
  for host in "$WEB_HOST" "$ADMIN_HOST"; do
    curl -sS --max-time 20 "https://$host/robots.txt" | grep -q '^Disallow: /$' || { echo "FAIL $host/robots.txt neblokuje indexaci"; ok=0; }
  done
  curl -sS --max-time 20 "https://$WEB_HOST/config.mjs" | grep -q "pk_live_" && { echo "FAIL storefront obsahuje live Stripe klíč"; ok=0; }
  [ "$ok" = 1 ] && echo "SMOKE_OK" || exit 1
}

if [ "$MODE" = "--smoke" ]; then smoke; exit 0; fi
[ -z "$MODE" ] || [ "$MODE" = "--deploy" ] || fail "neznámý parametr $MODE"

# --- Pojistky testovacího režimu ---
[ -z "${ANASTASIA_SITE_URL:-}" ] || fail "ANASTASIA_SITE_URL musí být prázdné (zapnulo by indexaci a canonical)"
: "${ANASTASIA_API_ORIGIN:?chybí ANASTASIA_API_ORIGIN (https URL Medusa Cloud)}"
: "${ANASTASIA_PUBLISHABLE_KEY:?chybí ANASTASIA_PUBLISHABLE_KEY}"
: "${ANASTASIA_REGION_ID:?chybí ANASTASIA_REGION_ID}"
: "${ANASTASIA_STRIPE_PUBLISHABLE_KEY:?chybí ANASTASIA_STRIPE_PUBLISHABLE_KEY}"
[[ "$ANASTASIA_STRIPE_PUBLISHABLE_KEY" == pk_test_* ]] || fail "Stripe musí být v testovacím režimu (pk_test_)"
[[ "$ANASTASIA_API_ORIGIN" =~ ^https://[a-z0-9.-]+$ ]] || fail "ANASTASIA_API_ORIGIN musí být https origin bez cesty"
for v in "$ANASTASIA_API_ORIGIN" "${ANASTASIA_MEDIA_ORIGIN:-}"; do
  [[ "$v" == *anastasiaoz* ]] && fail "testovací předání nesmí používat doménu Lucie ($v)"
done

# --- Build ---
export ANASTASIA_MEDIA_ORIGIN="${ANASTASIA_MEDIA_ORIGIN:-$ANASTASIA_API_ORIGIN}"
(cd "$ROOT/storefront-prototype" && rm -rf dist && node build.mjs)
(cd "$ROOT/anastasia-admin" && node build.mjs)

# --- Kontrola výstupu ---
WEB="$ROOT/storefront-prototype/dist"; ADMIN="$ROOT/anastasia-admin/dist"
grep -q 'name="robots" content="noindex,nofollow"' "$WEB/index.html" || fail "storefront index.html bez noindex"
grep -q '^Disallow: /$' "$WEB/robots.txt" || fail "storefront robots.txt neblokuje indexaci"
[ ! -e "$WEB/sitemap.xml" ] || fail "storefront má sitemap.xml"
grep -q 'X-Robots-Tag: noindex, nofollow' "$WEB/_headers" || fail "storefront _headers bez X-Robots-Tag"
grep -q 'X-Robots-Tag: noindex, nofollow' "$ADMIN/_headers" || fail "admin _headers bez X-Robots-Tag"
grep -q 'name="robots"' "$ADMIN/index.html" || fail "admin index.html bez meta robots"
grep -q '^Disallow: /$' "$ADMIN/robots.txt" || fail "admin robots.txt neblokuje indexaci"
if grep -rqs "pk_live_\|sk_live_\|sk_test_\|rk_live_" "$WEB" "$ADMIN"; then fail "build obsahuje live nebo tajný Stripe klíč"; fi
if grep -rqs "anastasiaoz\.eu/api\|nexus\.anastasiaoz" "$WEB/config.mjs" "$ADMIN/index.html"; then fail "build míří na doménu Lucie"; fi
grep -q "$ANASTASIA_API_ORIGIN" "$WEB/config.mjs" || fail "storefront config.mjs nemá API origin"
echo "BUILD_OK: storefront + admin → $ANASTASIA_API_ORIGIN (noindex, pk_test)"

# --- Nasazení ---
DRY="--dry-run"; [ "$MODE" = "--deploy" ] && DRY=""
"$WRANGLER" deploy -c "$HERE/web.wrangler.jsonc" $DRY
"$WRANGLER" deploy -c "$HERE/admin.wrangler.jsonc" $DRY
if [ -z "$DRY" ]; then
  echo "Nasazeno: https://$WEB_HOST  https://$ADMIN_HOST (certifikát může chvíli trvat)"
  echo "Kontrola: $0 --smoke"
else
  echo "DRY_RUN_OK: nic nenasazeno. Skutečné nasazení: $0 --deploy (jen se souhlasem)"
fi
