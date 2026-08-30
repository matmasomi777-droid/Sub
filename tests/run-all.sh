#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
#  Local verification suite for worker.js — no Cloudflare account needed.
#
#    sh tests/run-all.sh
#
#  How it works: build.mjs copies ../worker.js into tests/worker.test.mjs,
#  swaps the `cloudflare:sockets` import for a stub and re-exports the internal
#  functions under test. The D1 binding is a real SQLite database
#  (node:sqlite), so UPSERT/sweep semantics match production; KV and the
#  Durable Object limiter are small in-process fakes.
#  Requires Node >= 22.5 (node:sqlite).
# ═══════════════════════════════════════════════════════════════════════════
set -u
cd "$(dirname "$0")" || exit 1
ROOT="$(cd .. && pwd)"

node build.mjs "$ROOT/worker.js" >/dev/null || exit 1

fail=0
for t in t1-counting t2-e2e t3-iplimit t4-api t6-d1-tunnel t7-traffic-api t8-health-diag t9-leak t10-tunnel-leak t11-ttl-evict t12-ui-security t13-disguise t14-v3-backend t15-vless-exits t16-v3-ui t17-v3-ui-stage4 t18-v3-revision; do
  printf '\n════════ %s ════════\n' "$t"
  out=$(node "$t.mjs" 2>&1 | grep -v ExperimentalWarning | grep -v 'trace-warnings')
  printf '%s\n' "$out"
  printf '%s\n' "$out" | grep -q 'FAIL' && fail=$((fail + 1))
done

printf '\n════════════════════════════════\n'
if [ "$fail" -eq 0 ]; then echo 'ALL SUITES PASSED'; else echo "$fail SUITE(S) FAILED"; fi
exit "$fail"
