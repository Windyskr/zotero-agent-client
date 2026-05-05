import { assert } from "chai";
import type {
  AgentProfile,
  PdfContext,
  SessionRecord,
} from "../src/modules/acpChatTypes";
import {
  listTopicSummaries,
  loadLocalAgentState,
} from "../src/modules/acpSessionState";

describe("ACP session state", function () {
  it("loads preferred local records and topic summaries", async function () {
    const store = makeStore([
      makeRecord("3:5:7:older", "codex", "2026-01-01T00:00:00.000Z"),
      makeRecord("3:5:7:newer", "codex", "2026-01-02T00:00:00.000Z"),
    ]);

    const state = await loadLocalAgentState(
      store,
      pdf,
      agentProfiles,
      "codex",
      l10n,
      "3:5:7:older",
    );

    assert.equal(state.record.key, "3:5:7:older");
    assert.deepEqual(
      state.topics.map((topic) => topic.key),
      ["3:5:7:newer", "3:5:7:older"],
    );
    assert.deepEqual(state.configOptions, []);
  });

  it("creates a fresh record when no local record exists", async function () {
    const state = await loadLocalAgentState(
      makeStore([]),
      pdf,
      agentProfiles,
      "codex",
      l10n,
    );

    assert.equal(state.record.agentId, "codex");
    assert.match(state.record.key, /^3:5:7:/);
    assert.deepEqual(state.topics, []);
  });

  it("rejects invalid agents with localized messages", async function () {
    try {
      await loadLocalAgentState(
        makeStore([]),
        pdf,
        agentProfiles,
        "missing",
        l10n,
      );
      assert.fail("Expected invalid agent to throw");
    } catch (error) {
      assert.equal((error as Error).message, "Select a valid ACP agent");
    }
  });

  it("lists topic summaries for one PDF and agent", async function () {
    const topics = await listTopicSummaries(
      makeStore([
        makeRecord("3:5:7:topic", "codex", "2026-01-01T00:00:00.000Z"),
        makeRecord("3:5:8:other", "codex", "2026-01-02T00:00:00.000Z"),
      ]),
      pdf,
      "codex",
    );

    assert.deepEqual(topics, [
      {
        key: "3:5:7:topic",
        title: "Question",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});

const pdf: PdfContext = {
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

const agentProfiles: AgentProfile[] = [
  {
    id: "codex",
    name: "Codex",
    command: "npx",
    args: ["-y", "@scope/agent"],
    env: {},
  },
];

function l10n(_id: string, fallback: string): string {
  return fallback;
}

function makeStore(records: SessionRecord[]): {
  list: () => Promise<SessionRecord[]>;
} {
  return {
    async list() {
      return records;
    },
  };
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
    messages: [
      {
        id: "message-1",
        role: "user",
        text: "Question",
        status: "done",
        createdAt: updatedAt,
      },
    ],
    createdAt: updatedAt,
    updatedAt,
  };
}
