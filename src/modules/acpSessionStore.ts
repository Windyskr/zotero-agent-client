import type {
  ChatMessage,
  ChatRole,
  MessageStatus,
  SessionRecord,
  StoreDocument,
} from "./acpChatTypes";
import { STORE_IO_TIMEOUT_MS, withTimeout } from "./acpChatUtils";
import { getZoteroProfileDir } from "./acpZoteroRuntime";

const writeQueues = new Map<string, Promise<void>>();

export class FileSessionStore {
  constructor(private configuredPath: string) {}

  async list(): Promise<SessionRecord[]> {
    const path = await this.path();
    await this.waitForPendingWrite(path);
    return (await this.readPath(path)).records;
  }

  async upsert(record: SessionRecord): Promise<void> {
    const path = await this.path();
    await this.enqueueWrite(path, async () => {
      const store = await this.readPath(path);
      store.records = store.records.filter(
        (candidate) => candidate.key !== record.key,
      );
      store.records.push(record);
      await this.writePath(path, store);
    });
  }

  private async path(): Promise<string> {
    return (
      this.configuredPath.trim() ||
      PathUtils.join(getZoteroProfileDir(), "agentclient", "sessions.json")
    );
  }

  private async readPath(path: string): Promise<StoreDocument> {
    const exists = await withTimeout(
      IOUtils.exists(path),
      STORE_IO_TIMEOUT_MS,
      `Timed out checking chat session store: ${path}`,
    );
    if (!exists) return { version: 1, records: [] };

    const raw = await withTimeout(
      IOUtils.readUTF8(path),
      STORE_IO_TIMEOUT_MS,
      `Timed out reading chat session store: ${path}`,
    );
    try {
      return normalizeStoreDocument(JSON.parse(raw) as StoreDocument);
    } catch {
      return { version: 1, records: [] };
    }
  }

  private async writePath(path: string, store: StoreDocument): Promise<void> {
    const parent = PathUtils.parent(path);
    if (parent) {
      await withTimeout(
        IOUtils.makeDirectory(parent, { ignoreExisting: true }),
        STORE_IO_TIMEOUT_MS,
        `Timed out creating chat session store directory: ${parent}`,
      );
    }
    await withTimeout(
      IOUtils.writeUTF8(path, `${JSON.stringify(store, null, 2)}\n`),
      STORE_IO_TIMEOUT_MS,
      `Timed out writing chat session store: ${path}`,
    );
  }

  private async waitForPendingWrite(path: string): Promise<void> {
    await writeQueues.get(path);
  }

  private async enqueueWrite(
    path: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    const previous = writeQueues.get(path) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const settled = current.then(
      () => undefined,
      () => undefined,
    );
    writeQueues.set(path, settled);

    try {
      await current;
    } finally {
      if (writeQueues.get(path) === settled) {
        writeQueues.delete(path);
      }
    }
  }
}

export function normalizeStoreDocument(store: unknown): StoreDocument {
  if (!isRecord(store) || !Array.isArray(store.records)) {
    return { version: 1, records: [] };
  }
  const normalized: SessionRecord[] = [];
  for (const record of store.records ?? []) {
    if (!isRecord(record)) continue;
    const key = String(record.key || "");
    const topicId =
      typeof record.topicId === "string" && record.topicId
        ? record.topicId
        : key.split(":").slice(3).join(":") || makeTopicId();
    const updatedAt =
      typeof record.updatedAt === "string" && record.updatedAt
        ? record.updatedAt
        : new Date().toISOString();
    normalized.push({
      key,
      topicId,
      agentId: String(record.agentId || "codex"),
      sessionId:
        typeof record.sessionId === "string" ? record.sessionId : undefined,
      pdfItemID: toFiniteNumber(record.pdfItemID),
      pdfPathHash: String(record.pdfPathHash || ""),
      messages: normalizeMessages(record.messages),
      createdAt:
        typeof record.createdAt === "string" && record.createdAt
          ? record.createdAt
          : updatedAt,
      updatedAt,
    });
  }
  return { version: 1, records: normalized.filter((record) => !!record.key) };
}

function makeTopicId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  const normalized: ChatMessage[] = [];
  for (const message of messages) {
    if (!isRecord(message)) continue;
    const role = normalizeRole(message.role);
    if (!role) continue;
    const id =
      typeof message.id === "string" && message.id ? message.id : makeTopicId();
    const createdAt =
      typeof message.createdAt === "string" && message.createdAt
        ? message.createdAt
        : new Date().toISOString();
    const status = normalizeStatus(message.status);
    normalized.push({
      id,
      role,
      text: typeof message.text === "string" ? message.text : "",
      createdAt,
      ...(status ? { status } : {}),
    });
  }
  return normalized;
}

function normalizeRole(role: unknown): ChatRole | null {
  if (
    role === "user" ||
    role === "assistant" ||
    role === "tool" ||
    role === "system"
  ) {
    return role;
  }
  return null;
}

function normalizeStatus(status: unknown): MessageStatus | undefined {
  if (
    status === "streaming" ||
    status === "done" ||
    status === "error" ||
    status === "cancelled"
  ) {
    return status;
  }
  return undefined;
}

function toFiniteNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
