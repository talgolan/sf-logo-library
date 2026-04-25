# SF Logos MCP — Phase 1: Foundation + Read-Only Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an installable, observable MCP server that serves the five no-network tools (`list_brands`, `find_brand_logo`, `find_product_icon`, `get_brand_colors`, `get_color_roles`) against a bundled manifest snapshot.

**Architecture:** TypeScript + Bun in dev, Node ≥20 at runtime. Layered modules per spec §5.1 (`manifest/`, `tools/`, `search/`, plus `observability/`). MCP stdio transport. Manifest loaded live with 2 s timeout, falling back to a bundled copy of `site/manifest.json`. Every tool dispatch mints a `req_id` and emits structured events through a ring-buffered logger.

**Tech Stack:** TypeScript (NodeNext ESM, strict), Bun test runner, `@modelcontextprotocol/sdk` for MCP stdio plumbing, `zod` for runtime validation of tool inputs, ESLint + Prettier, GitHub Actions for CI.

**Reference spec:** `docs/superpowers/specs/2026-04-24-sf-logos-mcp-design.md`. All section references (`§x.y`) below point into it.

**Conventions locked in for this plan (used by every task):**

- Package name: `@usefulto/sf-logos-mcp`.
- ESM imports use `.js` extensions (TS `NodeNext` resolution).
- All unit tests use `bun:test` (`describe`, `it`, `expect`, `beforeEach`). Server end-to-end tests also run under `node --test` against the compiled output.
- Error constructor signature: `new SfLogosError(code, message, details?)`.
- Tool handler signature: `async (input, ctx) => output`, where `ctx = { manifest, logger, reqId, counters }`.
- Commit messages: conventional commits (`feat:`, `test:`, `chore:`, `docs:`, `refactor:`). Each commit ends with the Claude co-author line.
- Working directory for every command: repo root (`/Users/tal.golan/SF_Logos`).

---

## Task 1: Initialize `package.json`

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@usefulto/sf-logos-mcp",
  "version": "0.1.0",
  "description": "MCP server for the Salesforce logo and icon library at dam.usefulto.me.",
  "license": "MIT",
  "type": "module",
  "bin": { "sf-logos-mcp": "bin/sf-logos-mcp" },
  "engines": { "node": ">=20" },
  "files": ["bin/", "dist/", "src/bundled/manifest.json", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\"",
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "test:node": "node --test dist/test/**/*.test.js",
    "refresh-manifest": "bash scripts/refresh-bundled-manifest.sh"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.2.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `bun install`
Expected: creates `node_modules/` and `bun.lock`, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "$(cat <<'EOF'
feat: initialize MCP server package

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `tsconfig.json` (strict, NodeNext, ESM)

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`

- [ ] **Step 1: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "allowJs": false,
    "types": ["node", "bun-types"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 2: Write `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "noEmit": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["test/**/*.ts", "**/*.test.ts"]
}
```

- [ ] **Step 3: Add `bun-types` to devDependencies**

Run: `bun add -d bun-types`
Expected: `bun-types` added to `package.json` `devDependencies`, lockfile updated.

- [ ] **Step 4: Verify typecheck configuration is readable**

Run: `bun run typecheck`
Expected: TypeScript either exits 0 (if any `.ts` files already exist) or prints
`error TS18003: No inputs were found in config file ...` and exits non-zero. The
latter is expected at this stage — we have no `.ts` files yet. Task 4 adds the
first test file and from then on typecheck must pass cleanly.

**Do NOT create a placeholder `.ts` file just to silence TS18003.** The real
first source file is added in Task 6 (`src/manifest/types.ts`). Adding a stub
here is scope creep.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.build.json package.json bun.lock
git commit -m "$(cat <<'EOF'
chore: add strict TypeScript config (NodeNext ESM)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add ESLint + Prettier config

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Write `eslint.config.js` (flat config, strict TS rules)**

```js
// eslint.config.js
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.json", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs["recommended-type-checked"].rules,
      ...tsPlugin.configs["strict-type-checked"].rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["error", { allow: [] }],
    },
  },
  { ignores: ["dist/**", "node_modules/**", "site/**", "build/**", "coverage/**"] },
];
```

- [ ] **Step 2: Write `.prettierrc.json`**

```json
{
  "printWidth": 100,
  "singleQuote": false,
  "trailingComma": "all",
  "arrowParens": "always",
  "semi": true
}
```

- [ ] **Step 3: Write `.prettierignore`**

```
dist/
node_modules/
site/
build/
coverage/
bun.lock
```

- [ ] **Step 4: Verify lint runs on empty project**

Run: `bun run lint`
Expected: exits 0 (no files matching yet; lint may warn "no files matched" — that's acceptable until Task 6 adds source files).

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js .prettierrc.json .prettierignore
git commit -m "$(cat <<'EOF'
chore: add ESLint strict type-checked rules and Prettier

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Baseline `bun test` sanity check

Ensures the runner is wired before any real code.

**Files:**
- Create: `test/_sanity.test.ts`

- [ ] **Step 1: Write the sanity test**

```ts
// test/_sanity.test.ts
import { describe, it, expect } from "bun:test";

