import { assert } from "chai";
import type { PdfContext, SessionRecord } from "../src/modules/acpChatTypes";
import {
  makeInitialRecord,
  recordsForPdfAgent,
  recordsToTopicSummaries,
  selectPreferredRecord,
  sessionKeyBase,
  topicTitle,
} from "../src/modules/acpSessionRecords";

describe("ACP session records", function () {
  it("creates initial records for a PDF and agent", function () {
    const record = makeInitialRecord(mockPdf, "codex", l10n, {
      now: "2026-01-01T00:00:00.000Z",
      topicId: "topic-1",
    });

    assert.include(record, {
      key: "3:5:7:topic-1",
      topicId: "topic-1",
      agentId: "codex",
      pdfItemID: 7,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.match(record.pdfPathHash, /^[0-9a-f]{8}$/);
    assert.include(record.messages[0], {
      role: "system",
      text: "Attached PDF: paper.pdf",
      status: "done",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("filters and sorts records for one PDF and agent", function () {
    const records = [
      makeRecord("3:5:7:older", "codex", "2026-01-01T00:00:00.000Z"),
      makeRecord("3:5:8:other-pdf", "codex", "2026-01-03T00:00:00.000Z"),
      makeRecord("3:5:7:newer", "codex", "2026-01-02T00:00:00.000Z"),
      makeRecord("3:5:7:other-agent", "claude", "2026-01-04T00:00:00.000Z"),
    ];

    assert.deepEqual(
      recordsForPdfAgent(records, mockPdf, "codex").map((record) => record.key),
      ["3:5:7:newer", "3:5:7:older"],
    );
  });

  it("builds topic summaries from first user prompts", function () {
    const longPrompt = "  First   user\nquestion that should be normalized.  ";
    const record = {
      ...makeRecord("3:5:7:topic", "codex", "2026-01-01T00:00:00.000Z"),
      messages: [
        { role: "system" as const, text: "context" },
        { role: "user" as const, text: longPrompt },
      ].map((message, index) => ({
        id: `message-${index}`,
        status: "done" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        ...message,
      })),
    };

    assert.equal(
      topicTitle(record),
      "First user question that should be normalized.",
    );
    assert.deepEqual(recordsToTopicSummaries([record]), [
      {
        key: "3:5:7:topic",
        title: "First user question that should be normalized.",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("selects preferred records when available", function () {
    const records = [
      makeRecord("first", "codex", "2026-01-01T00:00:00.000Z"),
      makeRecord("second", "codex", "2026-01-02T00:00:00.000Z"),
    ];

    assert.equal(selectPreferredRecord(records, "second").key, "second");
    assert.equal(selectPreferredRecord(records, "missing").key, "first");
  });

  it("builds stable session key bases", function () {
    assert.equal(sessionKeyBase(mockPdf), "3:5:7");
  });
});

const mockPdf: PdfContext = {
  itemID: 7,
  libraryID: 3,
  sourceItemID: 5,
  title: "Paper",
  year: "2026",
  fileName: "paper.pdf",
  filePath: "/tmp/paper.pdf",
  fileUri: "file:///tmp/paper.pdf",
  fileSize: 100,
  cwd: "/tmp",
};

function l10n(
  _id: string,
  fallback: string,
  args?: Record<string, unknown>,
): string {
  return fallback.replace(/\{fileName\}/g, String(args?.fileName ?? ""));
}

function makeRecord(
  key: string,
  agentId: string,
  updatedAt: string,
): SessionRecord {
  return {
    key,
    topicId: key.split(":").pop() ?? key,
    agentId,
    pdfItemID: 7,
    pdfPathHash: "hash",
    messages: [],
    createdAt: updatedAt,
    updatedAt,
  };
}
