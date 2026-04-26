#!/usr/bin/env bash
# phase2-smoke.sh
#
# Boots the compiled MCP server, issues one call per phase-2 tool (the
# five phase-1 tools plus fetch_asset), prints summarized results.
# Useful before tagging a release or merging a branch.
#
# Usage: bun run phase2:smoke

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f dist/src/server.js ]; then
  echo "dist/ is missing; running bun run build first"
  bun run build
fi

REQFILE=$(mktemp)
trap 'rm -f "$REQFILE"' EXIT
cat >"$REQFILE" <<'JSON'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_brands","arguments":{}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_brand_colors","arguments":{"brand_id":"salesforce"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_color_roles","arguments":{"roles":["primary"]}}}
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"find_brand_logo","arguments":{"brand":"salesforce","preferred_only":true}}}
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"find_product_icon","arguments":{"query":"autonomous AI agent","limit":3}}}
{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"fetch_asset","arguments":{"id":"icon-agentforce","mode":"url"}}}
JSON

# timeout is not a macOS built-in; use perl (always present on macOS) as a portable fallback
if command -v timeout >/dev/null 2>&1; then
  OUTPUT=$(timeout 15 node bin/sf-logos-mcp <"$REQFILE" 2>/dev/null)
else
  OUTPUT=$(perl -e 'alarm 15; exec @ARGV' -- node bin/sf-logos-mcp <"$REQFILE" 2>/dev/null)
fi

pass=0; fail=0
check () {
  local id="$1" needle="$2"
  if printf "%s\n" "$OUTPUT" | grep -q "\"id\":$id" && printf "%s\n" "$OUTPUT" | grep -q "$needle"; then
    echo "OK:   id=$id contains $needle"
    pass=$((pass + 1))
  else
    echo "FAIL: id=$id missing $needle" >&2
    fail=$((fail + 1))
  fi
}
check 2 'tools'
check 3 'brands'
check 4 'colors'
check 5 'roles'
check 6 'logos'
check 7 'icon-agentforce'
check 8 'dam.usefulto.me'

echo "phase2 smoke: $pass pass / $fail fail"
exit "$fail"
