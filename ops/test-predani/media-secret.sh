#!/usr/bin/env bash
# Test: MEDIA_TOKEN_SECRET pro anastasia-test-protected-media (shodný s backendem) z backend/data-private/test-predani/secrets.env.
# Hodnota jde do wrangleru jen přes stdin, nikam se nevypisuje.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SECRETS="$ROOT/backend/data-private/test-predani/secrets.env"
[ -r "$SECRETS" ] || { echo "STOP: chybí $SECRETS" >&2; exit 1; }

v="$(grep -E '^MEDIA_TOKEN_SECRET=' "$SECRETS" | head -1 | cut -d= -f2-)"
[ "${#v}" -ge 32 ] || { echo "STOP: MEDIA_TOKEN_SECRET chybí nebo je kratší než 32 znaků" >&2; exit 1; }

printf '%s' "$v" | "$ROOT/nexus/node_modules/.bin/wrangler" secret put MEDIA_TOKEN_SECRET -c "$HERE/media.wrangler.jsonc"
echo "MEDIA_SECRET_OK (anastasia-test-protected-media)"
