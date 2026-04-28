# Phase 3B — npm publish pipeline

**Date:** 2026-04-27
**Supersedes:** nothing. **Extends:** original design ([`2026-04-24-sf-logos-mcp-design.md`](2026-04-24-sf-logos-mcp-design.md)) §5.5 ("Release & distribution").
**Authoritative for:** getting `@usefulto/sf-logos-mcp` onto the npm registry from a clean tag, reproducibly and reviewably. The docs set (phase 3C), CI hardening (phase 3D), and advisory symmetry (phase 3E) are out of scope.

---

## TL;DR

Ship `@usefulto/sf-logos-mcp` to npm via a tag-triggered GitHub Actions workflow with OIDC-signed provenance. The workflow builds from a clean checkout, verifies the published tarball contents before uploading, and refuses to publish when the git tag does not match `package.json` version. A local `scripts/prepublish-check.sh` performs the same tarball audit so authors can catch problems before cutting a tag. No manual `npm publish` from developer machines.

## Motivation

The server has been green on `main` since phase 1 and now covers the full phase-2 + phase-3A tool surface. Real users cannot install it:

- No published tarball on the `@usefulto` scope.
- Primer advertises `npx -y @usefulto/sf-logos-mcp` as the client-install command, but that string 404s today.
- Every dog-food transcript so far has been against a local `bun run build` + `node bin/sf-logos-mcp` launch. Nothing on an end-user path has ever been exercised.

Beyond "we want users," a publish pipeline forces three checks we don't have today:

- **Tarball hygiene.** The `files` allowlist in `package.json` is untested. If `dist/` is missing or the bundled manifest path is wrong, the server can't boot after `npx` install — and we'd discover it from a user bug report.
- **Node-entry correctness.** `bin/sf-logos-mcp` is a shim. It must work when npm resolves it, the MCP SDK runs under it, and the bundled manifest JSON is read from the installed location (not the repo). This path has never been touched by CI.
- **Release discipline.** No CHANGELOG, no tags. Versioning intent is invisible outside git log.

## Non-goals

- **No public beta tag strategy.** `next` / `beta` dist-tags are deferred. v0.x releases publish to `latest`; callers who want to pin take the version.
- **No automated semver bumping.** A human edits `package.json` version in a PR. No `standard-version`, no `release-please`, no Changesets (yet — revisit at v1.0 if churn warrants it).
- **No mirror to GitHub Packages.** npm only.
- **No 2FA-bypassed publishing from a laptop.** Humans publishing from laptops is forbidden by this spec. See decision Q1.
- **No pre-publish typecheck / lint / test loop inside the publish workflow.** Those run in the PR CI (phase 3D) and a publish tag should never trigger on a broken `main`. The publish workflow re-runs the gate as a defense-in-depth check but is not the primary gate.
- **No post-publish smoke that talks to the real `dam.usefulto.me`.** Out-of-process integration is phase-3D territory if we add it; this spec keeps the release path closed-loop.

## Design decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Who publishes? | GitHub Actions only, via OIDC trusted publisher. No npm tokens in the repo. No `npm publish` from laptops. |
| Q2 | How is publish triggered? | A pushed annotated tag matching `v<semver>` on `main`. No `workflow_dispatch` fallback for v0.x — less surface, less footgun. |
| Q3 | Version source of truth | `package.json` `"version"`. Tag must match exactly or the job fails before uploading. |
| Q4 | Tarball verification | Pre-publish: `npm pack --dry-run --json` output is checked against an allowlist + denylist before the real publish. |
| Q5 | Provenance | npm provenance via `npm publish --provenance`. Requires `id-token: write` in the workflow. |
| Q6 | Access scope | `public` (the package is free). Explicitly passed as `--access public` because the `@usefulto` scope defaults to restricted. |
| Q7 | Dist-tag | `latest` only for v0.x. When v1.x lands, reconsider a `next` strategy (separate spec). |
| Q8 | CHANGELOG format | Keep-a-Changelog. `[Unreleased]` section is mandatory; release cut moves its contents under a dated version header. |
| Q9 | README / LICENSE requirement | `README.md` and `LICENSE` are required in the tarball. Publishing fails without them. (Stub README is acceptable for v0.1.0; phase 3C writes the real one.) |
| Q10 | `prepublishOnly` build | Yes. `package.json` has `"prepublishOnly": "bun run build"` so even a manual `npm publish` can't ship stale `dist/`. In CI the explicit `bun run build` step runs first anyway. |

