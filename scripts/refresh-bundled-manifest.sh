#!/usr/bin/env bash
# refresh-bundled-manifest.sh
#
# Refreshes src/bundled/manifest.json from the live gallery. Run this
# before cutting a release so the npm package ships with a current
# snapshot. Safe to re-run; output is deterministic.
#
# Usage: bash scripts/refresh-bundled-manifest.sh

set -euo pipefail
cd "$(dirname "$0")/.."

URL="https://dam.usefulto.me/manifest.json"
DEST="src/bundled/manifest.json"
TMP="$DEST.tmp"

echo "Fetching $URL"
curl -fsSL --max-time 10 "$URL" -o "$TMP"

# Sanity check: must be valid JSON with a brands array.
python3 -c "
import json, sys
with open('$TMP') as f:
    data = json.load(f)
assert 'brands' in data and isinstance(data['brands'], list), 'brands[] missing'
assert len(data['brands']) >= 1, 'brands[] is empty'
print(f\"OK: {len(data['brands'])} brands, lastUpdated={data.get('lastUpdated','?')}\")
"

mv "$TMP" "$DEST"
echo "Wrote $DEST"
