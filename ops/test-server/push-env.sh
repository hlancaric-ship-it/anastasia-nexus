#!/usr/bin/env bash
# Zloží backend.env pre neverejný test ANASTASIA z lokálnych tajomstiev, pošle ho na server
# (chmod 600) a spustí backend. Tajomstvá sa nikdy nevypisujú.
#   ops/test-server/push-env.sh ubuntu@HOST ~/.ssh/kluc.pem
set -euo pipefail
HOST=${1:?ssh cieľ, napr. ubuntu@34.238.150.125}
KEY=${2:?cesta k SSH kľúču}
PRIV=${PRIV:-$HOME/anastasia-nexus-claude-backend/backend/data-private}
SECRETS=${SECRETS:-$HOME/anastasia-nexus-claude-integration/backend/data-private/test-predani/secrets.env}
WEB=https://anastasia-test.l-code-dynamics.com
ADMIN=https://anastasia-test-admin.l-code-dynamics.com
API=https://anastasia-test-api.l-code-dynamics.com
NEXUS=https://anastasia-test-nexus.l-code-dynamics.com

for f in "$SECRETS" "$PRIV/stripe-test.env" "$PRIV/r2-anastasia-media.env" "$PRIV/zeptomail.token"; do
  [ -s "$f" ] || { echo "Chýba $f" >&2; exit 1; }
done
get() { grep -E "^$1=" "$2" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
SK=$(get STRIPE_API_KEY "$PRIV/stripe-test.env")
case "$SK" in sk_test_*|rk_test_*) ;; *) echo "STRIPE_API_KEY nie je testovací kľúč — zastavené." >&2; exit 1;; esac

