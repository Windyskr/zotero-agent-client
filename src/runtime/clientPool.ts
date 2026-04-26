import { AcpClient } from "./acpClient";
import type { AgentProfile } from "../core/types";

export class AcpClientPool {
  private readonly clients = new Map<string, AcpClient>();

  get(profile: AgentProfile): AcpClient {
    const existing = this.clients.get(profile.id);
    if (existing) {
      return existing;
    }

    const client = new AcpClient(profile);
    this.clients.set(profile.id, client);
    return client;
  }

  closeAll(): void {
    for (const client of this.clients.values()) {
      client.close();
    }
    this.clients.clear();
  }
}
