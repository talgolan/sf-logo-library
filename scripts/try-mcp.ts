#!/usr/bin/env bun
/**
 * try-mcp.ts — interactive-style harness for the sf-logos MCP server.
 *
 * Purpose: quickly exercise the built server from a real MCP client and
 * print the results, without pulling in the test runner. Useful for
 * exploring tool behavior, showing the server to someone, and spot-
 * checking changes without spinning up Claude Desktop.
 *
 * Usage:
 *   bun run scripts/try-mcp.ts              # runs every scenario below
 *   bun run scripts/try-mcp.ts --list       # just list the tools
 *   bun run scripts/try-mcp.ts --call list_brands
 *   bun run scripts/try-mcp.ts --call find_product_icon --input '{"query":"CRM"}'
 *   bun run scripts/try-mcp.ts --raw        # dump the full JSON response, not the parsed text
 *
 * Prereqs: `bun run build` must have produced dist/src/server.js.
 * The harness builds automatically if dist/ is missing.
 *
 * What this file is NOT:
 *   - A replacement for the Bun test suite under test/. That locks down
 *     contracts; this is for ad-hoc exploration.
 *   - Shipped to npm. It lives under scripts/, which is not in the
 *     package's `files` allowlist.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the server binary relative to this script's location so the
// harness works no matter where you invoke it from.
const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const SERVER_ENTRY = resolve(REPO_ROOT, "dist/src/server.js");
const SERVER_BIN = resolve(REPO_ROOT, "bin/sf-logos-mcp");

// ---------------------------------------------------------------------------
// CLI parsing — deliberately minimal; this is not a production CLI.
// ---------------------------------------------------------------------------

interface Opts {
  list: boolean;
  raw: boolean;
  call: string | null;
  input: Record<string, unknown> | null;
}

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { list: false, raw: false, call: null, input: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") opts.list = true;
    else if (a === "--raw") opts.raw = true;
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
try-mcp.ts — exercise the sf-logos MCP server

USAGE
  bun run scripts/try-mcp.ts                        # run every default scenario
  bun run scripts/try-mcp.ts --list                 # just list the tools
  bun run scripts/try-mcp.ts --call <name>          # call a tool with no args
  bun run scripts/try-mcp.ts --call <name> --input '{...}'
  bun run scripts/try-mcp.ts --raw                  # include the raw MCP envelope

EXAMPLES
  bun run scripts/try-mcp.ts --call list_brands
  bun run scripts/try-mcp.ts --call get_brand_colors --input '{"brand_id":"slack"}'
  bun run scripts/try-mcp.ts --call find_product_icon --input '{"query":"agent","limit":3}'
  bun run scripts/try-mcp.ts --call find_brand_logo --input '{"brand":"tableau","background":"dark"}'

ENV
  SFL_LOG=debug   to see every event the server emits on stderr
`);
}

// ---------------------------------------------------------------------------
// Ensure the build output exists before connecting.
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

// ---------------------------------------------------------------------------
// MCP client helpers.
// ---------------------------------------------------------------------------

async function connect(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_BIN],
    // Inherit env so SFL_LOG / SFL_LOG_FORMAT propagate if the user set them.
    env: { ...process.env } as Record<string, string>,
    // Keep the server's stderr visible to us — it's where the logs are.
    stderr: "inherit",
  });
  const client = new Client(
    { name: "try-mcp", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

/** A tool response with text content, as produced by our server. */
interface TextContent {
  type: "text";
  text: string;
}
interface ToolCallResponse {
  isError?: boolean;
  content?: TextContent[];
}

/** Parse the JSON blob our server stores in content[0].text. */
function parseToolResponse(resp: ToolCallResponse): unknown {
  const first = resp.content?.[0];
  if (!first || first.type !== "text") {
    throw new Error(`unexpected response shape: ${JSON.stringify(resp).slice(0, 200)}`);
  }
  return JSON.parse(first.text);
}

function hr(title: string): void {
  process.stdout.write(`\n${"=".repeat(80)}\n${title}\n${"=".repeat(80)}\n`);
}

// ---------------------------------------------------------------------------
// Default scenarios when no --call is passed.
// ---------------------------------------------------------------------------

interface Scenario {
  label: string;
  tool: string;
  input: Record<string, unknown>;
}

const SCENARIOS: Scenario[] = [
  { label: "list_brands — orientation call", tool: "list_brands", input: {} },
  {
    label: "get_brand_colors(salesforce) — brand palette",
    tool: "get_brand_colors",
    input: { brand_id: "salesforce" },
  },
  {
    label: "get_color_roles(['primary','hover']) — semantic UI swatches",
    tool: "get_color_roles",
    input: { roles: ["primary", "hover"] },
  },
  {
    label: "find_brand_logo(slack, dark) — Slack logo for a dark slide",
    tool: "find_brand_logo",
    input: { brand: "slack", background: "dark" },
  },
  {
    label: "find_product_icon('autonomous AI agent', limit 3) — scored search",
    tool: "find_product_icon",
    input: { query: "autonomous AI agent", limit: 3 },
  },
  {
    label: "find_product_icon(category=Data) — filter without query",
    tool: "find_product_icon",
    input: { category: "Data", limit: 5 },
  },
  {
    label: "find_brand_logo(product-icons) — expected InvalidInput",
    tool: "find_brand_logo",
    input: { brand: "product-icons" },
  },
  {
    label: "get_brand_colors(bogus) — expected UnknownBrand",
    tool: "get_brand_colors",
    input: { brand_id: "bogus" },
  },
];

async function runScenarios(client: Client, raw: boolean): Promise<void> {
  for (const s of SCENARIOS) {
    hr(s.label);
    process.stdout.write(`→ ${s.tool}(${JSON.stringify(s.input)})\n\n`);
    try {
      const resp = (await client.callTool({
        name: s.tool,
        arguments: s.input,
      })) as ToolCallResponse;
      if (raw) {
        process.stdout.write(`${JSON.stringify(resp, null, 2)}\n`);
        continue;
      }
      if (resp.isError === true) {
        const parsed = parseToolResponse(resp) as {
          error?: { code?: string; message?: string; details?: unknown };
        };
        process.stdout.write(
          `[ERROR] code=${parsed.error?.code ?? "?"} message=${parsed.error?.message ?? ""}\n` +
            `        details=${JSON.stringify(parsed.error?.details ?? {})}\n`,
        );
      } else {
        process.stdout.write(`${JSON.stringify(parseToolResponse(resp), null, 2)}\n`);
      }
    } catch (err) {
      process.stdout.write(
        `[THROW] ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Single-call mode (--call).
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
    const parsed = parseToolResponse(resp) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    process.stdout.write(
      `[ERROR] code=${parsed.error?.code ?? "?"} message=${parsed.error?.message ?? ""}\n` +
        `        details=${JSON.stringify(parsed.error?.details ?? {})}\n`,
    );
    return;
  }
  process.stdout.write(`${JSON.stringify(parseToolResponse(resp), null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  ensureBuilt();

  const client = await connect();
  try {
    if (opts.list) {
      hr("tools/list");
      const result = await client.listTools();
      for (const tool of result.tools) {
        process.stdout.write(`• ${tool.name}\n`);
        process.stdout.write(`    ${tool.description?.slice(0, 140) ?? ""}${
          (tool.description?.length ?? 0) > 140 ? "…" : ""
        }\n`);
      }
      return;
    }
    if (opts.call !== null) {
      await runOne(client, opts.call, opts.input ?? {}, opts.raw);
      return;
    }
    await runScenarios(client, opts.raw);
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