## Acceptance criteria

1. `git tag -a v0.1.0 -m "..." && git push --tags` triggers a publish workflow on GitHub Actions.
2. The workflow fails if the tag's name doesn't match `package.json` "version".
3. The workflow fails if the tarball contains any file outside the explicit allowlist (see §"Tarball contents" below).
4. The workflow fails if `README.md` or `LICENSE` is missing from the tarball.
5. On success, `npm view @usefulto/sf-logos-mcp@<version>` shows the new version within ~2 minutes, with `provenance: true` visible in the output.
6. `npx -y @usefulto/sf-logos-mcp` on a fresh machine boots the server and responds to `tools/list` with 6 tools.
7. `scripts/prepublish-check.sh` run locally produces the same verdict (pass/fail) as the workflow's verification step, without contacting the registry.
8. Phase-3A gates all continue to pass: `bun run typecheck`, `bun run lint`, `bun test` (125), `bun run try:check` (29), `bun run phase2:smoke` (7).

## `package.json` changes

Current:

```json
{
  "name": "@usefulto/sf-logos-mcp",
  "version": "0.1.0",
  "bin": { "sf-logos-mcp": "bin/sf-logos-mcp" },
  "engines": { "node": ">=20" },
  "files": ["bin/", "dist/", "src/bundled/manifest.json", "README.md", "LICENSE"]
}
```

Diff:

```jsonc
{
  "name": "@usefulto/sf-logos-mcp",
  "version": "0.1.0",
  "description": "MCP server for the Salesforce logo and icon library at dam.usefulto.me.",
  "license": "MIT",
  "type": "module",
  "homepage": "https://github.com/talgolan/SF_Logos#readme",          // NEW
  "repository": {                                                     // NEW
    "type": "git",
    "url": "git+https://github.com/talgolan/SF_Logos.git"
  },
  "bugs": { "url": "https://github.com/talgolan/SF_Logos/issues" },   // NEW
  "keywords": [                                                       // NEW
    "mcp", "model-context-protocol", "salesforce", "logos",
    "icons", "brand-assets", "llm-tools"
  ],
  "bin": { "sf-logos-mcp": "bin/sf-logos-mcp" },
  "engines": { "node": ">=20" },
  "files": [
    "bin/",
    "dist/",
    "src/bundled/manifest.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"                                                    // NEW
  ],
  "scripts": {
    // ...existing...
    "prepublishOnly": "bun run build && bun run prepublish:check",    // NEW
    "prepublish:check": "bash scripts/prepublish-check.sh"            // NEW
  }
}
```

`files` is the tarball allowlist. Nothing outside this list ships, *regardless* of what else is in `.npmignore` or the working tree. The `prepublish:check` script re-verifies this assertion with `npm pack --dry-run --json`.

## Tarball contents (authoritative)

After `npm pack`, the tarball must contain exactly these top-level entries:

```
package.json
README.md
LICENSE
CHANGELOG.md
bin/sf-logos-mcp
dist/**/*.js
dist/**/*.d.ts
src/bundled/manifest.json
```

**Must NOT appear:**

- `test/`, `scripts/`, `docs/`, `site/`, `.github/`, `.eslintrc.*`, `tsconfig*.json`, `bun.lock`, `.gitignore`, `.prettierrc*`.
- `dist/test/` — test output that `tsc -p tsconfig.build.json` is expected not to emit; if it leaks, the allowlist catches it.
- Any `.map` files (source maps are debug aids and should not ship).
- `.env*`, `*.log`, `.DS_Store`.

See §"prepublish-check script" for the enforcement mechanism.

## `scripts/prepublish-check.sh` (new)

Shell script, ~60 lines. Responsibilities:

1. Run `npm pack --dry-run --json` and capture the file list.
2. Assert each entry matches a pattern in the allowlist regex set. Any unmatched entry fails the script with a diff-like report.
3. Assert `README.md`, `LICENSE`, `CHANGELOG.md`, `bin/sf-logos-mcp`, and at least one `dist/*.js` are present. Missing required = fail.
4. Assert the tarball size is under a sanity cap (e.g. 5 MB). A sudden size jump usually means `node_modules/` or test fixtures slipped in.
5. Assert `package.json` `version` is a valid semver and is NOT already on the registry (uses `npm view ... version` with a timeout; skipped gracefully when offline with a `--offline` flag so local dev still works).
6. Print a one-line summary: tarball size, file count, version, verdict.

