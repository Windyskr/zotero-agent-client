import type { ChatMessage, SessionRecord, SessionStoreDocument } from "./types";

export function makeSessionKey(libraryID: number, sourceItemID: number, attachmentItemID: number): string {
  return `${libraryID}:${sourceItemID}:${attachmentItemID}`;
}

export function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function emptyStore(): SessionStoreDocument {
  return { version: 1, records: [] };
}

export function parseStore(text: string): SessionStoreDocument {
  if (!text.trim()) {
    return emptyStore();
  }
  const parsed = JSON.parse(text) as Partial<SessionStoreDocument>;
  if (parsed.version !== 1 || !Array.isArray(parsed.records)) {
    return emptyStore();
  }
  return {
    version: 1,
    records: parsed.records.filter(isSessionRecord)
  };
}

export function serializeStore(store: SessionStoreDocument): string {
  return `${JSON.stringify(store, null, 2)}\n`;
}

export function upsertRecord(store: SessionStoreDocument, record: SessionRecord): SessionStoreDocument {
  const records = store.records.filter((candidate) => candidate.key !== record.key);
  records.push(record);
  records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { version: 1, records };
}

export function appendMessage(record: SessionRecord, message: ChatMessage): SessionRecord {
  return {
    ...record,
    messages: [...record.messages, message],
    updatedAt: new Date().toISOString()
  };
}

function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<SessionRecord>;
  return (
    typeof record.key === "string" &&
    typeof record.agentId === "string" &&
    typeof record.pdfItemID === "number" &&
    typeof record.pdfPathHash === "string" &&
    Array.isArray(record.messages) &&
    typeof record.updatedAt === "string"
  );
}
