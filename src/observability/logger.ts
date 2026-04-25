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
