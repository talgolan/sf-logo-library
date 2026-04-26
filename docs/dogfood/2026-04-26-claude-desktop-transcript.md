# Dog-food transcript — phase-2 acceptance

**Date:** 2026-04-26
**Claude model:** {{MODEL_NAME_AND_VERSION}}
**MCP server commit:** `df30336` (phase 2 shipped + caption roles)
**Manifest version referenced:** 2026-03-13 (sf-logos)
**Purpose:** Test the live phase-2 MCP server (`@usefulto/sf-logos-mcp` via Claude Desktop) against a real slide-building workflow. Surface what phase-2 fixed, what's still broken, and what phase 3 should prioritize.
**Disclaimer:** The `sf-logos` manifest is an unofficial internal reference, not affiliated with or endorsed by Salesforce, Inc. Trademarks belong to Salesforce, Inc.

**Prior transcript for direct comparison:** [`2026-04-25-claude-desktop-transcript.md`](2026-04-25-claude-desktop-transcript.md) — same nine prompts, phase-1 server.

---

## 0. Acceptance test — "Download the Agentforce icon to my Desktop"

*The prompt phase-2 was built for. Phase-1 gave a `curl` command; phase-2's acceptance bar is a file the user can open, not a command they have to run.*

{{PASTE CLAUDE'S RESPONSE HERE}}

**Observation hooks:**
- Did Claude reach for `fetch_asset`? Which mode?
- Did the file actually land on the Desktop?
- If Claude still offered `curl`: tool-description rewrite needed in a follow-up PR.

---

## 1. What Salesforce-related brand assets are accessible?

{{PASTE CLAUDE'S RESPONSE HERE}}

---

## 2. Data Cloud icon

{{PASTE CLAUDE'S RESPONSE HERE}}

---

## 3. Slack logo for a dark slide

*Exercises `find_brand_logo` advisories. Phase-2 added `advisories: ["only_co_branded_for_requested_background"]` for this exact case.*

{{PASTE CLAUDE'S RESPONSE HERE}}

**Observation hooks:**
- Did Claude cite the `advisories` array structurally, or describe the gap in prose only?
- Did it recommend the same fallback (white co-brand on dark) as phase 1?

---

## 4. Salesforce blue

{{PASTE CLAUDE'S RESPONSE HERE}}

---

## 5. MuleSoft at 300px wide (pptxgenjs section divider)

*Phase-2 scope-revision test: does Claude still compute aspect-ratio heights unaided? If it gets dimensions wrong, phase 3 adds server-side dimension math back.*

{{PASTE CLAUDE'S RESPONSE HERE}}

**Observation hooks:**
- Did Claude derive heights from `aspect_ratio.decimal`, or request something the server doesn't offer?
- Dimension correctness across the three MuleSoft variants.

---

## 6. Download the Agentforce icon to my Desktop

*Duplicate of Prompt 0 — kept in sequence so this transcript's numbering lines up with phase-1 for direct comparison. See §0 above for the canonical response and observations.*

---

## 7. Agentforce icon

{{PASTE CLAUDE'S RESPONSE HERE}}

---

## 8. Acme Corp logo

*Tests refusal-to-fabricate. Phase-1 Claude correctly refused. Worth checking phase-2 didn't regress.*

{{PASTE CLAUDE'S RESPONSE HERE}}

---

## 9. Caption color under a Salesforce logo

*Exercises the new `caption-on-light` / `caption-on-dark` role tags shipped in 57137fe. Claude should reach these by name now, instead of the prose-only reasoning phase-1 required.*

{{PASTE CLAUDE'S RESPONSE HERE}}

**Observation hooks:**
- Did Claude call `get_color_roles({roles: ["caption-on-light"]})` or similar?
- Did it return `#939393` for light / `#90D0FE` for dark?

---

## 10. Cache hit behavior

*"Download the Agentforce icon again." Should be ~instant. If `SFL_LOG=debug` is set on the MCP server, the stderr stream shows no `asset.fetch` event — only `cache.hit`.*

{{PASTE CLAUDE'S RESPONSE HERE}}

**Observation hooks:**
- Perceived latency vs Prompt 0.
- MCP server stderr events (if debug-level logging is on).

---

## 11. Format preference — Tableau as SVG

*`fetch_asset(format="svg")`. Worth checking Claude passes `format` explicitly instead of relying on the default.*

{{PASTE CLAUDE'S RESPONSE HERE}}

---

## 12. Advisory surfacing — Slack without co-branding on dark

*"I need a Slack logo without co-branding for a dark slide." Does Claude read the `advisories` tag and explain the gap structurally, or just re-describe it in prose?*

{{PASTE CLAUDE'S RESPONSE HERE}}

---

## 13. Caption color on navy (#032D60)

*Direct test of the new `caption-on-dark` role tag. Should return Cloud Blue 80 `#90D0FE` per FY27-adjacent guidance.*

{{PASTE CLAUDE'S RESPONSE HERE}}

---

## Files in this export

| File | Purpose |
|------|---------|
| `{{THIS FILENAME}}` | This document |
| {{ANY GENERATED ARTIFACTS}} | |

---

## Observations

*Post-session notes. Write these after the full session — what worked, what didn't, surprises. Reference specific prompt numbers. The ones that become durable wisdom go into `docs/LEARNINGS.md`; the ones that motivate code changes go into phase-3 scope.*

### Phase-2 features — did they land?

- **`fetch_asset` (§0 / §6):** {{did Claude use it / did the file materialize}}
- **Cache hit (§10):** {{latency observation}}
- **`find_brand_logo` advisories (§3 / §12):** {{structural tag vs prose}}
- **Caption role tags (§9 / §13):** {{tool calls observed; hex correctness}}
- **Aspect-ratio math unaided (§5):** {{dimension correctness}}

### New gaps surfaced

- {{things that still don't work}}

### Regressions from phase 1

- {{anything that used to work and no longer does}}

### Phase-3 implications

- {{items that shape phase-3 scope — the deferred "full 9-step CI + publishable docs" bucket might grow}}

---

## References

- Prior transcript: [`2026-04-25-claude-desktop-transcript.md`](2026-04-25-claude-desktop-transcript.md)
- Phase-2 scope revision: [`../superpowers/specs/2026-04-25-phase-2-scope-revision.md`](../superpowers/specs/2026-04-25-phase-2-scope-revision.md)
- LEARNINGS: [`../LEARNINGS.md`](../LEARNINGS.md)
- Session primer: [`../SESSION_PRIMER.md`](../SESSION_PRIMER.md)
