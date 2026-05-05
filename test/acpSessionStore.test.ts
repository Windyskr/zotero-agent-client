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
});
