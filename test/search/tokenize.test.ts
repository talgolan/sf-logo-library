// test/search/tokenize.test.ts
import { describe, it, expect } from "bun:test";
import { tokenize, matchesToken } from "../../src/search/tokenize.js";

describe("tokenize", () => {
  it("lowercases and splits on whitespace", () => {
    expect(tokenize("Data Cloud AI")).toEqual(["data", "cloud", "ai"]);
  });
  it("collapses unicode whitespace", () => {
    expect(tokenize("foo\t bar\n  baz")).toEqual(["foo", "bar", "baz"]);
  });
  it("returns empty array on empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
  it("preserves punctuation inside tokens (no greedy stripping)", () => {
    // Intentional: 'ai/ml' is a single token. Score band 3 requires exact
    // keyword equality; descriptions use substring. See spec §2 scoring.
    expect(tokenize("AI/ML einstein-gpt")).toEqual(["ai/ml", "einstein-gpt"]);
  });
});

describe("matchesToken", () => {
  it("exact keyword match (case-insensitive)", () => {
    expect(matchesToken("Agentforce", "agentforce")).toBe(true);
  });
  it("word-boundary substring match", () => {
    expect(matchesToken("autonomous AI", "ai")).toBe(true);
    expect(matchesToken("trailhead", "ai")).toBe(false);
  });
});
