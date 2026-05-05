import type {
  AgentProfile,
  PdfContext,
  SessionConfigOption,
  SessionRecord,
  TopicSummary,
} from "./acpChatTypes";
import {
  makeInitialRecord,
  recordsForPdfAgent,
  recordsToTopicSummaries,
  selectPreferredRecord,
} from "./acpSessionRecords";

type Localize = (
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
) => string;

interface SessionRecordSource {
  list: () => Promise<SessionRecord[]>;
}

export async function loadLocalAgentState(
  store: SessionRecordSource,
  pdf: PdfContext,
  agentProfiles: AgentProfile[],
  agentId: string,
  l10n: Localize,
  preferredTopicKey?: string,
): Promise<{
  record: SessionRecord;
  topics: TopicSummary[];
  configOptions: SessionConfigOption[];
}> {
  const profile = agentProfiles.find((candidate) => candidate.id === agentId);
  if (!profile) {
    throw new Error(
      l10n("acpchat-error-invalid-agent", "Select a valid ACP agent"),
    );
  }
  const records = await listRecordsForPdfAgent(store, pdf, agentId);
  const record = records.length
    ? selectPreferredRecord(records, preferredTopicKey)
    : makeInitialRecord(pdf, agentId, l10n);
  return {
    record: settleInterruptedStreamingMessages(record, l10n),
    topics: recordsToTopicSummaries(records),
    configOptions: [],
  };
}

export async function listTopicSummaries(
  store: SessionRecordSource,
  pdf: PdfContext,
  agentId: string,
): Promise<TopicSummary[]> {
  return recordsToTopicSummaries(
    await listRecordsForPdfAgent(store, pdf, agentId),
  );
}

async function listRecordsForPdfAgent(
  store: SessionRecordSource,
  pdf: PdfContext,
  agentId: string,
): Promise<SessionRecord[]> {
  return recordsForPdfAgent(await store.list(), pdf, agentId);
}

function settleInterruptedStreamingMessages(
  record: SessionRecord,
  l10n: Localize,
): SessionRecord {
  let changed = false;
  const messages = record.messages.map((message) => {
    if (message.status !== "streaming") return message;
    changed = true;
    return {
      ...message,
      text:
        message.text ||
        l10n(
          "acpchat-message-interrupted",
          "Interrupted before a response was completed.",
        ),
      status: "cancelled" as const,
    };
  });
  return changed ? { ...record, messages } : record;
}
