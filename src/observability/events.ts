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
import type { AdvisoryCode } from "../advisories.js";

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
  advisoryEmitted: (a: {
    tool: "find_brand_logo" | "find_product_icon";
    code: AdvisoryCode;
  }): LogEvent => ({ event: "advisory.emitted", level: "debug", ...a }),
};