describe("bun test runner", () => {
  it("arithmetic works (sanity check)", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `bun test`
Expected: `1 pass` `0 fail`.

- [ ] **Step 3: Commit**

```bash
git add test/_sanity.test.ts
git commit -m "$(cat <<'EOF'
test: add bun test runner sanity check

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Bundle the manifest snapshot + refresh script

Phase 1 uses the already-authoritative `site/manifest.json` as the bundled snapshot.

**Files:**
- Create: `src/bundled/manifest.json` (copy of `site/manifest.json`)
- Create: `scripts/refresh-bundled-manifest.sh`

- [ ] **Step 1: Create the bundled snapshot directory and copy**

```bash
mkdir -p src/bundled
cp site/manifest.json src/bundled/manifest.json
```

- [ ] **Step 2: Write `scripts/refresh-bundled-manifest.sh`**

```bash
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
```

- [ ] **Step 3: Make the script executable and run it once against the local copy**

```bash
chmod +x scripts/refresh-bundled-manifest.sh
bash scripts/refresh-bundled-manifest.sh
```

Expected: "OK: 6 brands, lastUpdated=2026-03-13" and "Wrote src/bundled/manifest.json". This both refreshes and verifies the script.

- [ ] **Step 4: Commit**

```bash
git add src/bundled/manifest.json scripts/refresh-bundled-manifest.sh
git commit -m "$(cat <<'EOF'
feat: bundle manifest snapshot + refresh script

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Manifest types (raw manifest shape)

**Files:**
- Create: `src/manifest/types.ts`
- Create: `test/manifest/types.test.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
// test/manifest/types.test.ts
import { describe, it, expect } from "bun:test";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";

describe("Manifest types", () => {
  it("bundled snapshot satisfies the Manifest type at runtime", () => {
    const m = bundled as unknown as Manifest;
    expect(Array.isArray(m.brands)).toBe(true);
    expect(m.brands.length).toBe(6);
    const first = m.brands[0]!;
    expect(typeof first.id).toBe("string");
    expect(typeof first.name).toBe("string");
    expect(Array.isArray(first.logos)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test (fails — types don't exist)**

Run: `bun test test/manifest/types.test.ts`
Expected: compile error `Cannot find module '../../src/manifest/types.js'`.

- [ ] **Step 3: Implement `src/manifest/types.ts`**

```ts
/**
 * manifest/types — TypeScript shape of the canonical manifest.json.
 *
 * Responsibility: describe the raw manifest exactly as served by
 * dam.usefulto.me. Every tool consumes projections of this type
 * (see summary.ts), never the raw entries directly.
 * Dependencies: none.
 *
 * See docs/architecture.md for how the manifest flows through the server.
 */

/** Brand identifier used across the manifest. */
export type BrandId =
  | "salesforce"
  | "mulesoft"
  | "slack"
  | "tableau"
  | "informatica"
  | "product-icons";

/** Asset type — see spec §3 field rules. */
export type AssetType = "logo" | "icon-mark" | "co-brand" | "product-icon";

/** Surface the asset is designed for. */
export type Background = "light" | "dark";

/** Product-icon categories (null for brand logos). */
export type ProductIconCategory =
  | "AI"
  | "CRM"
  | "Platform"
  | "Data"
  | "Industries"
  | "Marketing"
  | "Service"
  | "Security";

/** Dimensions block as carried by the manifest. */
export interface ManifestDimensions {
  width: number;
  height: number;
  source: "png" | "svg";
}

/** Aspect ratio block. */
export interface ManifestAspectRatio {
  decimal: number;
  ratio: string;
  is_square: boolean;
}

/** SVG viewBox-based intrinsic dimensions (present when an SVG exists). */
export interface ManifestSvgIntrinsic {
  width: number;
  height: number;
  aspect_ratio_decimal: number;
  ratio: string;
}

/** One asset entry within a brand's logos[] array. */
export interface ManifestLogo {
  id: string;
  name: string;
  variant: string;
  background: Background;
  preferred: boolean;
  usage: string;
  png: string | null;
  svg: string | null;
  type: AssetType;
  co_branded: boolean;
  keywords: string[];
  use_cases: string[];
  dimensions: ManifestDimensions;
  aspect_ratio: ManifestAspectRatio;
  svg_intrinsic: ManifestSvgIntrinsic | null;
  /** product-icon only. */
  category?: ProductIconCategory;
  /** product-icon only. */
  product_description?: string;
  /** brand-wordmark only. */
  orientation?: "horizontal" | "vertical";
}

/** Brand-level palette as a flat key/hex map. */
export type BrandColorMap = Record<string, string>;

/** One entry in the curated color-roles list. */
export interface ManifestColorRoleEntry {
  name: string;
  hex: string;
  roles: string[];
}

/** Full semantic color-roles section. */
export interface ManifestColorRoles {
  _description: string;
  roles: Record<string, ManifestColorRoleEntry[]>;
}

/** One brand grouping. */
export interface ManifestBrand {
  id: BrandId;
  name: string;
  brandColors: BrandColorMap;
  logos: ManifestLogo[];
}

/** Root manifest shape. */
export interface Manifest {
  title: string;
  description: string;
  lastUpdated: string;
  brands: ManifestBrand[];
  colorRoles: ManifestColorRoles;
  _ai_instructions?: { disclaimer?: string; [k: string]: unknown };
  disclaimer?: string;
}
```

- [ ] **Step 4: Run the test**

Run: `bun test test/manifest/types.test.ts`
Expected: `1 pass` `0 fail`.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/manifest/types.ts test/manifest/types.test.ts
git commit -m "$(cat <<'EOF'
feat: add Manifest types for the raw manifest.json shape

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Tool-output types (AssetSummary, AssetDetail, BrandSummary, ColorEntry)

Extends the same file so output shapes and raw types live together.

**Files:**
- Modify: `src/manifest/types.ts`
- Create: `test/manifest/output-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/manifest/output-types.test.ts
import { describe, it, expectTypeOf } from "bun:test";
import type {
  AssetSummary,
  AssetDetail,
  BrandSummary,
  ColorEntry,
} from "../../src/manifest/types.js";

describe("Tool-output types", () => {
  it("AssetDetail extends AssetSummary", () => {
    const base: AssetSummary = {
      id: "x",
      name: "X",
      brand_id: "salesforce",
      type: "logo",
      variant: "Color",
      background: "light",
      preferred: false,
      co_branded: false,
      category: null,
      keywords: [],
      product_description: null,
      use_cases: [],
      usage: "",
      formats: { svg: null, png: null },
      preferred_format: "png",
      source_dimensions: { width: 1, height: 1, source: "png" },
      aspect_ratio: { decimal: 1, ratio: "1:1", is_square: true },
      svg_intrinsic: null,
      brand_colors_hint: {},
    };
    const detail: AssetDetail = { ...base, format: "png", url: "https://x" };
    expectTypeOf(detail).toMatchTypeOf<AssetSummary>();
  });

  it("BrandSummary has id/name/logo_count", () => {
    const b: BrandSummary = { id: "salesforce", name: "Salesforce", logo_count: 5 };
    expectTypeOf(b.logo_count).toBeNumber();
  });

  it("ColorEntry has name/hex/roles", () => {
    const c: ColorEntry = { name: "Blue 50", hex: "#0176D3", roles: ["primary"] };
    expectTypeOf(c.roles).toBeArray();
  });
});
```

- [ ] **Step 2: Run the test (fails — types don't exist)**

Run: `bun test test/manifest/output-types.test.ts`
Expected: compile error referencing the missing exports.

- [ ] **Step 3: Append output types to `src/manifest/types.ts`**

Append this at the end of the file:

```ts
// ---------------------------------------------------------------------------
// Tool-output types (projections served by the MCP tools)
// ---------------------------------------------------------------------------

/** Summary form served by find/list tools. See spec §3. */
export interface AssetSummary {
  id: string;
  name: string;
  brand_id: BrandId;
  type: AssetType;
  variant: string;
  background: Background;
  preferred: boolean;
  co_branded: boolean;
  /** null on brand logos; one of ProductIconCategory on product-icons. */
  category: ProductIconCategory | null;
  keywords: string[];
  /** null on brand logos; string on product-icons. */
  product_description: string | null;
  use_cases: string[];
  usage: string;
  formats: { svg: string | null; png: string | null };
  /** "svg" when available, else "png". */
  preferred_format: "svg" | "png";
  source_dimensions: ManifestDimensions;
  aspect_ratio: ManifestAspectRatio;
  svg_intrinsic: ManifestSvgIntrinsic | null;
  /** At most 4 key/hex pairs from the brand's palette. */
  brand_colors_hint: BrandColorMap;
  /** Present only on find_product_icon results when `query` was supplied. */
  match_score?: number;
}

/** Detail form served by fetch_asset. Superset of AssetSummary. */
export interface AssetDetail extends AssetSummary {
  /** The single format actually served by this call. */
  format: "svg" | "png";
  /** Always present. */
  url: string;
  /** Present when mode === "path". */
  path?: string;
  /** Present when mode === "bytes". */
  bytes_base64?: string;
  /** Present when target_width or target_height was set. */
  computed_dimensions?: { width: number; height: number };
  /** Present when computed_dimensions is present. */
  dimension_source?: "svg_intrinsic" | "source_dimensions";
}

/** Per-brand row in list_brands output. */
export interface BrandSummary {
  id: BrandId;
  name: string;
  logo_count: number;
}

/** Row in get_color_roles output. */
export type ColorEntry = ManifestColorRoleEntry;
```

- [ ] **Step 4: Run the test**

Run: `bun test test/manifest/output-types.test.ts`
Expected: `3 pass` `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src/manifest/types.ts test/manifest/output-types.test.ts
git commit -m "$(cat <<'EOF'
feat: add AssetSummary/AssetDetail/BrandSummary/ColorEntry output types

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `SfLogosError` class + error-code union

**Files:**
- Create: `src/errors.ts`
- Create: `test/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/errors.test.ts
import { describe, it, expect } from "bun:test";
import { SfLogosError, type SfLogosErrorCode } from "../src/errors.js";

describe("SfLogosError", () => {
  it("carries code, message, and details", () => {
    const err = new SfLogosError("AssetNotFound", "no such asset", { id: "x" });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("AssetNotFound");
    expect(err.message).toBe("no such asset");
    expect(err.details).toEqual({ id: "x" });
    expect(err.name).toBe("SfLogosError");
  });

  it("details is optional", () => {
    const err = new SfLogosError("InvalidInput", "bad");
    expect(err.details).toBeUndefined();
  });

  it("error-code union has expected members (compile-time check via runtime roundtrip)", () => {
    const codes: SfLogosErrorCode[] = [
      "AssetNotFound",
      "InvalidAssetUrl",
      "FormatUnavailable",
      "InvalidDimensions",
      "UnknownBrand",
      "InvalidInput",
      "FetchFailed",
    ];
    expect(codes).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test test/errors.test.ts`
Expected: fails with "Cannot find module".

- [ ] **Step 3: Implement `src/errors.ts`**

```ts
/**
 * errors — Canonical error type for the MCP server.
 *
 * Responsibility: expose SfLogosError and the typed code union. Every
 * handler throws this; the top-level dispatcher maps it onto the MCP
 * JSON-RPC error shape.
 * Dependencies: none.
 *
 * See spec §5.2 for the error taxonomy.
 */

export type SfLogosErrorCode =
  | "AssetNotFound"
  | "InvalidAssetUrl"
  | "FormatUnavailable"
  | "InvalidDimensions"
  | "UnknownBrand"
  | "InvalidInput"
  | "FetchFailed";

/**
 * Base error for all predictable failure modes.
 *
 * @param code - Machine-readable failure category.
 * @param message - Human-readable message; safe to surface to the caller.
 * @param details - Optional structured context (ids, available formats, etc.).
 */
export class SfLogosError extends Error {
  public readonly code: SfLogosErrorCode;
  public readonly details: Record<string, unknown> | undefined;

  constructor(
    code: SfLogosErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SfLogosError";
    this.code = code;
    this.details = details;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `bun test test/errors.test.ts`
Expected: `3 pass` `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts test/errors.test.ts
git commit -m "$(cat <<'EOF'
feat: add SfLogosError and SfLogosErrorCode union

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `req_id` generator

**Files:**
- Create: `src/observability/req-id.ts`
- Create: `test/observability/req-id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/observability/req-id.test.ts
import { describe, it, expect } from "bun:test";
import { newReqId } from "../../src/observability/req-id.js";

describe("newReqId", () => {
  it("returns an 8-char lowercase hex string (4 bytes)", () => {
    const id = newReqId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is unique across many calls (probabilistic sanity)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newReqId());
    // 1000 draws from 2^32 — collision probability is negligible.
    expect(ids.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test test/observability/req-id.test.ts`
Expected: module-not-found error.

- [ ] **Step 3: Implement `src/observability/req-id.ts`**

```ts
/**
 * observability/req-id — Short request identifiers for log correlation.
 *
 * Responsibility: mint a 4-byte hex id at the top of every tool dispatch
 * so every downstream log line can be grepped together.
 * Dependencies: node:crypto (Web Crypto getRandomValues via crypto.getRandomValues).
 *
 * See spec §5.3.5.
 */

import { randomBytes } from "node:crypto";

/** 8-character lowercase hex (4 bytes of randomness). */
export function newReqId(): string {
  return randomBytes(4).toString("hex");
}
```

- [ ] **Step 4: Run the test**

Run: `bun test test/observability/req-id.test.ts`
Expected: `2 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/observability/req-id.ts test/observability/req-id.test.ts
git commit -m "$(cat <<'EOF'
feat: add req_id generator (4-byte hex)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: In-process counters

**Files:**
- Create: `src/observability/counters.ts`
- Create: `test/observability/counters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/observability/counters.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { createCounters, type Counters } from "../../src/observability/counters.js";

describe("Counters", () => {
  let c: Counters;
  beforeEach(() => {
    c = createCounters();
  });

  it("increments labelled counters", () => {
    c.toolCall("list_brands");
    c.toolCall("list_brands");
    c.toolCall("find_product_icon");
    expect(c.snapshot().tool_calls).toEqual({
      list_brands: 2,
      find_product_icon: 1,
    });
  });

  it("increments error counters by tool+code", () => {
    c.toolError("fetch_asset", "FormatUnavailable");
    expect(c.snapshot().errors_by_code["fetch_asset::FormatUnavailable"]).toBe(1);
  });

  it("tracks cache hits/misses/bytes", () => {
    c.cacheHit();
    c.cacheMiss();
    c.cacheWrite(1024);
    expect(c.snapshot().cache).toEqual({ hits: 1, misses: 1, bytes_written: 1024 });
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/observability/counters.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/observability/counters.ts`**

```ts
/**
 * observability/counters — In-process monotonic counters.
 *
 * Responsibility: keep lightweight call/error/cache stats that the
 * diagnostics tool surfaces. No external metrics, no network egress
 * (consistent with the "no telemetry" non-goal in spec §5.3.9).
 * Dependencies: none.
 *
 * See spec §5.3.9.
 */

/** Counter snapshot returned to the diagnostics tool. */
export interface CountersSnapshot {
  tool_calls: Record<string, number>;
  errors_by_code: Record<string, number>;
  cache: { hits: number; misses: number; bytes_written: number };
  asset_fetches: { total: number; failures: number };
  manifest_refreshes: Record<string, number>;
}

/** Public surface of the counters subsystem. */
export interface Counters {
  toolCall(tool: string): void;
  toolError(tool: string, code: string): void;
  cacheHit(): void;
  cacheMiss(): void;
  cacheWrite(bytes: number): void;
  assetFetch(): void;
  assetFetchFailed(): void;
  manifestRefresh(source: "live" | "bundled"): void;
  snapshot(): CountersSnapshot;
}

export function createCounters(): Counters {
  const toolCalls: Record<string, number> = {};
  const errorsByCode: Record<string, number> = {};
  const cache = { hits: 0, misses: 0, bytes_written: 0 };
  const assetFetches = { total: 0, failures: 0 };
  const manifestRefreshes: Record<string, number> = {};

  return {
    toolCall(tool) {
      toolCalls[tool] = (toolCalls[tool] ?? 0) + 1;
    },
    toolError(tool, code) {
      const key = `${tool}::${code}`;
      errorsByCode[key] = (errorsByCode[key] ?? 0) + 1;
    },
    cacheHit() {
      cache.hits += 1;
    },
    cacheMiss() {
      cache.misses += 1;
    },
    cacheWrite(bytes) {
      cache.bytes_written += bytes;
    },
    assetFetch() {
      assetFetches.total += 1;
    },
    assetFetchFailed() {
      assetFetches.failures += 1;
    },
    manifestRefresh(source) {
      manifestRefreshes[source] = (manifestRefreshes[source] ?? 0) + 1;
    },
    snapshot() {
      return {
        tool_calls: { ...toolCalls },
        errors_by_code: { ...errorsByCode },
        cache: { ...cache },
        asset_fetches: { ...assetFetches },
        manifest_refreshes: { ...manifestRefreshes },
      };
    },
  };
}
```

- [ ] **Step 4: Run**

Run: `bun test test/observability/counters.test.ts`
Expected: `3 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/observability/counters.ts test/observability/counters.test.ts
git commit -m "$(cat <<'EOF'
feat: add in-process counters subsystem

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Event ring buffer

**Files:**
- Create: `src/observability/ring.ts`
- Create: `test/observability/ring.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/observability/ring.test.ts
import { describe, it, expect } from "bun:test";
import { createRing } from "../../src/observability/ring.js";

describe("Event ring", () => {
  it("evicts oldest entries beyond capacity, preserves order", () => {
    const r = createRing<number>(3);
    r.push(1);
    r.push(2);
    r.push(3);
    r.push(4);
    expect(r.snapshot()).toEqual([2, 3, 4]);
  });

  it("snapshot is a copy; mutating it does not affect the ring", () => {
    const r = createRing<string>(2);
    r.push("a");
    r.push("b");
    const snap = r.snapshot();
    snap.push("c");
    expect(r.snapshot()).toEqual(["a", "b"]);
  });

  it("resize grows capacity without dropping entries", () => {
    const r = createRing<number>(2);
    r.push(1);
    r.push(2);
    r.resize(5);
    r.push(3);
    expect(r.snapshot()).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/observability/ring.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/observability/ring.ts`**

```ts
/**
 * observability/ring — Bounded in-memory event ring.
 *
 * Responsibility: capture the last N log events regardless of the
 * configured log level. Used by the diagnostics tool (spec §5.3.7) and
 * the SIGUSR2 snapshot handler.
 * Dependencies: none.
 */

export interface Ring<T> {
  push(value: T): void;
  snapshot(): T[];
  resize(newCapacity: number): void;
  capacity(): number;
  size(): number;
}

export function createRing<T>(initialCapacity: number): Ring<T> {
  if (initialCapacity < 1) {
    throw new Error("ring capacity must be >= 1");
  }
  // Simple append-and-trim buffer. O(1) amortized push for small N.
  let buf: T[] = [];
  let cap = initialCapacity;

  return {
    push(value) {
      buf.push(value);
      if (buf.length > cap) buf.splice(0, buf.length - cap);
    },
    snapshot() {
      return buf.slice();
    },
    resize(newCapacity) {
      if (newCapacity < 1) throw new Error("ring capacity must be >= 1");
      cap = newCapacity;
      if (buf.length > cap) buf = buf.slice(buf.length - cap);
    },
    capacity() {
      return cap;
    },
    size() {
      return buf.length;
    },
  };
}
```

- [ ] **Step 4: Run**

Run: `bun test test/observability/ring.test.ts`
Expected: `3 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/observability/ring.ts test/observability/ring.test.ts
git commit -m "$(cat <<'EOF'
feat: add bounded event ring buffer

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Logger (levels + human format + JSONL + file dual-write)

**Files:**
- Create: `src/observability/logger.ts`
- Create: `test/observability/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/observability/logger.test.ts
import { describe, it, expect } from "bun:test";
import { createLogger, type LogEvent } from "../../src/observability/logger.js";

function captureStderr(): { lines: string[]; sink: (line: string) => void } {
  const lines: string[] = [];
  return { lines, sink: (l) => lines.push(l) };
}

describe("Logger", () => {
  it("emits human-format line with level, event, and kv pairs", () => {
    const { lines, sink } = captureStderr();
    const log = createLogger({ level: "info", format: "human", stderr: sink });
    const evt: LogEvent = { event: "tool.call", level: "info", tool: "list_brands", req_id: "abcd1234", duration_ms: 3 };
    log.emit(evt);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[sf-logos-mcp\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z info tool\.call tool=list_brands req_id=abcd1234 duration_ms=3$/);
  });

  it("emits JSONL when format=json", () => {
    const { lines, sink } = captureStderr();
    const log = createLogger({ level: "info", format: "json", stderr: sink });
    log.emit({ event: "server.start", level: "info", version: "0.1.0", node_version: "v20", pid: 1 });
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.event).toBe("server.start");
    expect(parsed.level).toBe("info");
    expect(typeof parsed.ts).toBe("string");
  });

  it("gates below-threshold lines at info, always prints error", () => {
    const { lines, sink } = captureStderr();
    const log = createLogger({ level: "info", format: "human", stderr: sink });
    log.emit({ event: "tool.input", level: "debug", tool: "x", req_id: "r", input: {} });
    log.emit({ event: "internal.error", level: "error", message: "boom" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("internal.error");
  });

  it("captures into ring regardless of level", () => {
    const { sink } = captureStderr();
    const log = createLogger({ level: "warn", format: "human", stderr: sink });
    log.emit({ event: "cache.hit", level: "debug", asset_id: "x", format: "svg", path: "/p" });
    expect(log.ringSnapshot()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/observability/logger.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/observability/logger.ts`**

```ts
/**
 * observability/logger — Level-gated structured logger.
 *
 * Responsibility: format events into human or JSONL output; gate
 * printing by level; unconditionally capture events into the ring
 * buffer; optionally dual-write to a file.
 * Errors: none thrown (log failures must never break the server).
 * Dependencies: ring.ts; node:fs (for optional file sink).
 *
 * See spec §5.3.1–5.3.6.
 */

import { appendFileSync } from "node:fs";
import { createRing, type Ring } from "./ring.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Any log event. `event` is the canonical string tag. */
export interface LogEvent {
  event: string;
  level: LogLevel;
  [key: string]: unknown;
}

export interface Logger {
  emit(evt: LogEvent): void;
  ringSnapshot(): LogEvent[];
  resizeRing(capacity: number): void;
  setLevel(level: LogLevel): void;
}

export interface LoggerOptions {
  level: LogLevel;
  format: "human" | "json";
  stderr?: (line: string) => void;
  filePath?: string | undefined;
  ringCapacity?: number;
}

export function createLogger(opts: LoggerOptions): Logger {
  let level = opts.level;
  const write = opts.stderr ?? ((line: string) => process.stderr.write(line + "\n"));
  const filePath = opts.filePath;
  const ring: Ring<LogEvent> = createRing<LogEvent>(opts.ringCapacity ?? 200);

  function shouldPrint(eventLevel: LogLevel): boolean {
    if (eventLevel === "error") return true;
    return LEVEL_RANK[eventLevel] >= LEVEL_RANK[level];
  }

  function formatHuman(evt: LogEvent): string {
    const ts = new Date().toISOString();
    const kv = Object.entries(evt)
      .filter(([k]) => k !== "event" && k !== "level")
      .map(([k, v]) => `${k}=${renderValue(v)}`)
      .join(" ");
    return `[sf-logos-mcp] ${ts} ${evt.level} ${evt.event}${kv ? " " + kv : ""}`;
  }

  function formatJson(evt: LogEvent): string {
    const { event, level: lvl, ...rest } = evt;
    return JSON.stringify({ ts: new Date().toISOString(), level: lvl, event, ...rest });
  }

  return {
    emit(evt) {
      ring.push(evt);
      if (!shouldPrint(evt.level)) return;
      const line = opts.format === "json" ? formatJson(evt) : formatHuman(evt);
      try {
        write(line);
      } catch {
        // never let logging break the server
      }
      if (filePath) {
        try {
          appendFileSync(filePath, line + "\n");
        } catch {
          // swallow
        }
      }
    },
    ringSnapshot() {
      return ring.snapshot();
    },
    resizeRing(capacity) {
      ring.resize(capacity);
    },
    setLevel(l) {
      level = l;
    },
  };
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "string") return /\s/.test(v) ? JSON.stringify(v) : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // compact JSON for arrays/objects
  return JSON.stringify(v);
}
```

- [ ] **Step 4: Run**

Run: `bun test test/observability/logger.test.ts`
Expected: `4 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/observability/logger.ts test/observability/logger.test.ts
git commit -m "$(cat <<'EOF'
feat: add level-gated logger with ring capture and JSONL format

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Typed event constructors

Gives every event a single-source-of-truth shape so handlers can't drift.

**Files:**
- Create: `src/observability/events.ts`
- Create: `test/observability/events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/observability/events.test.ts
import { describe, it, expect } from "bun:test";
import { ev } from "../../src/observability/events.js";

describe("Event constructors", () => {
  it("serverStart carries version, node_version, pid at info", () => {
    const e = ev.serverStart({ version: "0.1.0", node_version: "v20", pid: 1 });
    expect(e.event).toBe("server.start");
    expect(e.level).toBe("info");
    expect(e.version).toBe("0.1.0");
  });

  it("toolCall at info does NOT include input/output", () => {
    const e = ev.toolCall({ tool: "find_brand_logo", req_id: "r", duration_ms: 4 });
    expect(e.event).toBe("tool.call");
    expect(e.level).toBe("info");
    expect("input" in e).toBe(false);
    expect("output" in e).toBe(false);
  });

  it("toolInput and toolOutput are debug-level", () => {
    expect(ev.toolInput({ tool: "x", req_id: "r", input: {} }).level).toBe("debug");
    expect(ev.toolOutput({ tool: "x", req_id: "r", output: {} }).level).toBe("debug");
  });

  it("assetFetchFailed is warn-level with reason+url", () => {
    const e = ev.assetFetchFailed({ url: "https://x", req_id: "r", reason: "timeout" });
    expect(e.level).toBe("warn");
    expect(e.reason).toBe("timeout");
  });

  it("internalError is error-level with stack", () => {
    const e = ev.internalError({ message: "boom", stack: "..." });
    expect(e.level).toBe("error");
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/observability/events.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/observability/events.ts`**

```ts
/**
 * observability/events — Typed constructors for every required log event.
 *
 * Responsibility: be the single source of truth for event names, levels,
 * and key shapes. Handlers import `ev.<name>(...)` rather than constructing
 * log events by hand — this keeps names stable and levels correct.
 * Dependencies: logger.ts (for the LogEvent type).
 *
 * See spec §5.3.5.
 */

import type { LogEvent } from "./logger.js";

export const ev = {
  serverStart: (a: { version: string; node_version: string; pid: number }): LogEvent => ({
    event: "server.start",
    level: "info",
    ...a,
  }),
  serverReady: (a: {
    tool_count: number;
    manifest_source: "live" | "bundled";
    manifest_version: string;
    startup_ms: number;
  }): LogEvent => ({ event: "server.ready", level: "info", ...a }),
  serverShutdown: (a: { reason: string; uptime_ms: number }): LogEvent => ({
    event: "server.shutdown",
    level: "info",
    ...a,
  }),
  manifestLoaded: (a: {
    source: "live" | "bundled";
    version: string;
    latency_ms: number;
  }): LogEvent => ({ event: "manifest.loaded", level: "info", ...a }),
  manifestFallback: (a: { reason: string; version: string }): LogEvent => ({
    event: "manifest.fallback",
    level: "warn",
    ...a,
  }),
  toolCall: (a: {
    tool: string;
    req_id: string;
    duration_ms: number;
    result_count?: number;
    error_code?: string;
  }): LogEvent => ({ event: "tool.call", level: "info", ...a }),
  toolInput: (a: { tool: string; req_id: string; input: unknown }): LogEvent => ({
    event: "tool.input",
    level: "debug",
    ...a,
  }),
  toolOutput: (a: { tool: string; req_id: string; output: unknown }): LogEvent => ({
    event: "tool.output",
    level: "debug",
    ...a,
  }),
  assetFetch: (a: {
    url: string;
    req_id: string;
    status: number;
    bytes: number;
    duration_ms: number;
  }): LogEvent => ({ event: "asset.fetch", level: "debug", ...a }),
  assetFetchFailed: (a: {
    url: string;
    req_id: string;
    reason: string;
    status?: number;
  }): LogEvent => ({ event: "asset.fetch.failed", level: "warn", ...a }),
  cacheHit: (a: { asset_id: string; format: "svg" | "png"; path: string }): LogEvent => ({
    event: "cache.hit",
    level: "debug",
    ...a,
  }),
  cacheMiss: (a: { asset_id: string; format: "svg" | "png"; path: string }): LogEvent => ({
    event: "cache.miss",
    level: "debug",
    ...a,
  }),
  cacheWrite: (a: {
    asset_id: string;
    format: "svg" | "png";
    path: string;
    bytes: number;
  }): LogEvent => ({ event: "cache.write", level: "debug", ...a }),
  internalError: (a: {
    message: string;
    stack: string;
    req_id?: string;
    tool?: string;
  }): LogEvent => ({ event: "internal.error", level: "error", ...a }),
};
```

- [ ] **Step 4: Run**

Run: `bun test test/observability/events.test.ts`
Expected: `5 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/observability/events.ts test/observability/events.test.ts
git commit -m "$(cat <<'EOF'
feat: add typed event constructors (ev.*)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Manifest loader (live fetch + bundled fallback)

**Files:**
- Create: `src/manifest/loader.ts`
- Create: `test/manifest/loader.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/manifest/loader.test.ts
import { describe, it, expect } from "bun:test";
import { loadManifest } from "../../src/manifest/loader.js";
import { createLogger } from "../../src/observability/logger.js";

const bundledMin = {
  title: "t",
  description: "d",
  lastUpdated: "2026-03-13",
  brands: [{ id: "salesforce", name: "Salesforce", brandColors: {}, logos: [] }],
  colorRoles: { _description: "", roles: {} },
};

function mkLogger() {
  const lines: string[] = [];
  return { logger: createLogger({ level: "info", format: "human", stderr: (l) => lines.push(l) }), lines };
}

describe("loadManifest", () => {
  it("uses live manifest on success", async () => {
    const live = { ...bundledMin, lastUpdated: "2026-04-01" };
    const fetchFn = async () => new Response(JSON.stringify(live), { status: 200 });
    const { logger } = mkLogger();
    const result = await loadManifest({ fetch: fetchFn, logger, timeoutMs: 500 });
    expect(result.source).toBe("live");
    expect(result.manifest.lastUpdated).toBe("2026-04-01");
  });

  it("falls back to bundled on timeout", async () => {
    const fetchFn = (_: string, opts?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const { logger } = mkLogger();
    const result = await loadManifest({ fetch: fetchFn, logger, timeoutMs: 20 });
    expect(result.source).toBe("bundled");
  });

  it("falls back to bundled on non-200", async () => {
    const fetchFn = async () => new Response("nope", { status: 500 });
    const { logger } = mkLogger();
    const result = await loadManifest({ fetch: fetchFn, logger, timeoutMs: 500 });
    expect(result.source).toBe("bundled");
  });

  it("falls back to bundled on invalid JSON", async () => {
    const fetchFn = async () => new Response("not-json", { status: 200 });
    const { logger } = mkLogger();
    const result = await loadManifest({ fetch: fetchFn, logger, timeoutMs: 500 });
    expect(result.source).toBe("bundled");
  });

  it("falls back on schema mismatch (missing brands[])", async () => {
    const fetchFn = async () => new Response(JSON.stringify({ title: "x" }), { status: 200 });
    const { logger } = mkLogger();
    const result = await loadManifest({ fetch: fetchFn, logger, timeoutMs: 500 });
    expect(result.source).toBe("bundled");
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/manifest/loader.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/manifest/loader.ts`**

```ts
/**
 * manifest/loader — Resolve the manifest singleton at server startup.
 *
 * Responsibility: attempt a live fetch with a short timeout; fall back
 * to the bundled snapshot on any failure. Never raise to the caller;
 * a server must always have a manifest to serve from.
 * Inputs: fetch implementation (injected for tests), logger, timeout.
 * Outputs: { manifest, source: "live" | "bundled" }.
 * Errors: none thrown (failures degrade to bundled).
 * Dependencies: bundled/manifest.json, observability/logger.ts,
 *   observability/events.ts, manifest/types.ts.
 *
 * See spec §4.1 and §5.3.5 (manifest.loaded / manifest.fallback).
 */

import bundled from "../bundled/manifest.json" with { type: "json" };
import { ev } from "../observability/events.js";
import type { Logger } from "../observability/logger.js";
import type { Manifest } from "./types.js";

const LIVE_URL = "https://dam.usefulto.me/manifest.json";

export interface LoadManifestOptions {
  fetch?: typeof globalThis.fetch;
  logger: Logger;
  timeoutMs?: number;
  userAgent?: string;
}

export interface LoadManifestResult {
  manifest: Manifest;
  source: "live" | "bundled";
}

export async function loadManifest(opts: LoadManifestOptions): Promise<LoadManifestResult> {
  const started = Date.now();
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 2000;
  const ua = opts.userAgent ?? "sf-logos-mcp";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetchFn(LIVE_URL, {
      headers: { "User-Agent": ua },
      signal: controller.signal,
    });
    if (!resp.ok) {
      return fallback(`http_${resp.status}`, started, opts.logger);
    }
    const text = await resp.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fallback("invalid_json", started, opts.logger);
    }
    if (!isManifestShape(parsed)) {
      return fallback("schema_mismatch", started, opts.logger);
    }
    const manifest = Object.freeze(parsed) as Manifest;
    opts.logger.emit(
      ev.manifestLoaded({
        source: "live",
        version: manifest.lastUpdated,
        latency_ms: Date.now() - started,
      }),
    );
    return { manifest, source: "live" };
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    return fallback(reason, started, opts.logger);
  } finally {
    clearTimeout(timer);
  }
}

function fallback(reason: string, startedAt: number, logger: Logger): LoadManifestResult {
  const manifest = Object.freeze(bundled as unknown as Manifest);
  logger.emit(ev.manifestFallback({ reason, version: manifest.lastUpdated }));
  logger.emit(
    ev.manifestLoaded({
      source: "bundled",
      version: manifest.lastUpdated,
      latency_ms: Date.now() - startedAt,
    }),
  );
  return { manifest, source: "bundled" };
}

function isManifestShape(x: unknown): x is Manifest {
  if (typeof x !== "object" || x === null) return false;
  const m = x as Record<string, unknown>;
  if (!Array.isArray(m.brands) || m.brands.length === 0) return false;
  for (const b of m.brands as unknown[]) {
    if (typeof b !== "object" || b === null) return false;
    const br = b as Record<string, unknown>;
    if (typeof br.id !== "string" || typeof br.name !== "string") return false;
    if (!Array.isArray(br.logos)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run**

Run: `bun test test/manifest/loader.test.ts`
Expected: `5 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/manifest/loader.ts test/manifest/loader.test.ts
git commit -m "$(cat <<'EOF'
feat: add manifest loader with 2s timeout and bundled fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: `toAssetSummary` projection

**Files:**
- Create: `src/manifest/summary.ts`
- Create: `test/manifest/summary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/manifest/summary.test.ts
import { describe, it, expect } from "bun:test";
import { toAssetSummary, ASSET_BASE_URL } from "../../src/manifest/summary.js";
import type { ManifestBrand, ManifestLogo } from "../../src/manifest/types.js";

const brand: ManifestBrand = {
  id: "salesforce",
  name: "Salesforce",
  brandColors: { primary: "#0176d3", navy: "#032d60", cloud: "#1b96ff", white: "#fff", extra5: "#000" },
  logos: [],
};

const baseLogo: ManifestLogo = {
  id: "sf-x",
  name: "X",
  variant: "Color",
  background: "light",
  preferred: true,
  usage: "u",
  png: "Original/Logo Assets for Upload/Horizontal Logo RGB/X.png",
  svg: "Original/Logo Assets for Upload/Horizontal Logo RGB/X.svg",
  type: "logo",
  co_branded: false,
  keywords: ["a"],
  use_cases: [],
  dimensions: { width: 1, height: 1, source: "png" },
  aspect_ratio: { decimal: 1, ratio: "1:1", is_square: true },
  svg_intrinsic: null,
};

describe("toAssetSummary", () => {
  it("resolves URLs with percent-encoded spaces", () => {
    const s = toAssetSummary(baseLogo, brand);
    expect(s.formats.svg).toBe(`${ASSET_BASE_URL}/Original/Logo%20Assets%20for%20Upload/Horizontal%20Logo%20RGB/X.svg`);
    expect(s.formats.png).toBe(`${ASSET_BASE_URL}/Original/Logo%20Assets%20for%20Upload/Horizontal%20Logo%20RGB/X.png`);
  });

  it("preferred_format is svg when both present", () => {
    expect(toAssetSummary(baseLogo, brand).preferred_format).toBe("svg");
  });

  it("preferred_format is png when svg is null", () => {
    expect(toAssetSummary({ ...baseLogo, svg: null }, brand).preferred_format).toBe("png");
  });

  it("trims brand_colors_hint to at most 4 key/hex pairs", () => {
    const s = toAssetSummary(baseLogo, brand);
    expect(Object.keys(s.brand_colors_hint).length).toBeLessThanOrEqual(4);
  });

  it("nulls category and product_description for brand logos", () => {
    const s = toAssetSummary(baseLogo, brand);
    expect(s.category).toBeNull();
    expect(s.product_description).toBeNull();
  });

  it("passes through category and product_description for product-icons", () => {
    const iconBrand: ManifestBrand = { ...brand, id: "product-icons" };
    const icon: ManifestLogo = {
      ...baseLogo,
      type: "product-icon",
      category: "AI",
      product_description: "AI stuff",
    };
    const s = toAssetSummary(icon, iconBrand);
    expect(s.category).toBe("AI");
    expect(s.product_description).toBe("AI stuff");
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/manifest/summary.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/manifest/summary.ts`**

```ts
/**
 * manifest/summary — Project raw manifest entries into AssetSummary.
 *
 * Responsibility: encapsulate every rule in spec §3 so each tool file
 * renders a consistent shape. Pre-resolves URLs (percent-encoding
 * spaces), computes preferred_format, trims brand_colors_hint to at
 * most 4 pairs, and nulls per-type fields that don't apply.
 * Dependencies: manifest/types.ts.
 *
 * See spec §3 and §5.1 (summary.ts).
 */

import type {
  AssetSummary,
  BrandColorMap,
  ManifestBrand,
  ManifestLogo,
} from "./types.js";

export const ASSET_BASE_URL = "https://dam.usefulto.me";

export function toAssetSummary(logo: ManifestLogo, brand: ManifestBrand): AssetSummary {
  const svgUrl = logo.svg !== null ? resolveUrl(logo.svg) : null;
  const pngUrl = logo.png !== null ? resolveUrl(logo.png) : null;
  return {
    id: logo.id,
    name: logo.name,
    brand_id: brand.id,
    type: logo.type,
    variant: logo.variant,
    background: logo.background,
    preferred: logo.preferred,
    co_branded: logo.co_branded,
    category: logo.category ?? null,
    keywords: logo.keywords,
    product_description: logo.product_description ?? null,
    use_cases: logo.use_cases,
    usage: logo.usage,
    formats: { svg: svgUrl, png: pngUrl },
    preferred_format: svgUrl !== null ? "svg" : "png",
    source_dimensions: logo.dimensions,
    aspect_ratio: logo.aspect_ratio,
    svg_intrinsic: logo.svg_intrinsic,
    brand_colors_hint: trimHint(brand.brandColors),
  };
}

/** Prepend the base URL and percent-encode spaces in path segments. */
export function resolveUrl(relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${ASSET_BASE_URL}/${encoded}`;
}

function trimHint(colors: BrandColorMap): BrandColorMap {
  const entries = Object.entries(colors).slice(0, 4);
  const result: BrandColorMap = {};
  for (const [k, v] of entries) result[k] = v;
  return result;
}
```

- [ ] **Step 4: Run**

Run: `bun test test/manifest/summary.test.ts`
Expected: `6 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/manifest/summary.ts test/manifest/summary.test.ts
git commit -m "$(cat <<'EOF'
feat: add toAssetSummary projection with URL/hint rules

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: `tokenize` helpers

**Files:**
- Create: `src/search/tokenize.ts`
- Create: `test/search/tokenize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/search/tokenize.test.ts
import { describe, it, expect } from "bun:test";
import { tokenize, matchesToken } from "../../src/search/tokenize.js";

describe("tokenize", () => {
  it("lowercases and splits on whitespace", () => {
    expect(tokenize("Data Cloud AI")).toEqual(["data", "cloud", "ai"]);
  });
  it("collapses unicode whitespace", () => {
    expect(tokenize("foo\t bar\n  baz")).toEqual(["foo", "bar", "baz"]);
  });
  it("returns empty array on empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
  it("preserves punctuation inside tokens (no greedy stripping)", () => {
    // Intentional: 'ai/ml' is a single token. Score band 3 requires exact
    // keyword equality; descriptions use substring. See spec §2 scoring.
    expect(tokenize("AI/ML einstein-gpt")).toEqual(["ai/ml", "einstein-gpt"]);
  });
});

describe("matchesToken", () => {
  it("exact keyword match (case-insensitive)", () => {
    expect(matchesToken("Agentforce", "agentforce")).toBe(true);
  });
  it("word-boundary substring match", () => {
    expect(matchesToken("autonomous AI", "ai")).toBe(true);
    expect(matchesToken("trailhead", "ai")).toBe(false);
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/search/tokenize.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/search/tokenize.ts`**

```ts
/**
 * search/tokenize — String tokenization for find_product_icon scoring.
 *
 * Responsibility: split user queries into lower-case tokens; test
 * whether a keyword matches a token via exact or word-boundary rules.
 * Dependencies: none.
 *
 * See spec §2 (find_product_icon scoring).
 */

/** Lowercase + whitespace-split. Punctuation stays inside tokens. */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/u)
    .filter((t) => t.length > 0);
}

/**
 * Does `keyword` match `token`?
 *
 * - Exact: keyword.toLowerCase() === token.
 * - Word-boundary substring: token appears in the keyword flanked by
 *   non-letter/digit characters (or string boundaries).
 */
export function matchesToken(keyword: string, token: string): boolean {
  const kw = keyword.toLowerCase();
  if (kw === token) return true;
  const pattern = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(token)}(?:[^a-z0-9]|$)`,
    "u",
  );
  return pattern.test(kw);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 4: Run**

Run: `bun test test/search/tokenize.test.ts`
Expected: `6 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/search/tokenize.ts test/search/tokenize.test.ts
git commit -m "$(cat <<'EOF'
feat: add tokenize and matchesToken helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: `score` — weighted scoring for `find_product_icon`

**Files:**
- Create: `src/search/score.ts`
- Create: `test/search/score.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/search/score.test.ts
import { describe, it, expect } from "bun:test";
import { scoreLogo } from "../../src/search/score.js";
import type { ManifestLogo } from "../../src/manifest/types.js";

const base: ManifestLogo = {
  id: "icon-agentforce",
  name: "Agentforce",
  variant: "Full Color",
  background: "light",
  preferred: false,
  usage: "",
  png: "p",
  svg: "s",
  type: "product-icon",
  co_branded: false,
  keywords: ["AI", "agent", "autonomous AI", "agentforce", "LLM"],
  use_cases: ["AI slide"],
  dimensions: { width: 1, height: 1, source: "png" },
  aspect_ratio: { decimal: 1, ratio: "1:1", is_square: true },
  svg_intrinsic: null,
  category: "AI",
  product_description: "Autonomous AI agent platform.",
};

describe("scoreLogo", () => {
  it("exact keyword hits score 3 each (and name hits +2 when it also matches)", () => {
    // token 'agentforce': kw exact (+3) + name substring (+2) = 5.
    expect(scoreLogo(base, ["agentforce"])).toBe(5);
  });
  it("name substring alone scores 2", () => {
    // no keywords configured, so only the name match fires.
    expect(scoreLogo({ ...base, keywords: [] }, ["agentforce"])).toBe(2);
  });
  it("description substring alone scores 1", () => {
    // 'platform' is in product_description only.
    expect(scoreLogo({ ...base, keywords: [] }, ["platform"])).toBe(1);
  });
  it("zero score when no token matches anywhere", () => {
    expect(scoreLogo(base, ["xyz123"])).toBe(0);
  });
  it("sums across tokens", () => {
    // 'agentforce' (kw:3 + name:2 = 5) + 'platform' (desc:1) = 6.
    expect(scoreLogo(base, ["agentforce", "platform"])).toBe(6);
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/search/score.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/search/score.ts`**

```ts
/**
 * search/score — Weighted scoring for find_product_icon.
 *
 * Responsibility: given a logo entry and a set of query tokens, return
 * an integer score:
 *   3 per exact keyword match,
 *   2 per name substring match,
 *   1 per product_description or use_case substring match.
 * Ties are broken by alphabetical name at the caller.
 * Dependencies: search/tokenize.ts, manifest/types.ts.
 *
 * See spec §2 (find_product_icon scoring).
 */

import { matchesToken } from "./tokenize.js";
import type { ManifestLogo } from "../manifest/types.js";

const KEYWORD_WEIGHT = 3;
const NAME_WEIGHT = 2;
const DESCRIPTION_WEIGHT = 1;
const USE_CASE_WEIGHT = 1;

export function scoreLogo(logo: ManifestLogo, tokens: string[]): number {
  let score = 0;
  for (const token of tokens) {
    // Keyword band — count each token once against the keyword set.
    if (logo.keywords.some((kw) => matchesToken(kw, token))) {
      score += KEYWORD_WEIGHT;
    }
    // Name band.
    if (logo.name.toLowerCase().includes(token)) score += NAME_WEIGHT;
    // Description band.
    if (logo.product_description && logo.product_description.toLowerCase().includes(token)) {
      score += DESCRIPTION_WEIGHT;
    }
    // Use-case band — count each token once across all use-case strings.
    if (logo.use_cases.some((uc) => uc.toLowerCase().includes(token))) {
      score += USE_CASE_WEIGHT;
    }
  }
  return score;
}
```

- [ ] **Step 4: Run**

Run: `bun test test/search/score.test.ts`
Expected: `5 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/search/score.ts test/search/score.test.ts
git commit -m "$(cat <<'EOF'
feat: add weighted scoring for find_product_icon

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Tool registry type + context

**Files:**
- Create: `src/tools/registry.ts`
- Create: `test/tools/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/tools/registry.test.ts
import { describe, it, expect } from "bun:test";
import { defineTool, type ToolContext } from "../../src/tools/registry.js";

describe("defineTool", () => {
  it("returns the object verbatim (sanity) and preserves generics", async () => {
    const tool = defineTool<{ n: number }, { n2: number }>({
      name: "square",
      description: "squares a number",
      inputSchema: { type: "object", properties: { n: { type: "number" } }, required: ["n"] },
      handler: async (input, _ctx) => ({ n2: input.n * input.n }),
    });
    expect(tool.name).toBe("square");
    const ctx: ToolContext = {
      manifest: { brands: [] } as never,
      logger: { emit: () => {}, ringSnapshot: () => [], resizeRing: () => {}, setLevel: () => {} },
      reqId: "r",
      counters: {
        toolCall: () => {},
        toolError: () => {},
        cacheHit: () => {},
        cacheMiss: () => {},
        cacheWrite: () => {},
        assetFetch: () => {},
        assetFetchFailed: () => {},
        manifestRefresh: () => {},
        snapshot: () => ({
          tool_calls: {},
          errors_by_code: {},
          cache: { hits: 0, misses: 0, bytes_written: 0 },
          asset_fetches: { total: 0, failures: 0 },
          manifest_refreshes: {},
        }),
      },
    };
    expect(await tool.handler({ n: 3 }, ctx)).toEqual({ n2: 9 });
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/tools/registry.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/tools/registry.ts`**

```ts
/**
 * tools/registry — Shape of a Tool and the context handlers receive.
 *
 * Responsibility: provide a minimal interface so every tool file
 * exports the same thing; server.ts collects and registers them.
 * Dependencies: manifest/types.ts, observability/logger.ts,
 *   observability/counters.ts.
 *
 * See spec §5.1.
 */

import type { Manifest } from "../manifest/types.js";
import type { Logger } from "../observability/logger.js";
import type { Counters } from "../observability/counters.js";

export interface ToolContext {
  manifest: Manifest;
  logger: Logger;
  reqId: string;
  counters: Counters;
}

/** Minimal JSON Schema subset used for tool inputs. */
export interface JsonSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
  [k: string]: unknown;
}

export interface Tool<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (input: Input, ctx: ToolContext) => Promise<Output>;
}

/** Identity helper; gives call-site TypeScript inference for Input/Output. */
export function defineTool<Input, Output>(t: Tool<Input, Output>): Tool<Input, Output> {
  return t;
}
```

- [ ] **Step 4: Run**

Run: `bun test test/tools/registry.test.ts`
Expected: `1 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/registry.ts test/tools/registry.test.ts
git commit -m "$(cat <<'EOF'
feat: add Tool/ToolContext/defineTool registry types

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: `list_brands` tool

**Files:**
- Create: `src/tools/list-brands.ts`
- Create: `test/tools/list-brands.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/tools/list-brands.test.ts
import { describe, it, expect } from "bun:test";
import { listBrandsTool } from "../../src/tools/list-brands.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";

describe("list_brands", () => {
  it("returns one row per brand with name and logo_count", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await listBrandsTool.handler({}, ctx);
    expect(result.brands).toHaveLength(6);
    const sf = result.brands.find((b) => b.id === "salesforce");
    expect(sf?.logo_count).toBeGreaterThan(0);
  });

  it("includes manifest_version and disclaimer", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await listBrandsTool.handler({}, ctx);
    expect(typeof result.manifest_version).toBe("string");
    expect(typeof result.disclaimer).toBe("string");
  });

  it("has a description >= 200 chars (LLM-facing guidance)", () => {
    expect(listBrandsTool.description.length).toBeGreaterThanOrEqual(200);
  });
});
```

- [ ] **Step 2: Create the test helper** (shared across all tool tests)

Create `test/helpers/context.ts`:

```ts
// test/helpers/context.ts
import type { Manifest } from "../../src/manifest/types.js";
import type { ToolContext } from "../../src/tools/registry.js";
import { createCounters } from "../../src/observability/counters.js";
import { createLogger } from "../../src/observability/logger.js";

export function makeTestContext(manifest: Manifest, reqId = "test0001"): ToolContext {
  return {
    manifest,
    logger: createLogger({ level: "error", format: "human", stderr: () => {} }),
    reqId,
    counters: createCounters(),
  };
}
```

- [ ] **Step 3: Run the test (fails — module not yet created)**

Run: `bun test test/tools/list-brands.test.ts`
Expected: module not found.

- [ ] **Step 4: Implement `src/tools/list-brands.ts`**

```ts
/**
 * tools/list-brands — Enumerate the brand groupings in the manifest.
 *
 * Responsibility: return one BrandSummary per brand with counts plus
 * the manifest version and disclaimer, so LLM callers can orient
 * themselves and pass the "unofficial resource" context through.
 * Errors: none.
 * Dependencies: manifest/types.ts, tools/registry.ts.
 *
 * Selection rules: none (pure enumeration).
 *
 * See spec §2 (list_brands).
 */

import type { BrandSummary } from "../manifest/types.js";
import { defineTool } from "./registry.js";

interface Output {
  brands: BrandSummary[];
  manifest_version: string;
  disclaimer: string;
}

const DESCRIPTION = [
  "Enumerate every brand grouping known to the server — five brand-logo families",
  "(Salesforce, MuleSoft, Slack, Tableau, Informatica) plus Salesforce 2D product icons.",
  "Returns each brand's id, human name, and asset count, along with the manifest version",
  "and the unofficial-resource disclaimer. Call this first when you don't know which brand",
  "or id to use. No inputs. Product icons are returned under brand_id 'product-icons' and",
  "MUST be searched via find_product_icon, not find_brand_logo.",
].join(" ");

export const listBrandsTool = defineTool<Record<string, never>, Output>({
  name: "list_brands",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
    description: "No inputs; returns the full brand list with counts.",
  },
  handler: async (_input, ctx) => {
    const disclaimer =
      ((ctx.manifest._ai_instructions?.disclaimer as string | undefined) ?? ctx.manifest.disclaimer) ??
      "This library is an unofficial internal reference resource.";
    return {
      brands: ctx.manifest.brands.map((b) => ({
        id: b.id,
        name: b.name,
        logo_count: b.logos.length,
      })),
      manifest_version: ctx.manifest.lastUpdated,
      disclaimer,
    };
  },
});
```

- [ ] **Step 5: Run**

Run: `bun test test/tools/list-brands.test.ts`
Expected: `3 pass`.

- [ ] **Step 6: Commit**

```bash
git add src/tools/list-brands.ts test/tools/list-brands.test.ts test/helpers/context.ts
git commit -m "$(cat <<'EOF'
feat: add list_brands tool

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: `get_brand_colors` tool

**Files:**
- Create: `src/tools/get-brand-colors.ts`
- Create: `test/tools/get-brand-colors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/tools/get-brand-colors.test.ts
import { describe, it, expect } from "bun:test";
import { getBrandColorsTool } from "../../src/tools/get-brand-colors.js";
import { SfLogosError } from "../../src/errors.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";

describe("get_brand_colors", () => {
  it("returns the brand's palette", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getBrandColorsTool.handler({ brand_id: "salesforce" }, ctx);
    expect(result.brand_id).toBe("salesforce");
    expect(typeof result.colors.primary).toBe("string");
  });

  it("raises UnknownBrand for unknown ids", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    await expect(
      getBrandColorsTool.handler({ brand_id: "nope" as never }, ctx),
    ).rejects.toMatchObject({ code: "UnknownBrand" });
  });

  it("has a description >= 200 chars", () => {
    expect(getBrandColorsTool.description.length).toBeGreaterThanOrEqual(200);
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/tools/get-brand-colors.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/tools/get-brand-colors.ts`**

```ts
/**
 * tools/get-brand-colors — Return a brand's palette.
 *
 * Responsibility: flat key/hex map for the specified brand, suitable
 * for styling surrounding UI (captions, backgrounds, dividers) —
 * never for recoloring the logo itself.
 * Errors: UnknownBrand when brand_id is not in list_brands.
 * Dependencies: manifest/types.ts, errors.ts, tools/registry.ts.
 *
 * See spec §2 (get_brand_colors).
 */

import { SfLogosError } from "../errors.js";
import type { BrandColorMap, BrandId } from "../manifest/types.js";
import { defineTool } from "./registry.js";

interface Input {
  brand_id: BrandId;
}
interface Output {
  brand_id: BrandId;
  brand_name: string;
  colors: BrandColorMap;
}

const DESCRIPTION = [
  "Return the brand palette for a given brand_id as a flat key/hex map.",
  "Use these colors to style the neighborhood of a logo — backgrounds, captions,",
  "dividers — NOT to recolor the logo itself (which is a brand violation).",
  "For semantic UI roles (primary, hover, error) use get_color_roles instead.",
  "Raises UnknownBrand when brand_id is not one of the ids from list_brands.",
].join(" ");

export const getBrandColorsTool = defineTool<Input, Output>({
  name: "get_brand_colors",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      brand_id: {
        type: "string",
        description:
          "One of the ids returned by list_brands (e.g. 'salesforce', 'product-icons').",
      },
    },
    required: ["brand_id"],
    additionalProperties: false,
    description: "Look up a brand's color palette by id.",
  },
  handler: async (input, ctx) => {
    const brand = ctx.manifest.brands.find((b) => b.id === input.brand_id);
    if (!brand) {
      throw new SfLogosError(
        "UnknownBrand",
        `Unknown brand '${input.brand_id}'. Call list_brands to see valid ids.`,
        { brand_id: input.brand_id },
      );
    }
    return { brand_id: brand.id, brand_name: brand.name, colors: { ...brand.brandColors } };
  },
});
```

- [ ] **Step 4: Run**

Run: `bun test test/tools/get-brand-colors.test.ts`
Expected: `3 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-brand-colors.ts test/tools/get-brand-colors.test.ts
git commit -m "$(cat <<'EOF'
feat: add get_brand_colors tool

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: `get_color_roles` tool

**Files:**
- Create: `src/tools/get-color-roles.ts`
- Create: `test/tools/get-color-roles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/tools/get-color-roles.test.ts
import { describe, it, expect } from "bun:test";
import { getColorRolesTool } from "../../src/tools/get-color-roles.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";

describe("get_color_roles", () => {
  it("returns every role when no filter is provided", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getColorRolesTool.handler({}, ctx);
    expect(result.roles.length).toBeGreaterThan(0);
  });

  it("filters by a single role", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getColorRolesTool.handler({ roles: ["primary"] }, ctx);
    expect(result.roles.every((r) => r.roles.includes("primary"))).toBe(true);
  });

  it("filters by multiple roles (union)", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getColorRolesTool.handler({ roles: ["primary", "hover"] }, ctx);
    expect(result.roles.every((r) => r.roles.some((x) => ["primary", "hover"].includes(x)))).toBe(true);
  });

  it("returns empty array (not error) for unknown role", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getColorRolesTool.handler({ roles: ["nonexistent-xyz"] }, ctx);
    expect(result.roles).toEqual([]);
  });

  it("has a description >= 200 chars", () => {
    expect(getColorRolesTool.description.length).toBeGreaterThanOrEqual(200);
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/tools/get-color-roles.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/tools/get-color-roles.ts`**

```ts
/**
 * tools/get-color-roles — Semantic UI-role palette.
 *
 * Responsibility: expose the curated role-tagged subset of the full
 * 156-swatch palette — swatches tagged with roles like 'primary',
 * 'hover', 'error', 'focus-ring'. Used to style functional UI, NOT
 * to recolor logos.
 * Errors: none (unknown role names return an empty array).
 * Dependencies: manifest/types.ts, tools/registry.ts.
 *
 * See spec §2 (get_color_roles).
 */

import type { ColorEntry } from "../manifest/types.js";
import { defineTool } from "./registry.js";

interface Input {
  roles?: string[];
}
interface Output {
  roles: ColorEntry[];
}

const DESCRIPTION = [
  "Return the semantic UI-role palette: hex swatches tagged with roles like",
  "'primary', 'hover', 'error', 'focus-ring', 'brand'. Provide a `roles` array",
  "to filter to swatches that include any of those role names (union). Omit",
  "`roles` to get every curated swatch. This is for functional UI only — it",
  "is NOT a substitute for get_brand_colors when styling a logo's neighborhood.",
  "Unknown role names return an empty list, not an error.",
].join(" ");

export const getColorRolesTool = defineTool<Input, Output>({
  name: "get_color_roles",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      roles: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional list of role names (e.g. ['primary', 'hover']). Union-matched.",
      },
    },
    additionalProperties: false,
    description: "Fetch the semantic UI-role palette, optionally filtered by role name.",
  },
  handler: async (input, ctx) => {
    const all: ColorEntry[] = Object.values(ctx.manifest.colorRoles.roles).flat();
    if (!input.roles || input.roles.length === 0) return { roles: all };
    const wanted = new Set(input.roles);
    return { roles: all.filter((e) => e.roles.some((r) => wanted.has(r))) };
  },
});
```

- [ ] **Step 4: Run**

Run: `bun test test/tools/get-color-roles.test.ts`
Expected: `5 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-color-roles.ts test/tools/get-color-roles.test.ts
git commit -m "$(cat <<'EOF'
feat: add get_color_roles tool

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: `find_brand_logo` tool

**Files:**
- Create: `src/tools/find-brand-logo.ts`
- Create: `test/tools/find-brand-logo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/tools/find-brand-logo.test.ts
import { describe, it, expect } from "bun:test";
import { findBrandLogoTool } from "../../src/tools/find-brand-logo.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";

describe("find_brand_logo", () => {
  const ctx = () => makeTestContext(bundled as unknown as Manifest);

  it("rejects brand 'product-icons' with InvalidInput", async () => {
    await expect(
      findBrandLogoTool.handler({ brand: "product-icons" as never }, ctx()),
    ).rejects.toMatchObject({ code: "InvalidInput" });
  });

  it("raises UnknownBrand for unknown brand", async () => {
    await expect(
      findBrandLogoTool.handler({ brand: "zzz" as never }, ctx()),
    ).rejects.toMatchObject({ code: "UnknownBrand" });
  });

  it("returns salesforce logos with fully-qualified SVG URLs", async () => {
    const r = await findBrandLogoTool.handler({ brand: "salesforce" }, ctx());
    expect(r.logos.length).toBeGreaterThan(0);
    for (const l of r.logos) {
      if (l.formats.svg) expect(l.formats.svg).toMatch(/^https:\/\/dam\.usefulto\.me\//);
    }
  });

  it("filters by background=dark", async () => {
    const r = await findBrandLogoTool.handler(
      { brand: "salesforce", background: "dark" },
      ctx(),
    );
    expect(r.logos.every((l) => l.background === "dark")).toBe(true);
  });

  it("preferred_only narrows to preferred=true", async () => {
    const r = await findBrandLogoTool.handler(
      { brand: "salesforce", preferred_only: true },
      ctx(),
    );
    expect(r.logos.every((l) => l.preferred)).toBe(true);
  });

  it("co_branded=true keeps only endorsed lockups", async () => {
    const r = await findBrandLogoTool.handler({ brand: "slack", co_branded: true }, ctx());
    expect(r.logos.every((l) => l.co_branded)).toBe(true);
  });

  it("sort order: preferred first", async () => {
    const r = await findBrandLogoTool.handler({ brand: "salesforce" }, ctx());
    const prefIdx = r.logos.findIndex((l) => l.preferred);
    expect(prefIdx).toBe(0);
  });

  it("has a description >= 200 chars", () => {
    expect(findBrandLogoTool.description.length).toBeGreaterThanOrEqual(200);
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/tools/find-brand-logo.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/tools/find-brand-logo.ts`**

```ts
/**
 * tools/find-brand-logo — Select brand-wordmark / lockup assets.
 *
 * Responsibility: filter a brand's logos by background, co_branded,
 * variant substring, and preferred_only. Sort preferred-first, then
 * background-match, then alphabetical.
 * Errors:
 *   - InvalidInput when brand is 'product-icons' (use find_product_icon).
 *   - UnknownBrand when brand is not in list_brands.
 * Dependencies: manifest/summary.ts, manifest/types.ts, errors.ts,
 *   tools/registry.ts.
 *
 * Selection rules enforced here:
 *   1. If background is given, exact match.
 *   2. If co_branded is given, exact match.
 *   3. If variant is given, case-insensitive substring match on .variant.
 *   4. If preferred_only is true, keep only preferred=true.
 *   5. Sort: preferred first, then background-match (when filter set),
 *      then alphabetical by name.
 *
 * See spec §2 (find_brand_logo).
 */

import { SfLogosError } from "../errors.js";
import { toAssetSummary } from "../manifest/summary.js";
import type { AssetSummary, Background, BrandId } from "../manifest/types.js";
import { defineTool } from "./registry.js";

interface Input {
  brand: BrandId;
  background?: Background;
  co_branded?: boolean;
  variant?: string;
  preferred_only?: boolean;
}
interface Output {
  logos: AssetSummary[];
}

const DESCRIPTION = [
  "Find brand wordmark or lockup assets for Salesforce, MuleSoft, Slack, Tableau,",
  "or Informatica. Required: `brand` (NOT 'product-icons' — use find_product_icon).",
  "Optional filters: `background` ('light'/'dark' — match the target slide surface),",
  "`co_branded` (true = Salesforce-endorsed lockups only), `variant` (substring on",
  "the asset's variant, e.g. 'Knockout'), `preferred_only` (only the default-choice",
  "asset). Results sorted preferred-first. Always prefer SVG (summary.preferred_format).",
  "Never recolor or distort — preserve the aspect_ratio supplied on each result.",
].join(" ");

export const findBrandLogoTool = defineTool<Input, Output>({
  name: "find_brand_logo",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      brand: {
        type: "string",
        description: "Brand id from list_brands (not 'product-icons').",
      },
      background: {
        type: "string",
        enum: ["light", "dark"],
        description: "Match the target surface.",
      },
      co_branded: {
        type: "boolean",
        description:
          "true = Salesforce-endorsed lockups only; false = exclude lockups. Omit for any.",
      },
      variant: {
        type: "string",
        description: "Case-insensitive substring on the asset's variant (e.g. 'Knockout').",
      },
      preferred_only: {
        type: "boolean",
        description: "Only assets with preferred=true.",
      },
    },
    required: ["brand"],
    additionalProperties: false,
    description: "Filter a brand's logos.",
  },
  handler: async (input, ctx) => {
    if (input.brand === "product-icons") {
      throw new SfLogosError(
        "InvalidInput",
        "find_brand_logo does not serve 'product-icons'. Use find_product_icon instead.",
        { brand: input.brand },
      );
    }
    const brand = ctx.manifest.brands.find((b) => b.id === input.brand);
    if (!brand) {
      throw new SfLogosError(
        "UnknownBrand",
        `Unknown brand '${input.brand}'. Call list_brands for valid ids.`,
        { brand: input.brand },
      );
    }

    let logos = brand.logos.slice();
    if (input.background !== undefined) {
      logos = logos.filter((l) => l.background === input.background);
    }
    if (input.co_branded !== undefined) {
      logos = logos.filter((l) => l.co_branded === input.co_branded);
    }
    if (input.variant !== undefined) {
      const needle = input.variant.toLowerCase();
      logos = logos.filter((l) => l.variant.toLowerCase().includes(needle));
    }
    if (input.preferred_only === true) {
      logos = logos.filter((l) => l.preferred);
    }

    const bg = input.background;
    logos.sort((a, b) => {
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      if (bg) {
        const aMatch = a.background === bg ? 0 : 1;
        const bMatch = b.background === bg ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      return a.name.localeCompare(b.name);
    });

    return { logos: logos.map((l) => toAssetSummary(l, brand)) };
  },
});
```

- [ ] **Step 4: Run**

Run: `bun test test/tools/find-brand-logo.test.ts`
Expected: `8 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/find-brand-logo.ts test/tools/find-brand-logo.test.ts
git commit -m "$(cat <<'EOF'
feat: add find_brand_logo tool

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: `find_product_icon` tool

**Files:**
- Create: `src/tools/find-product-icon.ts`
- Create: `test/tools/find-product-icon.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/tools/find-product-icon.test.ts
import { describe, it, expect } from "bun:test";
import { findProductIconTool } from "../../src/tools/find-product-icon.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";

describe("find_product_icon", () => {
  const ctx = () => makeTestContext(bundled as unknown as Manifest);

  it("rejects empty input with InvalidInput", async () => {
    await expect(findProductIconTool.handler({}, ctx())).rejects.toMatchObject({
      code: "InvalidInput",
    });
  });

  it("finds Agentforce by natural-language query", async () => {
    const r = await findProductIconTool.handler({ query: "autonomous AI agent" }, ctx());
    expect(r.icons.length).toBeGreaterThan(0);
    expect(r.icons[0]!.id).toBe("icon-agentforce");
    expect(r.icons[0]!.match_score).toBeGreaterThan(0);
  });

  it("filters by category alone", async () => {
    const r = await findProductIconTool.handler({ category: "AI" }, ctx());
    expect(r.icons.length).toBeGreaterThan(0);
    expect(r.icons.every((i) => i.category === "AI")).toBe(true);
  });

  it("ANDs query with filters", async () => {
    const r = await findProductIconTool.handler(
      { query: "einstein", category: "AI" },
      ctx(),
    );
    expect(r.icons.every((i) => i.category === "AI")).toBe(true);
  });

  it("limit clamps to max 90", async () => {
    const r = await findProductIconTool.handler({ category: "AI", limit: 1000 }, ctx());
    expect(r.icons.length).toBeLessThanOrEqual(90);
  });

  it("match_score is omitted when no query", async () => {
    const r = await findProductIconTool.handler({ category: "AI" }, ctx());
    expect(r.icons[0]!.match_score).toBeUndefined();
  });

  it("keywords filter is case-insensitive and ANDs all", async () => {
    const r = await findProductIconTool.handler({ keywords: ["AI", "AGENT"] }, ctx());
    expect(r.icons.length).toBeGreaterThan(0);
    for (const i of r.icons) {
      const lower = i.keywords.map((k) => k.toLowerCase());
      expect(lower).toContain("ai");
      expect(lower).toContain("agent");
    }
  });

  it("has a description >= 200 chars", () => {
    expect(findProductIconTool.description.length).toBeGreaterThanOrEqual(200);
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/tools/find-product-icon.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/tools/find-product-icon.ts`**

```ts
/**
 * tools/find-product-icon — Search Salesforce 2D product icons.
 *
 * Responsibility: scored search + filter. Requires at least one of
 * `query`, `category`, `keywords`, or `background`. When `query` is
 * present, results are ranked; otherwise alphabetical.
 * Errors: InvalidInput when none of the above are supplied.
 * Dependencies: manifest/summary.ts, search/tokenize.ts, search/score.ts,
 *   errors.ts, tools/registry.ts.
 *
 * Scoring (spec §2):
 *   +3 per exact or word-boundary keyword match
 *   +2 per name substring match
 *   +1 per product_description or use_case substring match
 *
 * See spec §2 (find_product_icon).
 */

import { SfLogosError } from "../errors.js";
import { toAssetSummary } from "../manifest/summary.js";
import type { AssetSummary, Background, ProductIconCategory } from "../manifest/types.js";
import { scoreLogo } from "../search/score.js";
import { tokenize } from "../search/tokenize.js";
import { defineTool } from "./registry.js";

interface Input {
  query?: string;
  category?: ProductIconCategory;
  keywords?: string[];
  background?: Background;
  limit?: number;
}
interface Output {
  icons: AssetSummary[];
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 90;

const DESCRIPTION = [
  "Search Salesforce 2D product icons. You MUST provide at least one of:",
  "`query` (natural language — scored across keywords, name, description, use_cases),",
  "`category` (one of AI | CRM | Platform | Data | Industries | Marketing | Service | Security),",
  "`keywords` (list — ALL must appear as keywords on the asset, case-insensitive),",
  "`background` ('light'/'dark'). Filters are ANDed. `limit` defaults to 10, max 90.",
  "Prefer SVG (summary.preferred_format). All 90 icons are square (is_square=true).",
  "Passing no filters raises InvalidInput.",
].join(" ");

export const findProductIconTool = defineTool<Input, Output>({
  name: "find_product_icon",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Natural-language search string." },
      category: {
        type: "string",
        enum: ["AI", "CRM", "Platform", "Data", "Industries", "Marketing", "Service", "Security"],
        description: "Product-icon category.",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "Case-insensitive exact-token match — every listed keyword must appear on the asset.",
      },
      background: {
        type: "string",
        enum: ["light", "dark"],
        description: "Target surface.",
      },
      limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
    },
    additionalProperties: false,
    description: "Find product icons by query, category, keywords, and/or background.",
  },
  handler: async (input, ctx) => {
    if (
      input.query === undefined &&
      input.category === undefined &&
      input.keywords === undefined &&
      input.background === undefined
    ) {
      throw new SfLogosError(
        "InvalidInput",
        "find_product_icon requires at least one of query, category, keywords, or background.",
        {},
      );
    }
    const brand = ctx.manifest.brands.find((b) => b.id === "product-icons");
    if (!brand) return { icons: [] };

    let candidates = brand.logos.slice();
    if (input.category !== undefined) {
      candidates = candidates.filter((l) => l.category === input.category);
    }
    if (input.background !== undefined) {
      candidates = candidates.filter((l) => l.background === input.background);
    }
    if (input.keywords !== undefined && input.keywords.length > 0) {
      const wanted = input.keywords.map((k) => k.toLowerCase());
      candidates = candidates.filter((l) => {
        const lower = l.keywords.map((k) => k.toLowerCase());
        return wanted.every((w) => lower.includes(w));
      });
    }

    const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);

    if (input.query !== undefined && input.query.trim().length > 0) {
      const tokens = tokenize(input.query);
      const scored = candidates
        .map((l) => ({ logo: l, score: scoreLogo(l, tokens) }))
        .filter((s) => s.score > 0)
        .sort((a, b) =>
          b.score !== a.score ? b.score - a.score : a.logo.name.localeCompare(b.logo.name),
        )
        .slice(0, limit);
      return {
        icons: scored.map((s) => ({
          ...toAssetSummary(s.logo, brand),
          match_score: s.score,
        })),
      };
    }

    candidates.sort((a, b) => a.name.localeCompare(b.name));
    return {
      icons: candidates.slice(0, limit).map((l) => toAssetSummary(l, brand)),
    };
  },
});

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}
```

- [ ] **Step 4: Run**

Run: `bun test test/tools/find-product-icon.test.ts`
Expected: `8 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/find-product-icon.ts test/tools/find-product-icon.test.ts
git commit -m "$(cat <<'EOF'
feat: add find_product_icon tool (scored + filtered)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: `server.ts` — MCP stdio transport and dispatcher

**Files:**
- Create: `src/server.ts`
- Create: `test/server.test.ts`

- [ ] **Step 1: Write the failing test (dispatcher unit; e2e test in Task 26)**

```ts
// test/server.test.ts
import { describe, it, expect } from "bun:test";
import { buildServer } from "../src/server.js";
import bundled from "../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../src/manifest/types.js";
import { createLogger } from "../src/observability/logger.js";
import { createCounters } from "../src/observability/counters.js";

function deps() {
  return {
    manifest: bundled as unknown as Manifest,
    logger: createLogger({ level: "error", format: "human", stderr: () => {} }),
    counters: createCounters(),
  };
}

describe("server dispatcher", () => {
  it("lists six tools", async () => {
    const s = buildServer(deps());
    const names = s.listTools().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_brands",
        "find_brand_logo",
        "find_product_icon",
        "get_brand_colors",
        "get_color_roles",
      ]),
    );
    expect(names.length).toBe(5); // fetch_asset arrives in phase 2
  });

  it("dispatches list_brands and mints a req_id in the log", async () => {
    const lines: string[] = [];
    const deps2 = { ...deps(), logger: createLogger({ level: "info", format: "json", stderr: (l) => lines.push(l) }) };
    const s = buildServer(deps2);
    const result = await s.dispatch("list_brands", {});
    expect((result as { brands: unknown[] }).brands.length).toBe(6);
    const toolCallLine = lines.find((l) => l.includes('"event":"tool.call"'));
    expect(toolCallLine).toBeTruthy();
    expect(toolCallLine).toMatch(/"req_id":"[0-9a-f]{8}"/);
  });

  it("maps SfLogosError to a structured error response", async () => {
    const s = buildServer(deps());
    await expect(s.dispatch("get_brand_colors", { brand_id: "bogus" })).rejects.toMatchObject({
      code: "UnknownBrand",
    });
  });

  it("wraps unexpected exceptions as InvalidInput internal error", async () => {
    const deps2 = deps();
    // sabotage: corrupt manifest so a tool throws an unexpected error
    const s = buildServer({ ...deps2, manifest: {} as Manifest });
    await expect(s.dispatch("list_brands", {})).rejects.toMatchObject({
      code: "InvalidInput",
    });
  });
});
```

- [ ] **Step 2: Run**

Run: `bun test test/server.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/server.ts`**

```ts
/**
 * server — MCP stdio plumbing and top-level tool dispatcher.
 *
 * Responsibility: collect every tool, register them with the MCP SDK,
 * and route incoming JSON-RPC calls into handlers. Mints req_id,
 * emits observability events, maps SfLogosError → structured error,
 * wraps unexpected exceptions.
 * Dependencies: @modelcontextprotocol/sdk, every tools/*.ts, observability/*.ts.
 *
 * See spec §5.1 and §5.2.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SfLogosError } from "./errors.js";
import type { Manifest } from "./manifest/types.js";
import type { Counters } from "./observability/counters.js";
import { ev } from "./observability/events.js";
import type { Logger } from "./observability/logger.js";
import { newReqId } from "./observability/req-id.js";
import { findBrandLogoTool } from "./tools/find-brand-logo.js";
import { findProductIconTool } from "./tools/find-product-icon.js";
import { getBrandColorsTool } from "./tools/get-brand-colors.js";
import { getColorRolesTool } from "./tools/get-color-roles.js";
import { listBrandsTool } from "./tools/list-brands.js";
import type { Tool, ToolContext } from "./tools/registry.js";

export const ALL_TOOLS: Tool[] = [
  listBrandsTool as Tool,
  findBrandLogoTool as Tool,
  findProductIconTool as Tool,
  getBrandColorsTool as Tool,
  getColorRolesTool as Tool,
];

export interface ServerDeps {
  manifest: Manifest;
  logger: Logger;
  counters: Counters;
}

export interface DispatchableServer {
  listTools(): Tool[];
  dispatch(name: string, input: unknown): Promise<unknown>;
  mcp: Server;
}

/** Build a server ready to bind to a transport. */
export function buildServer(deps: ServerDeps): DispatchableServer {
  const tools = ALL_TOOLS;
  const index = new Map(tools.map((t) => [t.name, t]));

  async function dispatch(name: string, input: unknown): Promise<unknown> {
    const tool = index.get(name);
    if (!tool) {
      throw new SfLogosError("InvalidInput", `Unknown tool '${name}'.`, { tool: name });
    }
    const reqId = newReqId();
    const started = Date.now();
    const ctx: ToolContext = {
      manifest: deps.manifest,
      logger: deps.logger,
      reqId,
      counters: deps.counters,
    };
    deps.logger.emit(ev.toolInput({ tool: tool.name, req_id: reqId, input }));
    try {
      const output = await tool.handler(input as never, ctx);
      deps.counters.toolCall(tool.name);
      const resultCount =
        typeof output === "object" && output !== null
          ? inferResultCount(output as Record<string, unknown>)
          : undefined;
      deps.logger.emit(
        ev.toolCall({
          tool: tool.name,
          req_id: reqId,
          duration_ms: Date.now() - started,
          ...(resultCount !== undefined ? { result_count: resultCount } : {}),
        }),
      );
      deps.logger.emit(ev.toolOutput({ tool: tool.name, req_id: reqId, output }));
      return output;
    } catch (err) {
      if (err instanceof SfLogosError) {
        deps.counters.toolError(tool.name, err.code);
        deps.logger.emit(
          ev.toolCall({
            tool: tool.name,
            req_id: reqId,
            duration_ms: Date.now() - started,
            error_code: err.code,
          }),
        );
        throw err;
      }
      const stack = err instanceof Error ? (err.stack ?? "") : String(err);
      deps.logger.emit(
        ev.internalError({
          message: err instanceof Error ? err.message : String(err),
          stack,
          req_id: reqId,
          tool: tool.name,
        }),
      );
      throw new SfLogosError("InvalidInput", "internal error", { tool: tool.name });
    }
  }

  const mcp = new Server(
    { name: "sf-logos-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      const result = await dispatch(req.params.name, req.params.arguments ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (err) {
      if (err instanceof SfLogosError) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: { code: err.code, message: err.message, details: err.details ?? {} },
              }),
            },
          ],
        };
      }
      throw err;
    }
  });

  return { listTools: () => tools, dispatch, mcp };
}

function inferResultCount(o: Record<string, unknown>): number | undefined {
  for (const k of ["brands", "logos", "icons", "roles"]) {
    const v = o[k];
    if (Array.isArray(v)) return v.length;
  }
  return undefined;
}

/** Default entry: build the server, bind stdio, and run. */
export async function main(): Promise<void> {
  const { loadManifest } = await import("./manifest/loader.js");
  const { createLogger } = await import("./observability/logger.js");
  const { createCounters } = await import("./observability/counters.js");

  const level = (process.env["SFL_LOG"] ?? "info") as "debug" | "info" | "warn" | "error";
  const format = (process.env["SFL_LOG_FORMAT"] ?? "human") as "human" | "json";
  const filePath = process.env["SFL_LOG_FILE"];
  const logger = createLogger({
    level,
    format,
    ...(filePath !== undefined ? { filePath } : {}),
  });
  const counters = createCounters();

  logger.emit(
    ev.serverStart({
      version: "0.1.0",
      node_version: process.version,
      pid: process.pid,
    }),
  );

  const startupStarted = Date.now();
  const { manifest, source } = await loadManifest({ logger });
  const server = buildServer({ manifest, logger, counters });

  const transport = new StdioServerTransport();
  await server.mcp.connect(transport);

  logger.emit(
    ev.serverReady({
      tool_count: server.listTools().length,
      manifest_source: source,
      manifest_version: manifest.lastUpdated,
      startup_ms: Date.now() - startupStarted,
    }),
  );
}
```

- [ ] **Step 4: Run**

Run: `bun test test/server.test.ts`
Expected: `4 pass`.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts test/server.test.ts
git commit -m "$(cat <<'EOF'
feat: add MCP server plumbing with tool dispatcher and observability

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 25: `bin/sf-logos-mcp` launcher

**Files:**
- Create: `bin/sf-logos-mcp`

- [ ] **Step 1: Write the launcher**

```javascript
#!/usr/bin/env node
// bin/sf-logos-mcp — launcher for the compiled MCP server.
//
// Keeps the published shim tiny: imports the built server and runs it.
// Compilation outputs live under dist/, so this path is relative to the
// package root.

import { main } from "../dist/src/server.js";

main().catch((err) => {
  // Final fallback: emit a minimal error to stderr so the host sees
  // something rather than a silent crash. Structured logging inside
  // main() already handles the typical cases.
  process.stderr.write(
    `[sf-logos-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x bin/sf-logos-mcp`

- [ ] **Step 3: Build and run the shim once as a smoke test**

```bash
bun run build
node bin/sf-logos-mcp </dev/null &
sleep 0.5
kill $!
```

Expected: the server starts, logs `server.start` / `server.ready` to stderr, then is killed. If it errors out, the stderr message tells you what went wrong.

- [ ] **Step 4: Commit**

```bash
git add bin/sf-logos-mcp
git commit -m "$(cat <<'EOF'
feat: add bin/sf-logos-mcp launcher shim

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 26: End-to-end server test over stdio

**Files:**
- Create: `test/server.e2e.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server.e2e.test.ts
import { describe, it, expect } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";

function rpc(id: number, method: string, params?: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) + "\n";
}

describe("server e2e over stdio", () => {
  it("lists exactly 5 tools and calls list_brands", async () => {
    const child = spawn("node", ["bin/sf-logos-mcp"], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    const stderr: Buffer[] = [];
    child.stderr.on("data", (c: Buffer) => stderr.push(c));

    // Initialize handshake required by MCP.
    child.stdin.write(
      rpc(1, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      }),
    );
    await waitFor(() => chunks.some((c) => c.toString().includes('"id":1')), 3000);

    child.stdin.write(rpc(2, "tools/list"));
    await waitFor(() => chunks.some((c) => c.toString().includes('"id":2')), 3000);

    child.stdin.write(rpc(3, "tools/call", { name: "list_brands", arguments: {} }));
    await waitFor(() => chunks.some((c) => c.toString().includes('"id":3')), 3000);

    child.kill();
    await once(child, "exit");

    const all = Buffer.concat(chunks).toString();
    const toolsListResp = findResponse(all, 2);
    expect(toolsListResp?.result?.tools).toHaveLength(5);
    const callResp = findResponse(all, 3);
    const text = callResp?.result?.content?.[0]?.text as string;
    const parsed = JSON.parse(text) as { brands: unknown[] };
    expect(parsed.brands).toHaveLength(6);
  });
});

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!pred()) {
    if (Date.now() - started > timeoutMs) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

function findResponse(out: string, id: number): { result?: { tools?: unknown[]; content?: Array<{ text: string }> } } | undefined {
  for (const line of out.split(/\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as { id?: number; result?: unknown };
      if (parsed.id === id) return parsed as never;
    } catch {
      // not JSON — skip
    }
  }
  return undefined;
}
```

- [ ] **Step 2: Build and run**

Run: `bun run build && bun test test/server.e2e.test.ts`
Expected: `1 pass`.

- [ ] **Step 3: Commit**

```bash
git add test/server.e2e.test.ts
git commit -m "$(cat <<'EOF'
test: add end-to-end server test over stdio

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 27: Verify and harden `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Review current `.gitignore`**

Run: `cat .gitignore`
Confirm that `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `.env`, `.env.*` are present (added in the pages migration). If any are missing, append them.

- [ ] **Step 2: Verify the ignored tree stays ignored**

```bash
git check-ignore node_modules dist coverage .env 2>/dev/null || true
ls -1 node_modules 2>/dev/null | head -1
```

Expected: `node_modules` exists but `git status --short node_modules` is empty.

- [ ] **Step 3: If any change was required, commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore: verify .gitignore covers MCP build artifacts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no change was required, skip the commit and move on.

---

## Task 28: Phase-1 CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install
        run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

      - name: Typecheck
        run: bun run typecheck

      - name: Build
        run: bun run build

      - name: Unit & integration tests (Bun, with coverage)
        run: bun test --coverage

      - name: Server e2e under Node
        run: |
          set -euo pipefail
          # minimal manual invocation: list_brands via stdio
          printf '%s\n' \
            '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"ci","version":"0"}}}' \
            '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
            '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_brands","arguments":{}}}' \
          | timeout 10 node bin/sf-logos-mcp \
          | tee /tmp/rpc.out \
          | grep -q '"brands"' || { echo "list_brands did not return brands[]"; exit 1; }
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: add phase-1 CI (lint, typecheck, build, test, e2e)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 29: Phase-1 smoke script

**Files:**
- Create: `scripts/phase1-smoke.sh`
- Modify: `package.json` (add `phase1:smoke` script)

- [ ] **Step 1: Write the smoke script**

```bash
#!/usr/bin/env bash
# phase1-smoke.sh
#
# Boots the compiled MCP server, issues one call per phase-1 tool,
# prints summarized results. Useful before tagging a release or
# merging a branch.
#
# Usage: bun run phase1:smoke

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f dist/src/server.js ]; then
  echo "dist/ is missing; running bun run build first"
  bun run build
fi

REQUESTS=$(cat <<'JSON'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_brands","arguments":{}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_brand_colors","arguments":{"brand_id":"salesforce"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_color_roles","arguments":{"roles":["primary"]}}}
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"find_brand_logo","arguments":{"brand":"salesforce","preferred_only":true}}}
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"find_product_icon","arguments":{"query":"autonomous AI agent","limit":3}}}
JSON
)

OUTPUT=$(printf "%s\n" "$REQUESTS" | timeout 15 node bin/sf-logos-mcp)

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
check 2 '"tools"'
check 3 '"brands"'
check 4 '"colors"'
check 5 '"roles"'
check 6 '"logos"'
check 7 'icon-agentforce'

echo "phase1 smoke: $pass pass / $fail fail"
exit "$fail"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/phase1-smoke.sh`

- [ ] **Step 3: Add the npm script**

In `package.json` `scripts`, add one line after `test:node`:

```json
    "phase1:smoke": "bash scripts/phase1-smoke.sh",
```

- [ ] **Step 4: Run it locally**

Run: `bun run phase1:smoke`
Expected: "phase1 smoke: 6 pass / 0 fail".

- [ ] **Step 5: Commit**

```bash
git add scripts/phase1-smoke.sh package.json
git commit -m "$(cat <<'EOF'
test: add phase-1 end-to-end smoke script

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 Completion Checklist

After all tasks land, verify end-to-end:

- [ ] `bun install` → clean
- [ ] `bun run lint` → 0 errors
- [ ] `bun run typecheck` → 0 errors
- [ ] `bun run build` → `dist/` populated
- [ ] `bun test` → 60+ tests pass, 0 fail
- [ ] `bun test --coverage` → line coverage ≥ 90 % on `src/**/*.ts` (excluding `server.ts`)
- [ ] `bun run phase1:smoke` → 6 pass / 0 fail
- [ ] `.github/workflows/ci.yml` green on a draft PR

At that point, phase 1 is done: you have an installable, observable MCP server with five working tools. `fetch_asset`, on-disk cache, dimension math, diagnostics tool, and the full CI/docs suite come in phases 2 and 3.
