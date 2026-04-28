import { describe, it, expect } from "bun:test";
import { ev } from "../../src/observability/events.js";

describe("Event constructors", () => {
  it("serverStart carries version, node_version, pid at info", () => {
    const e = ev.serverStart({ version: "0.1.0", node_version: "v20", pid: 1 });
    expect(e.event).toBe("server.start");
    expect(e.level).toBe("info");
    expect(e["version"]).toBe("0.1.0");
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
    expect(e["reason"]).toBe("timeout");
  });

  it("internalError is error-level with stack", () => {
    const e = ev.internalError({ message: "boom", stack: "..." });
    expect(e.level).toBe("error");
  });

  it("advisoryEmitted is debug-level with tool and code", () => {
    const e = ev.advisoryEmitted({
      tool: "find_brand_logo",
      code: "only_co_branded_for_requested_background",
    });
    expect(e.event).toBe("advisory.emitted");
    expect(e.level).toBe("debug");
    expect(e["tool"]).toBe("find_brand_logo");
    expect(e["code"]).toBe("only_co_branded_for_requested_background");
  });
});
