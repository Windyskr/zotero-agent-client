import { assert } from "chai";
import { normalizeStoreDocument } from "../src/modules/acpSessionStore";

describe("ACP session store normalization", function () {
  it("returns an empty store for malformed documents", function () {
    assert.deepEqual(normalizeStoreDocument(null), { version: 1, records: [] });
    assert.deepEqual(normalizeStoreDocument({ records: "bad" }), {
      version: 1,
      records: [],
    });
  });

  it("normalizes records and filters invalid messages", function () {
    const store = normalizeStoreDocument({
      records: [
        {
          key: "1:2:3:topic",
          agentId: "",
          pdfItemID: "bad",
          messages: [
            {
              id: "message-1",
              role: "assistant",
              text: "answer",
              status: "done",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "message-2",
              role: "alien",
              text: "bad",
            },
            {
              id: "message-3",
              role: "tool",
              text: 42,
              status: "unknown",
              createdAt: "2026-01-01T00:00:01.000Z",
            },
          ],
          updatedAt: "2026-01-01T00:00:02.000Z",
        },
        {
          key: "",
          messages: [],
        },
      ],
    });

    assert.lengthOf(store.records, 1);
    assert.include(store.records[0], {
      key: "1:2:3:topic",
      topicId: "topic",
      agentId: "codex",
      pdfItemID: 0,
      updatedAt: "2026-01-01T00:00:02.000Z",
    });
    assert.deepEqual(store.records[0].messages, [
      {
        id: "message-1",
        role: "assistant",
        text: "answer",
        status: "done",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "message-3",
        role: "tool",
        text: "",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ]);
  });

  it("deduplicates records by key and keeps the newest version", function () {
    const store = normalizeStoreDocument({
      records: [
        {
          key: "1:2:3:topic",
          messages: [
            {
              id: "older",
              role: "user",
              text: "Older question",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          key: "1:2:3:topic",
          messages: [
            {
              id: "newer",
              role: "user",
              text: "Newer question",
              createdAt: "2026-01-02T00:00:00.000Z",
            },
          ],
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

    assert.lengthOf(store.records, 1);
    assert.equal(store.records[0].updatedAt, "2026-01-02T00:00:00.000Z");
    assert.equal(store.records[0].messages[0].id, "newer");
  });

  it("repairs invalid timestamps before deduplicating records", function () {
    const store = normalizeStoreDocument({
      records: [
        {
          key: "1:2:3:topic",
          messages: [
            {
              id: "invalid",
              role: "user",
              text: "Invalid timestamp",
              createdAt: "not-a-date",
            },
          ],
          createdAt: "still-not-a-date",
          updatedAt: "also-not-a-date",
        },
        {
          key: "1:2:3:topic",
          messages: [
            {
              id: "newer",
              role: "user",
              text: "Newer question",
              createdAt: "2026-01-02T00:00:00.000Z",
            },
          ],
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

    assert.lengthOf(store.records, 1);
    assert.equal(store.records[0].updatedAt, "2026-01-02T00:00:00.000Z");
    assert.equal(store.records[0].messages[0].id, "newer");
  });

  it("falls back to stable timestamps for malformed records", function () {
    const store = normalizeStoreDocument({
      records: [
        {
          key: "1:2:3:topic",
          messages: [
            {
              id: "message",
              role: "user",
              text: "Question",
              createdAt: "bad-date",
            },
          ],
          createdAt: "bad-date",
          updatedAt: "bad-date",
        },
      ],
    });

    assert.equal(store.records[0].createdAt, "1970-01-01T00:00:00.000Z");
    assert.equal(store.records[0].updatedAt, "1970-01-01T00:00:00.000Z");
    assert.equal(
      store.records[0].messages[0].createdAt,
      "1970-01-01T00:00:00.000Z",
    );
  });
});
