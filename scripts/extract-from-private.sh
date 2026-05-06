#!/usr/bin/env bash
# Extracts the public-safe slice of the private repo into this repo.
# Re-runnable: re-running overwrites in place so you can iterate.
# Run from the public repo root.
#
# Usage:
#   ./scripts/extract-from-private.sh            # live run
#   DRY_RUN=1 ./scripts/extract-from-private.sh  # preview only
#   SRC=/other/path ./scripts/extract-from-private.sh

set -euo pipefail

SRC="${SRC:-/Users/James/Coding/blood-test-trend-tracker}"
DST="${DST:-$(pwd)}"
DRY_RUN="${DRY_RUN:-0}"

if [[ "$DST" == "$SRC" ]]; then
  echo "Refusing to run: SRC and DST are the same path." >&2
  exit 1
fi

if [[ ! -d "$SRC" ]]; then
  echo "Source repo not found at $SRC" >&2
  exit 1
fi

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY: $*"
  else
    eval "$*"
  fi
}

# ---------------------------------------------------------------------------
# 1. Whitelisted directory copies
# ---------------------------------------------------------------------------
echo "==> Copying whitelisted paths"

RSYNC="rsync -a --delete"
EXCLUDE_APP="--exclude=node_modules --exclude=dist --exclude=*.tsbuildinfo"
EXCLUDE_WORKER="--exclude=node_modules --exclude=*.tsbuildinfo --exclude=.dev.vars --exclude=.wrangler"

run "$RSYNC $EXCLUDE_APP \"$SRC/app/\" \"$DST/app/\""
run "$RSYNC $EXCLUDE_WORKER \"$SRC/worker/\" \"$DST/worker/\""
run "mkdir -p \"$DST/.github/workflows\""
run "cp \"$SRC/.github/workflows/deploy-v2.yml\" \"$DST/.github/workflows/deploy-v2.yml\""
run "cp \"$SRC/.github/workflows/pr-tests.yml\" \"$DST/.github/workflows/pr-tests.yml\""
run "cp \"$SRC/.github/workflows/backup-v2.yml\" \"$DST/.github/workflows/backup-v2.yml\""

# ---------------------------------------------------------------------------
# 2. Whitelisted root files
# ---------------------------------------------------------------------------
echo "==> Copying root files"

run "cp \"$SRC/package.json\" \"$DST/package.json\""
run "cp \"$SRC/package-lock.json\" \"$DST/package-lock.json\""
run "cp \"$SRC/tsconfig.base.json\" \"$DST/tsconfig.base.json\""

# Strip private repo URL from root package.json
if [[ "$DRY_RUN" != "1" ]] && command -v node &>/dev/null; then
  node -e "
    const fs = require('fs');
    const p = '$DST/package.json';
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    delete pkg.repository;
    delete pkg.bugs;
    delete pkg.homepage;
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
  "
fi

# Remove migration-related scripts from worker/package.json
if [[ "$DRY_RUN" != "1" ]] && command -v node &>/dev/null; then
  node -e "
    const fs = require('fs');
    const p = '$DST/worker/package.json';
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (pkg.scripts) {
      delete pkg.scripts.migrate;
      delete pkg['migrate:dry'];
      delete pkg.scripts['migrate:dry'];
    }
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
  "
fi

# ---------------------------------------------------------------------------
# 3. Scrub worker/wrangler.toml
# ---------------------------------------------------------------------------
echo "==> Scrubbing worker/wrangler.toml"

WRANGLER="$DST/worker/wrangler.toml"
run "sed -i '' 's/0254e2cda11afb714fedc4adf109a678/<YOUR_CLOUDFLARE_ACCOUNT_ID>/g' \"$WRANGLER\""
run "sed -i '' 's/0ddcc3e8-114d-4cf3-a22e-07902eb19e1e/<YOUR_STAGING_D1_DATABASE_ID>/g' \"$WRANGLER\""
run "sed -i '' 's/53913a7f-455b-41b1-9669-18e236759099/<YOUR_PRODUCTION_D1_DATABASE_ID>/g' \"$WRANGLER\""

