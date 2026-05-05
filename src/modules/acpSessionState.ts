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
    record,
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
