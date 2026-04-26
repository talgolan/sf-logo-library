import { describe, it, expect } from "bun:test";
import { fetchAsset, type FetchAssetOptions } from "../../src/assets/fetch.js";
import { SfLogosError } from "../../src/errors.js";

function opts(
  partial: Partial<FetchAssetOptions> & { fetch: FetchAssetOptions["fetch"] },
): FetchAssetOptions {
  return {
    url: "https://dam.usefulto.me/x.svg",
    userAgent: "sf-logos-mcp-test",
    timeoutMs: 100,
    ...partial,
  };
}

describe("fetchAsset", () => {
  it("returns bytes on 200", async () => {
    const body = new TextEncoder().encode("<svg/>");
    const fetchFn = () => Promise.resolve(new Response(body, { status: 200 }));
    const result = await fetchAsset(opts({ fetch: fetchFn }));
    expect(result.status).toBe(200);
    expect(result.bytes.length).toBe(body.length);
  });

  it("throws FetchFailed on non-200", async () => {
    const fetchFn = () => Promise.resolve(new Response("nope", { status: 500 }));
    try {
      await fetchAsset(opts({ fetch: fetchFn }));
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      const e = err as SfLogosError;
      expect(e.code).toBe("FetchFailed");
      expect(e.details?.["status"]).toBe(500);
    }
  });

  it("throws FetchFailed with reason='timeout' when aborted", async () => {
    const fetchFn = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    try {
      await fetchAsset(opts({ fetch: fetchFn, timeoutMs: 20 }));
      throw new Error("expected throw");
    } catch (err) {
      const e = err as SfLogosError;
      expect(e.code).toBe("FetchFailed");
      expect(e.details?.["reason"]).toBe("timeout");
    }
  });

  it("throws FetchFailed with reason='network_error' on other errors", async () => {
    const fetchFn = () => Promise.reject(new Error("ECONNREFUSED"));
    try {
      await fetchAsset(opts({ fetch: fetchFn }));
      throw new Error("expected throw");
    } catch (err) {
      const e = err as SfLogosError;
      expect(e.code).toBe("FetchFailed");
      expect(e.details?.["reason"]).toBe("network_error");
    }
  });

  it("sends the configured User-Agent", async () => {
    let capturedUA: string | undefined;
    const fetchFn = (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      capturedUA = headers?.["User-Agent"];
      return Promise.resolve(new Response(new Uint8Array(), { status: 200 }));
    };
    await fetchAsset(opts({ fetch: fetchFn, userAgent: "custom/1.0" }));
    expect(capturedUA).toBe("custom/1.0");
  });
});
