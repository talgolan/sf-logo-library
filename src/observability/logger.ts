/**
 * observability/logger — Level-gated structured logger.
 *
 * Responsibility: format events into human or JSONL output; gate
 * printing by level; unconditionally capture events into the ring
 * buffer; optionally dual-write to a file via a persistent WriteStream.
 * Errors: none thrown (log failures must never break the server).
 * Dependencies: ring.ts; node:fs (for optional file sink).
 *
 * See spec §5.3.1–5.3.6.
 */

import { createWriteStream, type WriteStream } from "node:fs";
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
  flush(): Promise<void>;
  close(): Promise<void>;
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
  const ring: Ring<LogEvent> = createRing<LogEvent>(opts.ringCapacity ?? 200);

  let fileStream: WriteStream | null = null;
  if (opts.filePath !== undefined) {
    fileStream = createWriteStream(opts.filePath, { flags: "a", encoding: "utf8" });
    // Logger must never crash the server; swallow stream errors.
    fileStream.on("error", () => undefined);
  }

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
      if (fileStream !== null) {
        try {
          fileStream.write(line + "\n");
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
    flush() {
      const stream = fileStream;
      if (stream === null) return Promise.resolve();
      return new Promise<void>((resolve) => {
        // An empty write with a callback drains the pending queue — the
        // callback fires after everything already queued has been flushed
        // to the underlying fd.
        stream.write("", () => {
          resolve();
        });
      });
    },
    close() {
      const stream = fileStream;
      if (stream === null) return Promise.resolve();
      fileStream = null;
      return new Promise<void>((resolve) => {
        stream.end(() => {
          resolve();
        });
      });
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
