import type {
  ChatMessage,
  PdfContext,
  SessionRecord,
  TopicSummary,
} from "./acpChatTypes";
import { makeMessage, simpleHash } from "./acpChatUtils";

type Localize = (
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
) => string;

interface InitialRecordOptions {
  now?: string;
  topicId?: string;
}

export function recordsToTopicSummaries(
  records: SessionRecord[],
): TopicSummary[] {
  return records.map((record) => ({
    key: record.key,
    title: topicTitle(record),
    updatedAt: record.updatedAt,
  }));
}

export function recordsForPdfAgent(
  records: SessionRecord[],
  pdf: PdfContext,
  agentId: string,
): SessionRecord[] {
  const base = sessionKeyBase(pdf);
  return records
    .filter((record) => record.agentId === agentId)
    .filter(
      (record) => record.key === base || record.key.startsWith(`${base}:`),
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
}

export function selectPreferredRecord(
  records: SessionRecord[],
  preferredTopicKey?: string,
): SessionRecord {
  if (preferredTopicKey) {
    const preferred = records.find(
      (record) => record.key === preferredTopicKey,
    );
    if (preferred) return preferred;
  }
  return records[0];
}

export function topicTitle(record: SessionRecord): string {
  const firstUser = record.messages.find(
    (message) => message.role === "user" && message.text.trim(),
  );
  if (!firstUser) return "";
  return firstUser.text.trim().replace(/\s+/g, " ").slice(0, 60);
}

export function makeInitialRecord(
  pdf: PdfContext,
  agentId: string,
  l10n: Localize,
  options: InitialRecordOptions = {},
): SessionRecord {
  const now = options.now ?? new Date().toISOString();
  const topicId = options.topicId ?? makeTopicId();
  return {
    key: `${sessionKeyBase(pdf)}:${topicId}`,
    topicId,
    agentId,
    pdfItemID: pdf.itemID,
    pdfPathHash: simpleHash(pdf.filePath),
    messages: [makeAttachedPdfMessage(pdf, l10n, now)],
    createdAt: now,
    updatedAt: now,
  };
}

export function sessionKeyBase(pdf: PdfContext): string {
  return `${pdf.libraryID}:${pdf.sourceItemID}:${pdf.itemID}`;
}

function makeTopicId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeAttachedPdfMessage(
  pdf: PdfContext,
  l10n: Localize,
  createdAt: string,
): ChatMessage {
  return {
    ...makeMessage(
      "system",
      l10n("acpchat-system-attached-pdf", "Attached PDF: {fileName}", {
        fileName: pdf.fileName,
      }),
      "done",
    ),
    createdAt,
  };
}
