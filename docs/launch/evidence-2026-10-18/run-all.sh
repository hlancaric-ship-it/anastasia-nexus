#!/bin/zsh
# Celá browser E2E sada sériově proti lokálnímu stacku (Medusa :9100, most Workeru :8787, storefront :4173, admin :4178).
# e2e-klub-renew sem nepatří: potřebuje server s posunutými hodinami a renew-now.ts (samostatný scénář).
cd /Users/lucky/.claude/jobs/223fc22a/tmp/launch
DB=(psql -h 127.0.0.1 -U lucky anastasia_launch_e2e -Atc)
HEAD=$(git -C /Users/lucky/anastasia-nexus-claude-integration rev-parse --short HEAD)
: "${E2E_ADMIN_PASSWORD:?nastavte heslo lokálního admina}"
export PK=$($DB "select token from api_key where title='ANASTASIA storefront'")
echo "HEAD $HEAD start $(date '+%F %T')" > run-all.log
run() { echo "=== $1 $(date '+%T')" >> run-all.log; node $1.mjs 2>&1 | grep -E "^(PASS|FAIL)" | cut -c1-260 >> run-all.log; }
for s in e2e-admin-product e2e-shop e2e-admin-order e2e-klub; do run $s; done
# Členstvo z práve dobehnutého e2e-klub (aktívne, obnova zapnutá) – admin mu obnovu zastaví.
export MBR=$($DB "select id from membership where status='active' and coalesce(snapshot->>'renew','true')<>'false' and deleted_at is null order by created_at desc limit 1")
for s in e2e-admin-klub-stop e2e-admin-booking-setup e2e-booking e2e-voucher; do run $s; done
# e2e-voucher poukaz vyčerpá; voucher-admin potrebuje aj aktívny (zneplatnenie).
echo "=== e2e-voucher (ONLY_ISSUE) $(date '+%T')" >> run-all.log
ONLY_ISSUE=1 node e2e-voucher.mjs 2>&1 | grep -E "^(PASS|FAIL)" | cut -c1-260 >> run-all.log
for s in e2e-voucher-admin e2e-admin-voucher-settings e2e-chat e2e-contact-newsletter e2e-home audit-sec; do run $s; done
echo "done $(date '+%F %T')" >> run-all.log
