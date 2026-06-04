import { assert } from "chai";
import type { ChatMessage } from "../src/modules/acpChatTypes";
import {
  formatElapsedDuration,
  getTurnElapsedSeconds,
  groupMessagesIntoTurns,
  isAttachedPdfSystemMessage,
  isMetaRole,
  isScrollNearBottom,
} from "../src/modules/acpChatViewModel";

describe("ACP chat view model", function () {
  it("groups messages into user turns", function () {
    const turns = groupMessagesIntoTurns([
      message("assistant-0", "assistant"),
      message("user-1", "user"),
      message("tool-1", "tool"),
      message("assistant-1", "assistant"),
      message("user-2", "user"),
    ]);

    assert.lengthOf(turns, 3);
    assert.isNull(turns[0].userMessage);
    assert.deepEqual(
      turns.map((turn) => ({
        id: turn.id,
        user: turn.userMessage?.id ?? null,
        responses: turn.responseMessages.map((response) => response.id),
      })),
      [
        { id: "turn-assistant-0", user: null, responses: ["assistant-0"] },
        {
          id: "turn-user-1",
          user: "user-1",
          responses: ["tool-1", "assistant-1"],
        },
        { id: "turn-user-2", user: "user-2", responses: [] },
      ],
    );
  });

  it("calculates active and completed turn durations", function () {
    const [turn] = groupMessagesIntoTurns([
      message("user-1", "user", "2026-01-01T00:00:00.000Z"),
      message("assistant-1", "assistant", "2026-01-01T00:00:05.000Z"),
    ]);

    assert.equal(
      getTurnElapsedSeconds(
        turn,
        new Date("2026-01-01T00:00:08.000Z").getTime(),
        true,
      ),
      8,
    );
    assert.equal(getTurnElapsedSeconds(turn, Date.now(), false), 5);
  });

  it("uses deterministic duration fallbacks for invalid timestamps", function () {
    const [turn] = groupMessagesIntoTurns([
      message("user-1", "user", "not-a-date"),
      message("assistant-1", "assistant", "still-not-a-date"),
    ]);
    const nowMs = new Date("2026-01-01T00:00:08.000Z").getTime();

    assert.equal(getTurnElapsedSeconds(turn, nowMs, true), 1);
    assert.equal(getTurnElapsedSeconds(turn, nowMs, false), 1);
  });

  it("formats elapsed durations", function () {
    assert.equal(formatElapsedDuration(9), "9s");
    assert.equal(formatElapsedDuration(65), "1m 5s");
    assert.equal(formatElapsedDuration(3600), "1h");
    assert.equal(formatElapsedDuration(3905), "1h 5m");
  });

  it("identifies meta roles and attached PDF messages", function () {
    assert.isTrue(isMetaRole("tool"));
    assert.isTrue(isMetaRole("system"));
    assert.isFalse(isMetaRole("assistant"));
    assert.isTrue(
      isAttachedPdfSystemMessage(
        message("system-1", "system", undefined, "Attached PDF: paper.pdf"),
      ),
    );
    assert.isFalse(
      isAttachedPdfSystemMessage(
        message("system-2", "system", undefined, "Other context"),
      ),
    );
  });

  it("detects when a scroll container is near the bottom", function () {
    assert.isTrue(isScrollNearBottom(700, 300, 1000, 48));
    assert.isTrue(isScrollNearBottom(660, 300, 1000, 48));
    assert.isFalse(isScrollNearBottom(600, 300, 1000, 48));
    assert.isTrue(isScrollNearBottom(0, 500, 400, 48));
  });
});

function message(
  id: string,
  role: ChatMessage["role"],
  createdAt = "2026-01-01T00:00:00.000Z",
  text = id,
): ChatMessage {
  return {
    id,
    role,
    text,
    status: "done",
    createdAt,
  };
}
