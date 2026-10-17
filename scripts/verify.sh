#!/usr/bin/env bash
# Every check a push must pass, in the order that fails cheapest first (`pnpm verify`). Stops at the
# first failure and prints the end of its output; the whole log is in $VERIFY_LOG. Needs the local database up
# (CONTRIBUTING.md). It applies any pending migration to it first, as `pnpm db:migrate` would without rewriting
# db/schema.sql: the e2e servers run on that database, and a migration not applied there failed them as if the code
# were wrong.
#
# Usage: pnpm verify [base]   (base: what the push goes on top of; origin/main by default)
#
# Budget: the full sequence should take under 5 minutes on a warm machine; it warns past that.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 1
BASE=${1:-origin/main}
LOG=${VERIFY_LOG:-${TMPDIR:-/tmp}/backoffice-verify.log}
BUDGET_SECONDS=300

# Playwright's leftovers aren't ours to lint or format.
clean_e2e_output() { rm -rf e2e/test-results e2e/playwright-report; }

steps=(
  "scripts/check-migrations-append-only.sh $BASE"
  "scripts/check-deployables-released.sh $BASE"
  "pnpm exec dbmate --migrations-dir db/migrations --no-dump-schema up"
  "pnpm lint"
  "pnpm format:check"
  "pnpm build:check"
  "pnpm test"
  "pnpm test:db"
  "pnpm build"
  "helm dependency build helm-charts/backoffice >/dev/null && helm lint --strict helm-charts/backoffice --values helm-charts/backoffice/ci/example-values.yaml && node scripts/check-network-policies.mjs"
  "pnpm test:e2e"
)

: > "$LOG"
started=$(date +%s)
for step in "${steps[@]}"; do
  clean_e2e_output
  printf '%-55.55s' "$step" | tee -a "$LOG"
  echo >> "$LOG"
  step_started=$(date +%s)
  if ! bash -c "$step" >> "$LOG" 2>&1; then
    echo " FAILED after $(($(date +%s) - step_started))s" | tee -a "$LOG"
    echo "--- last lines of $LOG:"
    tail -40 "$LOG"
    exit 1
  fi
  echo " ok ($(($(date +%s) - step_started))s)" | tee -a "$LOG"
done
clean_e2e_output
total=$(($(date +%s) - started))
echo "All checks passed in ${total}s. Log: $LOG"
if [ "$total" -gt "$BUDGET_SECONDS" ]; then
  echo "Over the ${BUDGET_SECONDS}s budget: look at the slowest step above."
fi
