#!/usr/bin/env bash
# check-pages-allowlist.sh
#
# Fails if site/ contains any file outside the explicit allowlist, or if
# anything outside site/ looks like it was meant to be served (index.html,
# manifest.json, etc., at the repo root).
#
# Run locally: bash scripts/check-pages-allowlist.sh
# Runs in CI  : .github/workflows/pages.yml (before upload-pages-artifact).
#
# The allowlist lives here, not in the workflow, so it can be invoked
# identically from a developer's shell.

set -euo pipefail

cd "$(dirname "$0")/.."

fail=0

# ---- 1. site/ must exist ---------------------------------------------------
if [ ! -d site ]; then
  echo "FAIL: site/ directory is missing" >&2
  exit 1
fi

# ---- 2. site/ allowlist ----------------------------------------------------
# Every file under site/ must match one of these patterns. Update the list
# deliberately when new public assets are introduced.
#
# NB: the patterns are BRE (basic regex) to stay portable across sed/grep.
allowed_pattern='^site/(\.nojekyll|CNAME|README\.md|llms\.txt|index\.html|manifest\.json|(Icons|Original|Slack|Mulesoft|Tableau|Informatica)/.*)$'

# List all tracked + untracked files under site/ (not just tracked), so
# accidental local debris also trips the check. Uses a while-read loop to
# stay compatible with bash 3.x on stock macOS.
file_count=0
while IFS= read -r f; do
  file_count=$((file_count + 1))
  if ! [[ "$f" =~ $allowed_pattern ]]; then
    echo "FAIL: disallowed file in site/: $f" >&2
    fail=1
  fi
done < <(find site -type f | sed 's#^\./##')

# ---- 3. repo root must not re-expose public files --------------------------
# If a contributor accidentally creates /index.html or /manifest.json at the
# repo root again, flag it — those are served by older Pages configs and we
# want a single source of truth.
for leak in index.html manifest.json llms.txt CNAME; do
  if [ -e "$leak" ]; then
    echo "FAIL: $leak exists at the repo root; it should live under site/" >&2
    fail=1
  fi
done

# ---- 4. sensitive-file guard ----------------------------------------------
# Refuse to proceed if anything that looks like a secret was accidentally
# placed inside site/. This is belt-and-braces — the allowlist above would
# already reject these, but an explicit error message is more useful.
for ext in env key pem p12 pfx; do
  if find site -type f -name "*.$ext" -print -quit | grep -q .; then
    echo "FAIL: site/ contains a file with sensitive extension .$ext" >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "OK: site/ allowlist check passed ($file_count files)"
