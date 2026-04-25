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
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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
      const stack = err instanceof Error ? err.stack ?? "" : String(err);
      const message = err instanceof Error ? err.message : String(err);
      deps.logger.emit(
        ev.internalError({
          message,
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

  mcp.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve({
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }),
  );

  mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      const result = await dispatch(req.params.name, req.params.arguments ?? {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      if (err instanceof SfLogosError) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
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

  const rawLevel = process.env["SFL_LOG"];
  const level: "debug" | "info" | "warn" | "error" =
    rawLevel === "debug" || rawLevel === "info" || rawLevel === "warn" || rawLevel === "error"
      ? rawLevel
      : "info";
  const format: "human" | "json" = process.env["SFL_LOG_FORMAT"] === "json" ? "json" : "human";
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
