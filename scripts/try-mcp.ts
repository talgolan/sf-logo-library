#!/usr/bin/env bun
/**
 * try-mcp.ts — regression test suite + interactive exploration harness.
 *
 * This file has two related jobs:
 *
 *   1. **Regression test suite.** The SCENARIOS array is an assertive
 *      end-to-end contract test. Each scenario carries an `expect` (for
 *      success paths) or `expectError` (for error paths). Run in CI via
 *      `bun run try:check`. Fails loudly on mismatch. Add a scenario
 *      whenever a new tool, a new filter, or a new error code lands.
 *
 *   2. **Interactive exploration.** `bun run try --call <tool> --input
 *      '{...}'` runs a single tool with arbitrary inputs and prints the
 *      parsed response. No assertions — the human decides what "right"
 *      means. Use this when trying inputs not yet represented in the
 *      regression suite.
 *
 * Both modes use the same code path to talk to the server (the official
 * MCP SDK's StdioClientTransport), so a regression test failure means
 * a real user-facing regression, not a harness-specific quirk.
 *
 * Usage:
 *   bun run try                           # run regression suite with full output
 *   bun run try --check                   # regression suite, terse output (CI)
 *   bun run try --list                    # just print the five tool names
 *   bun run try --call list_brands
 *   bun run try --call find_product_icon --input '{"query":"CRM"}'
 *   bun run try --raw                     # include the full MCP envelope
 *
 * Exit codes:
 *   0  — every scenario passed (or --list / --call succeeded)
 *   1  — at least one scenario failed, or a fatal error occurred
 *
 * Prereqs: `bun run build` must have produced dist/src/server.js. The
 * harness builds automatically if dist/ is missing.
 *
 * Not in `package.json#files` — dev-only.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const SERVER_ENTRY = resolve(REPO_ROOT, "dist/src/server.js");
const SERVER_BIN = resolve(REPO_ROOT, "bin/sf-logos-mcp");

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

interface Opts {
  list: boolean;
  raw: boolean;
  check: boolean;
  call: string | null;
  input: Record<string, unknown> | null;
}

function parseArgs(argv: string[]): Opts {
  const opts: Opts = {
    list: false,
    raw: false,
    check: false,
    call: null,
    input: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") opts.list = true;
    else if (a === "--raw") opts.raw = true;
    else if (a === "--check") opts.check = true;
    else if (a === "--call") opts.call = argv[++i] ?? null;
    else if (a === "--input") {
      const raw = argv[++i];
      if (raw === undefined) throw new Error("--input requires a JSON string");
      opts.input = JSON.parse(raw) as Record<string, unknown>;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${a ?? ""}`);
    }
  }
  return opts;
}

function printHelp(): void {
  process.stdout.write(`
try-mcp.ts — sf-logos MCP regression suite + exploration harness

USAGE
  bun run try                                   # regression suite, full output
  bun run try --check                           # regression suite, terse (CI-friendly)
  bun run try --list                            # just list the five tools
  bun run try --call <name>                     # exploration: one tool, no args
  bun run try --call <name> --input '{...}'     # exploration: one tool, with args
  bun run try --raw                             # include the full MCP envelope

EXAMPLES
  bun run try --check
  bun run try --call list_brands
  bun run try --call get_brand_colors --input '{"brand_id":"slack"}'
  bun run try --call find_product_icon --input '{"query":"agent","limit":3}'

ENV
  SFL_LOG=debug   to see every event the server emits on stderr

EXIT CODE
  0 on success; 1 if any scenario failed (regression mode) or a fatal error
  occurred.
`);
}

// ---------------------------------------------------------------------------
// Build + connect
// ---------------------------------------------------------------------------

function ensureBuilt(): void {
  if (existsSync(SERVER_ENTRY)) return;
  process.stderr.write("[try-mcp] dist/ missing — running `bun run build`…\n");
  const result = spawnSync("bun", ["run", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`bun run build failed with exit ${String(result.status)}`);
  }
}

async function connect(suppressServerStderr: boolean): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_BIN],
    env: { ...process.env } as Record<string, string>,
    // In --check (CI) mode we want clean output — swallow the server's
    // info-level startup logs. In interactive modes, keep them visible
    // so the user sees req_id threading.
    stderr: suppressServerStderr ? "ignore" : "inherit",
  });
  const client = new Client(
    { name: "try-mcp", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface TextContent {
  type: "text";
  text: string;
}
interface ToolCallResponse {
  isError?: boolean;
  content?: TextContent[];
}

function parseToolResponse(resp: ToolCallResponse): unknown {
  const first = resp.content?.[0];
  if (!first || first.type !== "text") {
    throw new Error(`unexpected response shape: ${JSON.stringify(resp).slice(0, 200)}`);
  }
  return JSON.parse(first.text);
}

interface ErrorPayload {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

function parseErrorResponse(resp: ToolCallResponse): ErrorPayload["error"] {
  return (parseToolResponse(resp) as ErrorPayload).error;
}

// ---------------------------------------------------------------------------
// Scenario shape — the contract this harness defends
// ---------------------------------------------------------------------------

/**
 * Each scenario describes ONE end-to-end call we expect to work (or fail
 * with a specific code) forever, until the spec changes. Adding scenarios:
 *
 *   - Success case: provide `expect(output)` that throws on any shape or
 *     contract violation. Keep assertions strict where the spec is strict
 *     (sort order, required fields, error codes), loose where the
 *     manifest may evolve cosmetically (exact hex values, keyword ordering).
 *
 *   - Error case: provide `expectError.code`. The runner verifies the
 *     response is isError=true with that exact SfLogosError code.
 *
 *   - Label: human-readable, one line, names both the input and the
 *     invariant being checked.
 */
