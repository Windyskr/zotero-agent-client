import { emptyStore, parseStore, serializeStore, upsertRecord } from "../core/sessionStore";
import type { SessionRecord, SessionStoreDocument } from "../core/types";

export class FileSessionStore {
  constructor(private readonly configuredPath: string) {}

  async get(key: string): Promise<SessionRecord | undefined> {
    const store = await this.read();
    return store.records.find((record) => record.key === key);
  }

  async upsert(record: SessionRecord): Promise<void> {
    const store = await this.read();
    await this.write(upsertRecord(store, record));
  }

  async path(): Promise<string> {
    if (this.configuredPath.trim()) {
      return this.configuredPath.trim();
    }
    return PathUtils.join(Zotero.Profile.dir, "acpchat", "sessions.json");
  }

  private async read(): Promise<SessionStoreDocument> {
    const path = await this.path();
    try {
      const text = await IOUtils.readUTF8(path);
      return parseStore(text);
    } catch {
      return emptyStore();
    }
  }

  private async write(store: SessionStoreDocument): Promise<void> {
    const path = await this.path();
    await IOUtils.makeDirectory(PathUtils.parent(path), { ignoreExisting: true });
    await IOUtils.writeUTF8(path, serializeStore(store));
  }
}