Exit code: 0 on pass, 1 on any fail. Used by:

- Developer before cutting a tag (manual).
- `prepublishOnly` hook (defense for accidental local `npm publish`).
- The release workflow as step before `npm publish --provenance`.

Skeleton (illustrative, not final):

```bash
#!/usr/bin/env bash
set -euo pipefail
pack_json=$(npm pack --dry-run --json)
files=$(echo "$pack_json" | jq -r '.[0].files[].path')
size_bytes=$(echo "$pack_json" | jq -r '.[0].size')
# allow/deny regex checks ...
# required-file checks ...
# size cap ...
# registry presence check ...
echo "[prepublish] OK  files=$(echo "$files" | wc -l | tr -d ' ')  size=$size_bytes"
```

Written as bash (not Bun) so it can run in any minimal CI image without installing Bun first — the release workflow needs it before Bun is bootstrapped, and it needs to run reliably even if a future contributor's Bun install is broken.

## CHANGELOG.md (new)

Keep-a-Changelog 1.1.0 format. Initial content:

```markdown
# Changelog

All notable changes to `@usefulto/sf-logos-mcp` are documented in this file.
This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-04-27

### Added
- Initial public release.
- Six tools: `list_brands`, `get_brand_colors`, `get_color_roles`,
  `find_brand_logo`, `find_product_icon`, `fetch_asset`.
- `fetch_asset` modes: `url`, `path`, `bytes`; optional `destination_path`
  for single-call atomic download.
- On-disk cache versioned by `manifest.lastUpdated`, respects
  `SFL_CACHE_ROOT` / `XDG_CACHE_HOME`.
- `SIGUSR2` diagnostics snapshot.

[Unreleased]: https://github.com/talgolan/SF_Logos/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/talgolan/SF_Logos/releases/tag/v0.1.0
```

The CHANGELOG is a required file in the tarball. Phase 3C will extend it with conventions; this spec gets it created and populated for v0.1.0.

## LICENSE (new)

MIT. Copyright line: `Copyright (c) 2026 Tal Golan and contributors`. Standard MIT text (no modifications). The `license` field in `package.json` is already `"MIT"`.

## README.md (stub for v0.1.0)

Phase 3C writes the full README. This spec ships a minimum-viable stub so the tarball has one. Required content:

- One-sentence purpose.
- Install line: `npx -y @usefulto/sf-logos-mcp`.
- A three-line Claude Desktop config snippet.
- A list of the six tool names with one-line descriptions each.
- Link to `https://dam.usefulto.me` (gallery).
- Disclaimer: "Unofficial. Not affiliated with Salesforce, Inc. Trademarks are property of their respective owners."

Length target: ~60 lines. Enough to not look abandoned on the npm page; not pretending to be the full documentation set.

## `.github/workflows/publish.yml` (new)

```yaml
name: Publish

on:
  push:
    tags:
      - "v*.*.*"

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write                  # for npm provenance OIDC
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0               # for git describe / tag verification

      - name: Verify tag matches package.json
        run: |
          tag="${GITHUB_REF_NAME#v}"
          pkg=$(node -p "require('./package.json').version")
          if [ "$tag" != "$pkg" ]; then
            echo "::error::tag $tag does not match package.json version $pkg"
            exit 1
          fi

      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }

      - uses: actions/setup-node@v6
        with:
          node-version: "22"
          registry-url: "https://registry.npmjs.org"

      - run: bun install --frozen-lockfile

      - run: bun run lint
      - run: bun run typecheck
      - run: bun run build
      - run: bun test
      - run: bun run try:check

      - name: Prepublish tarball check
        run: bash scripts/prepublish-check.sh

      - name: Publish with provenance
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}   # fallback; OIDC preferred
```

**Auth strategy.** Prefer npm's OIDC trusted-publisher config once set up on the `@usefulto` scope. While that's being provisioned, fall back to a scoped automation token stored as `NPM_TOKEN`. The workflow supports both; OIDC becomes the default once the scope is configured. The `NPM_TOKEN` secret is granular (publish-only, scoped to `@usefulto/sf-logos-mcp`), never a classic full-access token.

## Architecture

### New files

