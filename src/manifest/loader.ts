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
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
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
  const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
  try {
    const resp = await fetchFn(LIVE_URL, {
      headers: { "User-Agent": ua },
      signal: controller.signal,
    });
    if (!resp.ok) {
      return fallback(`http_${String(resp.status)}`, started, opts.logger);
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
  if (!Array.isArray(m["brands"]) || (m["brands"] as unknown[]).length === 0) return false;
  for (const b of m["brands"] as unknown[]) {
    if (typeof b !== "object" || b === null) return false;
    const br = b as Record<string, unknown>;
    if (typeof br["id"] !== "string" || typeof br["name"] !== "string") return false;
    if (!Array.isArray(br["logos"])) return false;
  }
  return true;
}
