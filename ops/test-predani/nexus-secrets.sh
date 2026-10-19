#!/usr/bin/env bash
# Testovací předání: secrety pro Worker nexus-api-anastasia-test z backend/data-private/test-predani/secrets.env.
#   ./nexus-secrets.sh https://<projekt>.medusajs.app
# Hodnoty se posílají jen do wrangleru přes stdin (dočasný soubor 0600, po běhu smazán), nikam se nevypisují.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SECRETS="$ROOT/backend/data-private/test-predani/secrets.env"
API="${1:-}"

[[ "$API" =~ ^https://[a-z0-9.-]+$ ]] || { echo "STOP: zadej https origin backendu (Medusa Cloud)" >&2; exit 1; }
[[ "$API" == *anastasiaoz* ]] && { echo "STOP: test nesmí používat doménu Lucie" >&2; exit 1; }
[ -r "$SECRETS" ] || { echo "STOP: chybí $SECRETS" >&2; exit 1; }

get() { local v; v="$(grep -E "^$1=" "$SECRETS" | head -1 | cut -d= -f2-)"; [ -n "$v" ] || { echo "STOP: v secrets.env chybí $1" >&2; exit 1; }; printf '%s' "$v"; }

TMP="$(mktemp)"; chmod 600 "$TMP"; trap 'rm -f "$TMP"' EXIT
node -e '
const [file, api, ...pairs] = process.argv.slice(1)
const o = {}
for (let i = 0; i < pairs.length; i += 2) o[pairs[i]] = pairs[i + 1]
o.MEDUSA_BOOKING_SYNC_URL = api + "/hooks/nexus/booking-order"
o.OPS_INGEST_URL = api + "/hooks/ops/edge-events"
o.OPS_INGEST_TENANT_ID = "anastasia"
o.MEDUSA_PRICING_TENANT_ID = "anastasia"
// Na test stejně jako na launch: věrnostní úrovně prázdné, procenta si zvolí Lucia sama.
o.MEDUSA_PRICING_POLICY_JSON = JSON.stringify({ loyaltyTiers: {}, brandLimits: {}, categoryLimits: {}, brandSaleDiscounts: {} })
require("fs").writeFileSync(file, JSON.stringify(o), { mode: 0o600 })
' "$TMP" "$API" \
  HMAC_SECRET "$(get NEXUS_HMAC_SECRET)" \
  MEDUSA_PRICING_API_KEY "$(get NEXUS_PRICING_API_KEY)" \
  MEDUSA_WEBHOOK_SECRET "$(get NEXUS_MEDUSA_WEBHOOK_SECRET)" \
  MEDUSA_BOOKING_SYNC_SECRET "$(get NEXUS_BOOKING_SYNC_SECRET)" \
  OPS_INGEST_SECRET "$(get OPS_INGEST_SECRET)" \
  MEDIA_TOKEN_SECRET "$(get MEDIA_TOKEN_SECRET)"

cd "$ROOT/nexus"
./node_modules/.bin/wrangler secret bulk "$TMP" --env anastasia-test
echo "NEXUS_SECRETS_OK (nexus-api-anastasia-test)"