```
CHANGELOG.md                        # NEW
LICENSE                             # NEW
README.md                           # NEW (stub; phase 3C replaces)
scripts/prepublish-check.sh         # NEW, executable
.github/workflows/publish.yml       # NEW
```

### Modified files

```
package.json                        # MODIFIED (see diff above)
docs/SESSION_PRIMER.md              # MODIFIED (state row, invariants)
docs/LEARNINGS.md                   # MODIFIED (any surprises found)
```

No `src/` changes. No test changes at the unit level (phase 3D adds the CLI parity test).

## Testing strategy

This phase has no unit tests. Its validation is behavioral:

### Gate 1: local dry-run

```bash
bash scripts/prepublish-check.sh     # must pass
```

Run on a clean checkout of the merge commit before tagging.

### Gate 2: registry dry-run (one-time, human)

```bash
npm publish --dry-run --access public --provenance
```

Inspect the file list and size. Once. Human signoff. Not automated.

### Gate 3: the real publish

Push the tag. The workflow runs all three gates (tag match, full test suite, prepublish check), then publishes. On failure, the tag stays but nothing was uploaded; delete the tag, fix the issue, retag.

### Gate 4: post-publish smoke

Manual, from a clean directory on a fresh machine (or a disposable container):

```bash
npx -y @usefulto/sf-logos-mcp &
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  npx -y @usefulto/sf-logos-mcp
kill %1
```

Expected: 6 tools returned. This catches the "bundled manifest is at a wrong path in the tarball" class of bugs that local `bun run build` can't see.

### Regression impact

Test counts are unchanged. `scripts/try-mcp.ts` is unchanged. `scripts/phase2-smoke.sh` is unchanged. Phase 3B is strictly additive to the release surface.

## Release playbook (once pipeline is live)

1. Land feature PRs on `main` with `[Unreleased]` CHANGELOG entries.
2. When cutting a release: PR to move `[Unreleased]` contents under a dated version header, bump `package.json` version, update the `[Unreleased]` comparison link.
3. Merge the release PR.
4. Run `bash scripts/prepublish-check.sh` locally. If it fails, fix.
5. Tag: `git tag -a v<version> -m "release v<version>"`.
6. Push tag: `git push origin v<version>`.
7. Watch the publish workflow. If it fails, delete tag (`git push --delete origin v<version>`), fix, retag.
8. Post-publish smoke (Gate 4 above).
9. Update [docs/SESSION_PRIMER.md](../../SESSION_PRIMER.md) state row with the new version.

This playbook goes into [docs/contributing.md](../../contributing.md) during phase 3C.

## Open questions (none blocking)

- **Do we move to GitHub Releases as well?** Could attach the tarball to a Release for users who can't install from npm. Deferred; revisit when someone asks.
- **`npm provenance` is Node-specific.** A Bun-native `bun publish` with provenance is under discussion upstream. We use `npm publish` explicitly to get provenance today; switch when Bun supports it.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Allowlist misses a new top-level dir added later | `prepublish-check.sh` fails loudly on any file outside the allowlist; adding a new dir requires updating both `package.json` `files` and the script's regex. |
| Tag pushed from a broken `main` | Publish workflow re-runs the full gate (lint/typecheck/test/try:check) before uploading. |
| `NPM_TOKEN` leaks | Token is scoped to `@usefulto/sf-logos-mcp` only, publish-only. OIDC replaces it once configured. |
| `dist/` is stale when tagging from a local repo | `prepublishOnly` forces `bun run build` before `npm publish` even on a laptop. The release workflow builds fresh anyway. |
| Bundled manifest is read from the wrong path after install | Gate 4 (post-publish smoke) catches it; `src/bundled/manifest.json` is explicitly in the `files` allowlist, and path resolution is already tested in phase 1. |
| The registry rejects publish due to 2FA settings | OIDC trusted-publisher is the preferred setup — no 2FA step needed. Fallback automation token is publish-only; 2FA does not apply. |

## Out of scope (other phase-3 specs)

- **Phase 3C** — full documentation set (README, getting-started, tool reference, architecture, contributing). Required by original spec §5.7.
- **Phase 3D** — CI hardening: full matrix, `test:error-codes`, `test:public-api`, `test:cli`, `docs:check`. Required by original spec §5.4.7.
- **Phase 3E** — advisory symmetry for `find_brand_logo` and friends.

Each has its own spec dated 2026-04-27.
