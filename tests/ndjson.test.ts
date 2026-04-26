import { describe, expect, it } from "vitest";
import { encodeNdjson, NdjsonDecoder } from "../src/core/ndjson";

describe("NdjsonDecoder", () => {
  it("decodes split and coalesced JSON-RPC messages", () => {
    const decoder = new NdjsonDecoder();
    expect(decoder.push('{"jsonrpc":"2.0",')).toEqual([]);
    expect(decoder.push('"id":1,"result":true}\n{"jsonrpc":"2.0","method":"x"}\n')).toEqual([
      { jsonrpc: "2.0", id: 1, result: true },
      { jsonrpc: "2.0", method: "x" }
    ]);
  });

  it("encodes a single message with a trailing newline", () => {
    expect(encodeNdjson({ id: 1 })).toBe('{"id":1}\n');
  });
});