# Webhook pre testovací backend: založí sa raz, tajomstvo sa uloží len lokálne (data-private).
WH_FILE="$PRIV/stripe-test-webhook.env"
if [ ! -s "$WH_FILE" ]; then
  RESP=$(curl -fsS https://api.stripe.com/v1/webhook_endpoints -u "$SK:" \
    -d url="$API/hooks/payment/stripe_stripe" \
    -d "enabled_events[]=payment_intent.succeeded" -d "enabled_events[]=payment_intent.payment_failed" \
    -d "enabled_events[]=payment_intent.amount_capturable_updated" -d "enabled_events[]=payment_intent.canceled" \
    -d description="ANASTASIA test (neverejny)")
  WHSEC=$(printf '%s' "$RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["secret"])')
  (umask 077; printf 'STRIPE_WEBHOOK_SECRET=%s\n' "$WHSEC" > "$WH_FILE")
fi

OUT=$(mktemp); trap 'rm -f "$OUT" "$OUT.pg" "$OUT.n"' EXIT; chmod 600 "$OUT"
{
  echo "NODE_ENV=production"
  echo "PAYMENTS_TEST_MODE=1"
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
  for k in JWT_SECRET COOKIE_SECRET NEXUS_PRICING_API_KEY NEXUS_BOOKING_SYNC_SECRET OPS_INGEST_SECRET MEDIA_TOKEN_SECRET; do echo "$k=$(get $k "$SECRETS")"; done
  echo "NEXUS_WEBHOOK_SECRET=$(get NEXUS_MEDUSA_WEBHOOK_SECRET "$SECRETS")"
  echo "STRIPE_API_KEY=$SK"
  echo "STRIPE_WEBHOOK_SECRET=$(get STRIPE_WEBHOOK_SECRET "$WH_FILE")"
  for k in S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_ENDPOINT S3_REGION S3_BUCKET; do echo "$k=$(get $k "$PRIV/r2-anastasia-media.env")"; done
  # Resend má prednosť pred ZeptoMailom, ak existuje data-private/resend.env (RESEND_API_KEY, RESEND_FROM_EMAIL).
  if [ -s "$PRIV/resend.env" ]; then
    echo "RESEND_API_KEY=$(get RESEND_API_KEY "$PRIV/resend.env")"
    echo "RESEND_FROM_EMAIL=$(get RESEND_FROM_EMAIL "$PRIV/resend.env")"
    echo "RESEND_FROM_NAME=ANASTASIA (test)"
    echo "RESEND_REPLY_TO=ceo@l-code-dynamics.com"
  fi
  echo "ZEPTOMAIL_API_KEY=$(tr -d '\n' < "$PRIV/zeptomail.token")"
  echo "ZEPTOMAIL_API_URL=https://cpaas.zoho.eu/v1.1/email"
  echo "ZEPTOMAIL_FROM_EMAIL=${ZEPTOMAIL_FROM_EMAIL:-noreply@anastasiaoz.eu}"
  echo "ZEPTOMAIL_FROM_NAME=ANASTASIA (test)"
  echo "ZEPTOMAIL_REPLY_TO=ceo@l-code-dynamics.com"
  echo "EMAIL_RECIPIENT_ALLOWLIST=@l-code-dynamics.com"
  echo "CONTACT_NOTIFY_EMAIL=ceo@l-code-dynamics.com"
  echo "CHAT_ADMIN_NOTIFY_EMAIL=ceo@l-code-dynamics.com"
  echo "STORE_CORS=$WEB"
  echo "ADMIN_CORS=$ADMIN"
  echo "AUTH_CORS=$WEB,$ADMIN"
  echo "BACKEND_PUBLIC_URL=$API"
  echo "MAGIC_LINK_BASE_URL=$WEB/prihlasenie/potvrdit"
  echo "ACCOUNT_URL=$WEB/ucet"
  echo "ACCOUNT_ORDERS_URL=$WEB/ucet#objednavky"
  echo "CHAT_STOREFRONT_URL=$WEB/ucet#chat"
  echo "CHAT_ADMIN_URL=$ADMIN/#/chat"
  echo "COUPON_LINK_STOREFRONT_ORIGIN=$WEB"
  # Adresa webu pre produktové feedy (URL produktov v /feeds/heureka.xml a /feeds/google.xml)
  echo "STOREFRONT_URL=$WEB"
  # Vytlačené QR kódy smerujú na pôvodnú doménu — import ich musí prijať.
  echo "COUPON_LINK_LEGACY_ORIGINS=https://anastasiaoz.eu,https://www.anastasiaoz.eu,http://anastasiaoz.eu,http://www.anastasiaoz.eu"
  echo "NEXUS_PRICING_URL=$NEXUS/api/nexus/pricing"
  echo "NEXUS_WEBHOOK_URL=$NEXUS/api/webhooks/medusa"
  echo "NEXUS_TENANT_ID=anastasia"
  echo "ACCOUNT_BOOKINGS_URL=$WEB/ucet#konzultacie"
  echo "GIFT_VOUCHER_DELIVERY=notification"
  echo "MEDIA_DELIVERY_BASE_URL=$NEXUS/api/media"
  # Verzie právnych textov na teste; pre ostré nasadenie ich schvaľuje vlastníčka textov.
  echo "LEGAL_TERMS_VERSION=vop-2026-10-test"
  echo "LEGAL_PRIVACY_VERSION=gdpr-2026-10-test"
  echo "NEWSLETTER_CONSENT_VERSION=newsletter-2026-10-test"
} > "$OUT"

if grep -E '^(JWT_SECRET|COOKIE_SECRET|STRIPE_WEBHOOK_SECRET|S3_SECRET_ACCESS_KEY|ZEPTOMAIL_API_KEY)=$' "$OUT" >/dev/null; then
  echo "Niektoré tajomstvo je prázdne — zastavené." >&2; exit 1
fi

# POSTGRES_PASSWORD sa pri opakovanom spustení nemení (inak by sa backend k DB nepripojil).
ssh -i "$KEY" "$HOST" 'test -s ~/anastasia-test/backend.env && grep "^POSTGRES_PASSWORD=" ~/anastasia-test/backend.env || true' > "$OUT.pg"
if [ -s "$OUT.pg" ]; then grep -v '^POSTGRES_PASSWORD=' "$OUT" > "$OUT.n"; cat "$OUT.pg" >> "$OUT.n"; cat "$OUT.n" > "$OUT"; fi

scp -q -i "$KEY" "$OUT" "$HOST:anastasia-test/backend.env.new"
ssh -i "$KEY" "$HOST" 'set -e; cd ~/anastasia-test; mv backend.env.new backend.env; chmod 600 backend.env
  install -m 600 backend.env src/ops/test-server/backend.env
  cd src && sudo docker compose -f ops/test-server/compose.yml --env-file ops/test-server/backend.env up -d >/dev/null
  echo "Backend spustený ($(wc -l < ~/anastasia-test/backend.env) premenných)."'
