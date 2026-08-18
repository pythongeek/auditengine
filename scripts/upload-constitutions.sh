#!/usr/bin/env bash
# Uploads agent constitutions and SYSTEM_SPEC.md to the R2 bucket so agents
# can load them at boot (agents read `constitutions/<type>.md` and
# `SYSTEM_SPEC.md` from R2). Safe to re-run.
set -euo pipefail

BUCKET="${R2_BUCKET:-auditengine-r2}"
REMOTE="${WRANGLER_REMOTE:---remote}"

cd "$(dirname "$0")/.."

for f in src/constitutions/*.md; do
  name="$(basename "$f")"
  echo "Uploading constitutions/$name"
  npx wrangler r2 object put "$BUCKET/constitutions/$name" --file "$f" $REMOTE
done

if [ -f SYSTEM_SPEC.md ]; then
  echo "Uploading SYSTEM_SPEC.md"
  npx wrangler r2 object put "$BUCKET/SYSTEM_SPEC.md" --file SYSTEM_SPEC.md $REMOTE
fi

echo "Done. Constitutions are live in bucket: $BUCKET"
