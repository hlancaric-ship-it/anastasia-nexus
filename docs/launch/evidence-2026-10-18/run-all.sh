#!/bin/zsh
cd /Users/lucky/.claude/jobs/223fc22a/tmp/launch
HEAD=$(git -C /Users/lucky/anastasia-nexus-claude-integration rev-parse --short HEAD)
echo "HEAD $HEAD start $(date '+%F %T')" > run-all.log
for s in e2e-admin-product e2e-shop e2e-admin-order e2e-klub e2e-klub-renew e2e-admin-klub-stop e2e-booking e2e-voucher e2e-voucher-admin e2e-chat e2e-home audit-sec; do
  echo "=== $s $(date '+%T')" >> run-all.log
  node $s.mjs 2>&1 | grep -E "^(PASS|FAIL)" | cut -c1-260 >> run-all.log
done
echo "done $(date '+%F %T')" >> run-all.log