# Prepend setup header comment (idempotent — only adds if not already present)
HEADER='# ============================================================================\n# Setup required: replace three placeholders before deploying\n#   <YOUR_CLOUDFLARE_ACCOUNT_ID>     — found in Workers & Pages right sidebar\n#   <YOUR_STAGING_D1_DATABASE_ID>    — printed by: wrangler d1 create family-health-dashboard-db-staging\n#   <YOUR_PRODUCTION_D1_DATABASE_ID> — printed by: wrangler d1 create family-health-dashboard-db\n# See docs/SETUP.md for the full walkthrough.\n# ============================================================================\n\n'
if [[ "$DRY_RUN" != "1" ]] && ! grep -q "Setup required" "$WRANGLER"; then
  printf "%b" "$HEADER" | cat - "$WRANGLER" > /tmp/wrangler_patched.toml && mv /tmp/wrangler_patched.toml "$WRANGLER"
fi

# Fix R2 bucket name inconsistency in backup-v2.yml
BACKUP_YML="$DST/.github/workflows/backup-v2.yml"
run "sed -i '' 's/family-health-dashboard-docs/family-health-dashboard-files/g' \"$BACKUP_YML\""

# ---------------------------------------------------------------------------
# 4. Patient-name scrubs (belt-and-braces)
# ---------------------------------------------------------------------------
echo "==> Scrubbing patient references"

SCRUB_FILES_ARGS=(-type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.md' -o -name '*.yml' -o -name '*.yaml' -o -name '*.json' -o -name '*.html' \) -not -path '*/node_modules/*' -not -name 'package-lock.json')

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY: would scrub patient references in all ts/tsx/md/yml/json/html files under $DST"
else
  find "$DST" "${SCRUB_FILES_ARGS[@]}" -print0 | xargs -0 sed -i '' \
    -e 's/Sakkammal J/Demo Patient/g' \
    -e 's/Sakkamal J/Demo Patient/g' \
    -e 's/Sakkammal/Demo/g' \
    -e 's/Sakkamal/Demo/g' \
    -e 's/sakkammal-j/demo-patient/g' \
    -e 's/sakkammal/demo/g' \
    -e 's/sakkamal/demo/g' \
    -e 's/james@nfnlabs\.in/owner@example.com/g' \
    -e 's/alameda/Example Lab/g' \
    -e 's/As-Salam/Example Lab/g' \
    -e 's/alfa-labs/example-lab/g' \
    -e 's/alfa labs/Example Lab/g' \
    -e 's/Mom Blood Test/Example Blood Test Report/g' \
    -e 's/Mom As-Salam/Example Lab/g' || true
fi

# ---------------------------------------------------------------------------
# 5. Verification: banned-string sweep
# ---------------------------------------------------------------------------
echo "==> Running banned-string sweep"

BANNED='sakkam|0254e2cda11afb714fedc4adf109a678|0ddcc3e8-114d-4cf3-a22e-07902eb19e1e|53913a7f-455b-41b1-9669-18e236759099|bfa16fda-0935-46ab-9093-3f337f49d1b0|264f72b9-94f9-4061-9a49-d2affb6cabd5|6a49ed82-4ea0-4220-bc98-f5f2e3382a03|james@nfnlabs|AIzaSy[A-Za-z0-9_-]{30,}|sk-ant-api03-[A-Za-z0-9_-]{50,}|alameda|as-salam|alfa[ -]?labs|Mom Blood Test'

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY: would run banned-string sweep"
else
  if rg -i -e "$BANNED" \
     -g '!node_modules' \
     -g '!*.lock' \
     -g '!package-lock.json' \
     --ignore-file /dev/null \
     "$DST" 2>/dev/null \
     | grep -v "scripts/extract-from-private.sh"; then
    echo "FAIL: banned strings found above" >&2
    exit 1
  fi
  echo "OK: no banned strings"
fi

echo ""
echo "Done."
