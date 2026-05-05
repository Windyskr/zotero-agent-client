import { assert } from "chai";
import {
  applyAcpUpdate,
  mapToolStatusToMessageStatus,
  markMessage,
  shouldShowStopReason,
} from "../src/modules/acpUpdates";
import type { SessionRecord } from "../src/modules/acpChatTypes";

describe("ACP update reducer", function () {
  it("appends text chunks to the active assistant message", function () {
    const record = makeRecord();
    const next = applyAcpUpdate(
      record,
      "assistant-1",
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: " world" },
      },
      "2026-01-01T00:00:01.000Z",
    );

    assert.equal(next.messages[0].text, "hello world");
    assert.equal(next.updatedAt, "2026-01-01T00:00:01.000Z");
  });

  it("ignores text chunks for missing assistant messages", function () {
    const record = makeRecord();
    const next = applyAcpUpdate(
      record,
      "missing-assistant",
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: " ignored" },
      },
      "2026-01-01T00:00:01.000Z",
    );

    assert.strictEqual(next, record);
  });

  it("upserts tool calls without duplicating messages", function () {
    const first = applyAcpUpdate(
      makeRecord(),
      "assistant-1",
      {
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        rawInput: { command: ["grep", "keyword"] },
        status: "in_progress",
      },
      "2026-01-01T00:00:01.000Z",
    );
    const second = applyAcpUpdate(
      first,
      "assistant-1",
      {
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        title: "Search notes",
        status: "completed",
      },
      "2026-01-01T00:00:02.000Z",
    );

    const toolMessages = second.messages.filter(
      (message) => message.role === "tool",
    );
    assert.lengthOf(toolMessages, 1);
    assert.include(toolMessages[0], {
      id: "tool-tool-1",
      text: "Search notes (completed)",
      status: "done",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    assert.equal(second.updatedAt, "2026-01-01T00:00:02.000Z");
  });

  it("trims tool call IDs before upserting messages", function () {
    const first = applyAcpUpdate(
      makeRecord(),
      "assistant-1",
      {
        sessionUpdate: "tool_call",
        toolCallId: " tool-1 ",
        title: "Search notes",
        status: "in_progress",
      },
      "2026-01-01T00:00:01.000Z",
    );
    const second = applyAcpUpdate(
      first,
      "assistant-1",
      {
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        title: "Search notes",
        status: "completed",
      },
      "2026-01-01T00:00:02.000Z",
    );

    assert.deepEqual(
      second.messages
        .filter((message) => message.role === "tool")
        .map((message) => message.id),
      ["tool-tool-1"],
    );
  });

  it("marks messages with fallback text only when empty", function () {
    const record = {
      ...makeRecord(),
      messages: [
        { ...makeRecord().messages[0], text: "" },
        {
          id: "assistant-2",
          role: "assistant" as const,
          text: "kept",
          status: "streaming" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const next = markMessage(
      record,
      "assistant-1",
      "error",
      "fallback",
      "2026-01-01T00:00:03.000Z",
    );

    assert.equal(next.messages[0].text, "fallback");
    assert.equal(next.messages[0].status, "error");
    assert.equal(next.messages[1].text, "kept");
  });

  it("maps tool statuses to message statuses", function () {
    assert.equal(mapToolStatusToMessageStatus("pending"), "streaming");
    assert.equal(mapToolStatusToMessageStatus("failed"), "error");
    assert.equal(mapToolStatusToMessageStatus("canceled"), "cancelled");
    assert.equal(mapToolStatusToMessageStatus("completed"), "done");
  });

  it("hides normal ACP turn-ending stop reasons", function () {
    assert.isFalse(shouldShowStopReason(undefined));
    assert.isFalse(shouldShowStopReason(""));
    assert.isFalse(shouldShowStopReason("end_turn"));
    assert.isFalse(shouldShowStopReason(" END_TURN "));
    assert.isTrue(shouldShowStopReason("cancelled"));
  });
});

function makeRecord(): SessionRecord {
  return {
    key: "record-1",
    topicId: "topic-1",
    agentId: "codex",
    pdfItemID: 1,
    pdfPathHash: "hash",
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        text: "hello",
        status: "streaming",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
