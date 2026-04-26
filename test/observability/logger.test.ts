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
    const parsed = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
    expect(parsed["event"]).toBe("server.start");
    expect(parsed["level"]).toBe("info");
    expect(typeof parsed["ts"]).toBe("string");
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

describe("Logger — file sink (async stream)", () => {
  it("writes emitted lines to the configured file path", async () => {
    const tmpPath = `/tmp/sf-logos-test-${String(process.pid)}-${String(Date.now())}.log`;
    const log = createLogger({
      level: "info",
      format: "human",
      stderr: () => undefined,
      filePath: tmpPath,
    });
    log.emit({ event: "server.start", level: "info", version: "0.0.0", pid: 1, node_version: "v20" });
    log.emit({
      event: "server.ready",
      level: "info",
      tool_count: 6,
      manifest_source: "live",
      manifest_version: "x",
      startup_ms: 1,
    });
    await log.flush();
    const { readFileSync, unlinkSync } = await import("node:fs");
    const content = readFileSync(tmpPath, "utf8");
    try {
      expect(content).toContain("server.start");
      expect(content).toContain("server.ready");
      const lineCount = content.split("\n").filter((l) => l.length > 0).length;
      expect(lineCount).toBe(2);
    } finally {
      unlinkSync(tmpPath);
      await log.close();
    }
  });
});
