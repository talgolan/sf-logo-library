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
