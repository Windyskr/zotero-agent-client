import { describe, expect, it } from "vitest";
import { emptyStore, makeSessionKey, parseStore, serializeStore, simpleHash, upsertRecord } from "../src/core/sessionStore";
import type { SessionRecord } from "../src/core/types";

describe("session store helpers", () => {
  it("creates stable per-PDF session keys", () => {
    expect(makeSessionKey(1, 20, 30)).toBe("1:20:30");
  });

  it("hashes file paths deterministically", () => {
    expect(simpleHash("/tmp/paper.pdf")).toBe(simpleHash("/tmp/paper.pdf"));
  });

  it("upserts records by key", () => {
    const first = record("1:2:3", "old");
    const second = record("1:2:3", "new");
    const store = upsertRecord(upsertRecord(emptyStore(), first), second);
    expect(store.records).toHaveLength(1);
    expect(store.records[0]?.messages[0]?.text).toBe("new");
  });

  it("round-trips JSON and rejects invalid documents", () => {
    const store = upsertRecord(emptyStore(), record("1:2:3", "hello"));
    expect(parseStore(serializeStore(store))).toEqual(store);
    expect(parseStore("{}")).toEqual(emptyStore());
  });
});

function record(key: string, text: string): SessionRecord {
  return {
    key,
    agentId: "codex",
    pdfItemID: 3,
    pdfPathHash: "abc",
    messages: [
      {
        id: "m1",
        role: "user",
        text,
        createdAt: "2026-04-26T00:00:00.000Z"
      }
    ],
    updatedAt: "2026-04-26T00:00:00.000Z"
  };
}
