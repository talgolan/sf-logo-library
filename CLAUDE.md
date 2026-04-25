# CLAUDE.md — project instructions

This repo ships two things side by side:

1. **A static Salesforce logo gallery** served by GitHub Pages at
   [dam.usefulto.me](https://dam.usefulto.me). All Pages assets live under
   `site/`. Nothing outside `site/` is served.
2. **The `@usefulto/sf-logos-mcp` MCP server** — a TypeScript / Node stdio
   server that exposes the gallery to AI clients via the Model Context
   Protocol. Source lives at repo root (`src/`, `test/`, `bin/`).

## Authoritative docs (read before doing anything non-trivial)

- **Session primer (read first in every new session):**
  `docs/SESSION_PRIMER.md` — 5-minute orientation: what the project is,
  where it stands, invariants that will bite, how to start real work.
- **Design spec:** `docs/superpowers/specs/2026-04-24-sf-logos-mcp-design.md`
- **Phase 1 plan:** `docs/superpowers/plans/2026-04-25-phase-1-foundation.md`
- **Running learnings log:** `docs/LEARNINGS.md` — non-obvious findings
  that survive session context. Read this before writing code; append to
  it when something surprises you.

## Runtime

- **Dev runtime:** Bun.
- **Production runtime:** Node ≥ 20.
- **Testing:** `bun test` (82+ tests), also `node --test dist/` for Node
  parity. Strict TypeScript (`NodeNext` ESM), strict-type-checked ESLint.
- **Typecheck, lint, and tests must all pass before any commit.** Run
  `bun run typecheck && bun run lint && bun test` as a habit.

## Commit style

- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `ci:`).
- HEREDOC commit messages ending with the Claude co-author trailer.
- One logical change per commit. Never amend a commit that already
  passed review — make a new commit.
- `dist/` and `node_modules/` are gitignored; never commit build output.

## Scope discipline

- **Don't expand scope when implementing a plan task.** If the TDD cycle
  forces a real change beyond the task's files (e.g. discovering a type
  defect in a dependency module), stop, report `DONE_WITH_CONCERNS`,
  and let the controller decide — don't silently add files or edit
  unrelated code.
- **Don't create placeholder stubs to silence tooling errors.** If a
  tool fails on an empty input set or missing file, document the
  transient state rather than invent content.
- **Don't widen types just to make a test compile.** If
  `exactOptionalPropertyTypes` or `noPropertyAccessFromIndexSignature`
  bites, adapt the call site; don't change the type contract.

## LEARNINGS.md workflow

When you find something that cost real time to figure out — a toolchain
quirk, a manifest-shape surprise, a CI gotcha, a process decision worth
preserving — append an entry to `docs/LEARNINGS.md`. The instructions
for what belongs there and what doesn't are at the bottom of that file.

Do this *in the same session* you discover it. Memory tools are not a
substitute — the file survives every client and every session.

## Pages → `site/` invariant

Any file you want the world to see must live under `site/`. Any file
you want kept private — source code, tests, docs, configs — must stay
outside `site/`. The allowlist check `scripts/check-pages-allowlist.sh`
enforces this in CI and locally; run it if you're unsure.

## Phase status

- **Phase 1 (foundation + five read-only tools):** shipped. `main` ≥
  `d276a54`.
- **Phase 2 (fetch_asset + on-disk cache + dimensions + diagnostics):**
  not started. See final-review notes in `docs/LEARNINGS.md` once phase
  2 findings accumulate there; for now, review findings live in the
  post-merge commit chain.
- **Phase 3 (full CI + docs):** deferred until phase 2 lands.

## If you're a fresh agent opening this repo

Read `docs/SESSION_PRIMER.md` first. It contains the full onboarding
sequence (sanity commands, invariants, where to look next) in one
place. This file and the other doc files are referenced from there.

---

*Previous portless-dev-server template removed — this project has no
local HTTP server yet. If a dev server is added later (e.g. to preview
`site/` locally), reintroduce the portless convention at that point.*