interface Scenario {
  label: string;
  tool: string;
  input: Record<string, unknown>;
  expect?: (output: unknown) => void;
  expectError?: { code: string };
}

// Type guards to keep assertions concise.
function asObject(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new Error(`expected object, got ${JSON.stringify(v)?.slice(0, 80)}`);
  }
  return v as Record<string, unknown>;
}
function asArray<T = unknown>(v: unknown): T[] {
  if (!Array.isArray(v)) {
    throw new Error(`expected array, got ${JSON.stringify(v)?.slice(0, 80)}`);
  }
  return v as T[];
}
function asString(v: unknown, where: string): string {
  if (typeof v !== "string") {
    throw new Error(`${where}: expected string, got ${typeof v}`);
  }
  return v;
}
function isHex(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v);
}

const SCENARIOS: Scenario[] = [
  // ---------------------------------------------------------------- list_brands
  {
    label: "list_brands — 6 brands, known ids, disclaimer present",
    tool: "list_brands",
    input: {},
    expect: (out) => {
      const r = asObject(out);
      const brands = asArray<{ id: string; logo_count: number }>(r["brands"]);
      if (brands.length !== 6) throw new Error(`expected 6 brands, got ${brands.length}`);
      const ids = brands.map((b) => b.id).sort();
      const expected = [
        "informatica",
        "mulesoft",
        "product-icons",
        "salesforce",
        "slack",
        "tableau",
      ];
      if (JSON.stringify(ids) !== JSON.stringify(expected)) {
        throw new Error(`brand ids mismatch: ${JSON.stringify(ids)}`);
      }
      for (const b of brands) {
        if (b.logo_count <= 0) throw new Error(`${b.id} has logo_count=${b.logo_count}`);
      }
      asString(r["manifest_version"], "manifest_version");
      const disclaimer = asString(r["disclaimer"], "disclaimer");
      if (disclaimer.length < 50) throw new Error(`disclaimer too short (${disclaimer.length})`);
    },
  },

  // ---------------------------------------------------------- get_brand_colors
  {
    label: "get_brand_colors(salesforce) — returns hex palette",
    tool: "get_brand_colors",
    input: { brand_id: "salesforce" },
    expect: (out) => {
      const r = asObject(out);
      if (r["brand_id"] !== "salesforce") throw new Error(`brand_id mismatch`);
      asString(r["brand_name"], "brand_name");
      const colors = asObject(r["colors"]);
      if (!isHex(colors["primary"])) {
        throw new Error(`colors.primary is not a hex string: ${String(colors["primary"])}`);
      }
    },
  },
  {
    label: "get_brand_colors(slack) — different brand works, aubergine present",
    tool: "get_brand_colors",
    input: { brand_id: "slack" },
    expect: (out) => {
      const colors = asObject(asObject(out)["colors"]);
      if (!isHex(colors["aubergine"])) {
        throw new Error(`slack.aubergine missing or not hex`);
      }
    },
  },
  {
    label: "get_brand_colors(bogus) → UnknownBrand",
    tool: "get_brand_colors",
    input: { brand_id: "bogus" },
    expectError: { code: "UnknownBrand" },
  },

  // ---------------------------------------------------------- get_color_roles
  {
    label: "get_color_roles() — returns exactly 22 curated swatches",
    tool: "get_color_roles",
    input: {},
    expect: (out) => {
      const roles = asArray<{ name: string; hex: string; roles: string[] }>(
        asObject(out)["roles"],
      );
      // The curated swatch count is a known quantity we want pinned — if
      // the manifest changes it, a tool description (and possibly the
      // docs) will be stale, so CI should force that review.
      if (roles.length !== 22) {
        throw new Error(`expected exactly 22 curated swatches, got ${roles.length}`);
      }
    },
  },
  {
    label: "get_color_roles({roles:['primary']}) — all results include 'primary'",
    tool: "get_color_roles",
    input: { roles: ["primary"] },
    expect: (out) => {
      const roles = asArray<{ roles: string[] }>(asObject(out)["roles"]);
      if (roles.length === 0) throw new Error(`expected at least one 'primary' swatch`);
      for (const r of roles) {
        if (!r.roles.includes("primary")) {
          throw new Error(`swatch ${JSON.stringify(r)} does not include 'primary'`);
        }
      }
    },
  },
  {
    label: "get_color_roles({roles:['nonexistent-xyz']}) — empty array (not error)",
    tool: "get_color_roles",
    input: { roles: ["nonexistent-xyz"] },
    expect: (out) => {
      const roles = asArray(asObject(out)["roles"]);
      if (roles.length !== 0) throw new Error(`expected empty array, got ${roles.length} items`);
    },
  },

  // ---------------------------------------------------------- find_brand_logo
  {
    label: "find_brand_logo(salesforce) — preferred-first sort",
    tool: "find_brand_logo",
    input: { brand: "salesforce" },
    expect: (out) => {
      const logos = asArray<{ preferred: boolean; formats: { svg: string | null } }>(
        asObject(out)["logos"],
      );
      if (logos.length === 0) throw new Error(`expected at least one logo`);
      if (!logos[0]?.preferred) {
        throw new Error(`expected first logo to have preferred=true`);
      }
      // URL pre-resolution check (spec §3): svg URL must be fully-qualified.
      for (const l of logos) {
        if (l.formats.svg !== null && !l.formats.svg.startsWith("https://dam.usefulto.me/")) {
          throw new Error(`svg URL not pre-resolved: ${l.formats.svg}`);
        }
      }
    },
  },
  {
    label: "find_brand_logo(salesforce, preferred_only=true) — narrows",
    tool: "find_brand_logo",
    input: { brand: "salesforce", preferred_only: true },
    expect: (out) => {
      const logos = asArray<{ preferred: boolean }>(asObject(out)["logos"]);
      if (logos.length === 0) throw new Error(`expected at least one preferred logo`);
      for (const l of logos) {
        if (!l.preferred) throw new Error(`preferred_only returned preferred=false`);
      }
    },
  },
  {
    label: "find_brand_logo(tableau, background=dark) — background filter applied",
    tool: "find_brand_logo",
    input: { brand: "tableau", background: "dark" },
    expect: (out) => {
      const logos = asArray<{ background: string }>(asObject(out)["logos"]);
      if (logos.length === 0) throw new Error(`expected at least one dark tableau asset`);
      for (const l of logos) {
        if (l.background !== "dark") {
          throw new Error(`background filter leaked: ${l.background}`);
        }
      }
    },
  },
  {
    label: "find_brand_logo(product-icons) → InvalidInput",
    tool: "find_brand_logo",
    input: { brand: "product-icons" },
    expectError: { code: "InvalidInput" },
  },
  {
    label: "find_brand_logo(bogus) → UnknownBrand",
    tool: "find_brand_logo",
    input: { brand: "bogus" },
    expectError: { code: "UnknownBrand" },
  },

  // ------------------------------------------------------- find_product_icon
  {
    label: "find_product_icon(query='autonomous AI agent') — Agentforce first with match_score",
    tool: "find_product_icon",
    input: { query: "autonomous AI agent", limit: 3 },
    expect: (out) => {
      const icons = asArray<{ id: string; match_score?: number; category: string | null }>(
        asObject(out)["icons"],
      );
      if (icons.length === 0) throw new Error(`expected at least one ranked result`);
      if (icons[0]?.id !== "icon-agentforce") {
        throw new Error(`expected icon-agentforce first, got ${icons[0]?.id ?? "?"}`);
      }
      if (typeof icons[0].match_score !== "number" || icons[0].match_score <= 0) {
        throw new Error(`expected positive match_score on first result`);
      }
      // Results must be sorted by match_score desc.
      for (let i = 1; i < icons.length; i++) {
        const a = icons[i - 1]?.match_score ?? 0;
        const b = icons[i]?.match_score ?? 0;
        if (b > a) throw new Error(`results not sorted by match_score desc`);
      }
    },
  },
  {
    label: "find_product_icon(category='Data') — category filter, no match_score",
    tool: "find_product_icon",
    input: { category: "Data", limit: 5 },
    expect: (out) => {
      const icons = asArray<{ category: string | null; match_score?: number }>(
        asObject(out)["icons"],
      );
      if (icons.length === 0) throw new Error(`expected at least one Data icon`);
      for (const i of icons) {
        if (i.category !== "Data") throw new Error(`category filter leaked: ${i.category}`);
        if (i.match_score !== undefined) {
          throw new Error(`match_score must be absent when no query is given`);
        }
      }
    },
  },
  {
    label: "find_product_icon(keywords=['AI','agent']) — AND semantics, case-insensitive",
    tool: "find_product_icon",
    input: { keywords: ["AI", "agent"], limit: 10 },
    expect: (out) => {
      const icons = asArray<{ keywords: string[] }>(asObject(out)["icons"]);
      if (icons.length === 0) throw new Error(`expected at least one match`);
      for (const i of icons) {
        const lower = i.keywords.map((k) => k.toLowerCase());
        if (!lower.includes("ai") || !lower.includes("agent")) {
          throw new Error(
            `keywords AND semantics violated — missing one of ai/agent in ${JSON.stringify(i.keywords)}`,
          );
        }
      }
    },
  },
  {
    label: "find_product_icon({}) → InvalidInput (at-least-one rule)",
    tool: "find_product_icon",
    input: {},
    expectError: { code: "InvalidInput" },
  },
  {
    label: "find_product_icon(limit=1000, category='AI') — limit clamped to ≤ 90",
    tool: "find_product_icon",
    input: { limit: 1000, category: "AI" },
    expect: (out) => {
      const icons = asArray(asObject(out)["icons"]);
      if (icons.length > 90) throw new Error(`limit not clamped: got ${icons.length}`);
    },
  },

  // -------------------- Dog-food-derived scenarios (2026-04-25) --------------------
  // These lock in behavior we observed working correctly in a live Claude Desktop
  // session. If a future change breaks them, CI catches it. See
  // docs/dogfood/2026-04-25-claude-desktop-transcript.md.
  {
    label: "Data Cloud rebrand: query 'Data Cloud' returns icon-data-cloud with name 'Data 360'",
    tool: "find_product_icon",
    input: { query: "Data Cloud" },
    expect: (out) => {
      const icons = asArray<{ id: string; name: string; match_score?: number }>(
        asObject(out)["icons"],
      );
      if (icons.length === 0) throw new Error(`expected at least one match for 'Data Cloud'`);
      const top = icons[0];
      if (!top) throw new Error("top result missing");
      if (top.id !== "icon-data-cloud") {
        throw new Error(`expected top id icon-data-cloud, got ${top.id}`);
      }
      if (top.name !== "Data 360") {
        throw new Error(`expected top name 'Data 360' (post-rebrand), got '${top.name}'`);
      }
      // Top hit should outscore every other result — confirms scoring ranks
      // the right asset first when a former name is queried.
      const topScore = top.match_score ?? 0;
      for (const other of icons.slice(1)) {
        if ((other.match_score ?? 0) > topScore) {
          throw new Error(`${other.id} outscored the top hit`);
        }
      }
    },
  },
  {
    label:
      "Slack dark-surface: all dark Slack results are co_branded=true (data gap documented in LEARNINGS)",
    tool: "find_brand_logo",
    input: { brand: "slack", background: "dark" },
    expect: (out) => {
      const logos = asArray<{ co_branded: boolean }>(asObject(out)["logos"]);
      if (logos.length === 0) {
        throw new Error(`expected at least one dark Slack asset`);
      }
      for (const l of logos) {
        if (!l.co_branded) {
          throw new Error(
            `dark Slack result has co_branded=false — if a standalone dark Slack mark was added, ` +
              `update LEARNINGS.md and the find_brand_logo description.`,
          );
        }
      }
    },
  },
  {
    label:
      "Agentforce single-icon invariant: keywords=['agentforce'] returns exactly 1 icon (sub-products share the parent mark per FY27)",
    tool: "find_product_icon",
    input: { keywords: ["agentforce"] },
    expect: (out) => {
      const icons = asArray<{ id: string }>(asObject(out)["icons"]);
      if (icons.length !== 1) {
        throw new Error(
          `expected exactly 1 Agentforce icon, got ${icons.length}. ` +
            `If sub-product icons were added to the manifest, this test needs updating.`,
        );
      }
      if (icons[0]?.id !== "icon-agentforce") {
        throw new Error(`expected icon-agentforce, got ${icons[0]?.id ?? "?"}`);
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface ScenarioResult {
  label: string;
  status: "pass" | "fail";
  error?: string;
  response?: unknown;
}

async function runProtocolCheck(client: Client): Promise<ScenarioResult> {
  const label = "protocol: tools/list returns 5 named tools with descriptions ≥ 100 chars";
  try {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    const expected = [
      "find_brand_logo",
      "find_product_icon",
      "get_brand_colors",
      "get_color_roles",
      "list_brands",
    ];
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error(`tools mismatch: ${JSON.stringify(names)}`);
    }
    for (const t of result.tools) {
      if (!t.description || t.description.length < 100) {
        throw new Error(`${t.name}: description too short (${t.description?.length ?? 0} chars)`);
      }
    }
    return { label, status: "pass" };
  } catch (err) {
    return { label, status: "fail", error: err instanceof Error ? err.message : String(err) };
  }
}

async function runScenario(client: Client, s: Scenario): Promise<ScenarioResult> {
  try {
    const resp = (await client.callTool({
      name: s.tool,
      arguments: s.input,
    })) as ToolCallResponse;

    if (s.expectError) {
      if (resp.isError !== true) {
        throw new Error(`expected isError=true with code=${s.expectError.code}, got success`);
      }
      const err = parseErrorResponse(resp);
      if (err?.code !== s.expectError.code) {
        throw new Error(`expected code=${s.expectError.code}, got code=${String(err?.code)}`);
      }
      return { label: s.label, status: "pass", response: resp };
    }

    if (resp.isError === true) {
      const err = parseErrorResponse(resp);
      throw new Error(
        `unexpected error response: code=${String(err?.code)} message=${String(err?.message)}`,
      );
    }

    const output = parseToolResponse(resp);
    if (s.expect) s.expect(output);
    return { label: s.label, status: "pass", response: output };
  } catch (err) {
    return {
      label: s.label,
      status: "fail",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function printResultLine(result: ScenarioResult): void {
  const badge = result.status === "pass" ? "[PASS]" : "[FAIL]";
  process.stdout.write(`${badge} ${result.label}\n`);
  if (result.status === "fail" && result.error !== undefined) {
    process.stdout.write(`       ${result.error}\n`);
  }
}

function hr(title: string): void {
  process.stdout.write(`\n${"=".repeat(80)}\n${title}\n${"=".repeat(80)}\n`);
}

async function runRegression(client: Client, opts: Opts): Promise<number> {
  const results: ScenarioResult[] = [];
  results.push(await runProtocolCheck(client));
  for (const s of SCENARIOS) {
    if (opts.check) {
      // Quiet mode: one line per scenario, no responses.
      const r = await runScenario(client, s);
      results.push(r);
      printResultLine(r);
    } else {
      // Full mode: header, response body, pass/fail line.
      hr(`${results.length === 0 ? "" : ""}${s.label}`);
      process.stdout.write(`→ ${s.tool}(${JSON.stringify(s.input)})\n\n`);
      const r = await runScenario(client, s);
      if (opts.raw && r.response !== undefined) {
        // --raw swaps the pretty response for the full envelope, but we
        // already parsed — fall back to pretty JSON so --raw stays useful.
        process.stdout.write(`${JSON.stringify(r.response, null, 2)}\n`);
      } else if (r.response !== undefined) {
        process.stdout.write(`${JSON.stringify(r.response, null, 2)}\n`);
      }
      printResultLine(r);
      results.push(r);
    }
  }
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  process.stdout.write(`\nregression: ${passed}/${results.length} pass / ${failed} fail\n`);
  return failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Interactive single-call mode (exploration only — no assertions)
// ---------------------------------------------------------------------------

async function runOne(
  client: Client,
  tool: string,
  input: Record<string, unknown>,
  raw: boolean,
): Promise<void> {
  hr(`${tool}(${JSON.stringify(input)})`);
  const resp = (await client.callTool({ name: tool, arguments: input })) as ToolCallResponse;
  if (raw) {
    process.stdout.write(`${JSON.stringify(resp, null, 2)}\n`);
    return;
  }
  if (resp.isError === true) {
    const err = parseErrorResponse(resp);
    process.stdout.write(
      `[ERROR] code=${String(err?.code)} message=${String(err?.message)}\n` +
        `        details=${JSON.stringify(err?.details ?? {})}\n`,
    );
    return;
  }
  process.stdout.write(`${JSON.stringify(parseToolResponse(resp), null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  ensureBuilt();
  const client = await connect(opts.check);
  try {
    if (opts.list) {
      hr("tools/list");
      const result = await client.listTools();
      for (const tool of result.tools) {
        process.stdout.write(`• ${tool.name}\n`);
        process.stdout.write(
          `    ${tool.description?.slice(0, 140) ?? ""}${
            (tool.description?.length ?? 0) > 140 ? "…" : ""
          }\n`,
        );
      }
      return;
    }
    if (opts.call !== null) {
      await runOne(client, opts.call, opts.input ?? {}, opts.raw);
      return;
    }
    const exitCode = await runRegression(client, opts);
    process.exitCode = exitCode;
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[try-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
