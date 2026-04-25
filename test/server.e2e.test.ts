// test/server.e2e.test.ts
import { describe, it, expect } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";

function rpc(id: number, method: string, params?: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) + "\n";
}

describe("server e2e over stdio", () => {
  it("lists exactly 5 tools and calls list_brands", async () => {
    const child = spawn("node", ["bin/sf-logos-mcp"], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    const stderr: Buffer[] = [];
    child.stderr.on("data", (c: Buffer) => stderr.push(c));

    // Initialize handshake required by MCP.
    child.stdin.write(
      rpc(1, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      }),
    );
    await waitFor(() => chunks.some((c) => c.toString().includes('"id":1')), 5000);

    child.stdin.write(rpc(2, "tools/list"));
    await waitFor(() => chunks.some((c) => c.toString().includes('"id":2')), 5000);

    child.stdin.write(rpc(3, "tools/call", { name: "list_brands", arguments: {} }));
    await waitFor(() => chunks.some((c) => c.toString().includes('"id":3')), 5000);

    child.kill();
    await once(child, "exit");

    const all = Buffer.concat(chunks).toString();
    const toolsListResp = findResponse(all, 2);
    expect(toolsListResp?.result?.tools).toHaveLength(5);
    const callResp = findResponse(all, 3);
    const textContent = callResp?.result?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(textContent) as { brands: unknown[] };
    expect(parsed.brands).toHaveLength(6);
  }, 20_000);
});

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!pred()) {
    if (Date.now() - started > timeoutMs) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

interface RpcResponse {
  id?: number;
  result?: {
    tools?: unknown[];
    content?: Array<{ type: string; text: string }>;
  };
}

function findResponse(out: string, id: number): RpcResponse | undefined {
  for (const line of out.split(/\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as RpcResponse;
      if (parsed.id === id) return parsed;
    } catch {
      // not JSON — skip
    }
  }
  return undefined;
}
