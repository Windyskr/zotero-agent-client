import { version } from "../../package.json";
import type { AgentProfile, SessionConfigOption } from "./acpChatTypes";
import type { PromptContentPart } from "./acpPromptContent";
import {
  ACP_PROMPT_TIMEOUT_MS,
  ACP_REQUEST_TIMEOUT_MS,
  ACP_SESSION_TIMEOUT_MS,
  normalizeConfigOptions,
} from "./acpChatUtils";
import { launchAcpProcess } from "./acpProcessLauncher";
import { AcpStdioTransport } from "./acpStdioTransport";

interface PooledClient {
  client: AcpClient;
  signature: string;
}

export interface AcpPromptResponse {
  stopReason?: string;
  [key: string]: unknown;
}

interface AcpInitializeResult {
  agentCapabilities?: {
    loadSession?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface AcpSessionResult {
  sessionId?: string;
  configOptions?: unknown;
  [key: string]: unknown;
}

interface AcpConfigOptionsResult {
  configOptions?: unknown;
  [key: string]: unknown;
}

interface AcpRequestMap {
  initialize: {
    params: {
      protocolVersion: number;
      clientCapabilities: {
        fs: { readTextFile: boolean; writeTextFile: boolean };
        terminal: boolean;
      };
      clientInfo: {
        name: string;
        title: string;
        version: string;
      };
    };
    result: AcpInitializeResult;
  };
  "session/load": {
    params: { sessionId: string; cwd: string; mcpServers: unknown[] };
    result: AcpConfigOptionsResult;
  };
  "session/new": {
    params: { cwd: string; mcpServers: unknown[] };
    result: AcpSessionResult;
  };
  "session/set_config_option": {
    params: { sessionId: string; configId: string; value: string };
    result: AcpConfigOptionsResult;
  };
  "session/prompt": {
    params: { sessionId: string; prompt: PromptContentPart[] };
    result: AcpPromptResponse;
  };
}

type AcpRequestMethod = keyof AcpRequestMap;

const clientPool = new Map<string, PooledClient>();

export function getClient(profile: AgentProfile): AcpClient {
  const existing = clientPool.get(profile.id);
  const signature = profileConnectionSignature(profile);
  if (existing?.signature === signature) return existing.client;
  existing?.client.close();
  const client = new AcpClient(profile);
  clientPool.set(profile.id, { client, signature });
  return client;
}

export function closeAllClients(): void {
  for (const { client } of clientPool.values()) {
    client.close();
  }
  clientPool.clear();
}

export function profileConnectionSignature(profile: AgentProfile): string {
  return JSON.stringify({
    args: profile.args,
    command: profile.command,
    env: Object.fromEntries(
      Object.entries(profile.env ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  });
}

export class AcpClient {
  private transport: AcpStdioTransport | null = null;
  private connectPromise: Promise<AcpInitializeResult> | null = null;
  private initializeResult: AcpInitializeResult | null = null;
  private updateListeners = new Set<(update: unknown) => void>();
  private removeTransportUpdateListener: (() => void) | null = null;
  private removeTransportCloseListener: (() => void) | null = null;

  constructor(private profile: AgentProfile) {}

  onUpdate(listener: (update: unknown) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  async connect(): Promise<AcpInitializeResult> {
    if (this.initializeResult) return this.initializeResult;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.openConnection()
      .catch((error) => {
        this.close();
        throw error;
      })
      .finally(() => {
        this.connectPromise = null;
      });
    return this.connectPromise;
  }

  async loadOrCreateSession(
    recordedSessionId: string | undefined,
    cwd: string,
  ): Promise<{ sessionId: string; configOptions: SessionConfigOption[] }> {
    const init = await this.connect();
    if (recordedSessionId && init.agentCapabilities?.loadSession) {
      try {
        const result = await this.request(
          "session/load",
          { sessionId: recordedSessionId, cwd, mcpServers: [] },
          ACP_SESSION_TIMEOUT_MS,
        );
        return {
          sessionId: recordedSessionId,
          configOptions: normalizeConfigOptions(result?.configOptions),
        };
      } catch (error) {
        debug(
          `[acpchat] failed to load recorded ACP session; creating a new one: ${String(error)}`,
        );
      }
    }
    const result = await this.request(
      "session/new",
      { cwd, mcpServers: [] },
      ACP_SESSION_TIMEOUT_MS,
    );
    if (!result.sessionId)
      throw new Error("ACP agent did not return a sessionId");
    return {
      sessionId: result.sessionId,
      configOptions: normalizeConfigOptions(result?.configOptions),
    };
  }

  async setSessionConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<SessionConfigOption[]> {
    const result = await this.request(
      "session/set_config_option",
      {
        sessionId,
        configId,
        value,
      },
      ACP_REQUEST_TIMEOUT_MS,
    );
    return normalizeConfigOptions(result?.configOptions);
  }

  sendPrompt(
    sessionId: string,
    prompt: PromptContentPart[],
  ): Promise<AcpPromptResponse> {
    return this.request(
      "session/prompt",
      { sessionId, prompt },
      ACP_PROMPT_TIMEOUT_MS,
    );
  }

  cancel(sessionId: string): void {
    this.getConnectedTransport().notify("session/cancel", { sessionId });
  }

  close(): void {
    this.initializeResult = null;
    this.connectPromise = null;
    this.removeTransportUpdateListener?.();
    this.removeTransportUpdateListener = null;
    this.removeTransportCloseListener?.();
    this.removeTransportCloseListener = null;
    this.transport?.close();
    this.transport = null;
  }

  private async openConnection(): Promise<AcpInitializeResult> {
    const { process, plan } = await launchAcpProcess(this.profile);
    const transport = new AcpStdioTransport(process, plan);
    this.transport = transport;
    this.removeTransportUpdateListener = transport.onNotification(
      "session/update",
      (update) => this.notifyUpdateListeners(update),
    );
    this.removeTransportCloseListener = transport.onClose(() => {
      if (this.transport !== transport) return;
      this.initializeResult = null;
      this.connectPromise = null;
      this.transport = null;
      this.removeTransportUpdateListener = null;
      this.removeTransportCloseListener = null;
    });
    this.initializeResult = await this.request(
      "initialize",
      {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: {
          name: "zotero-agent-client",
          title: "Zotero Agent Client",
          version,
        },
      },
      ACP_REQUEST_TIMEOUT_MS,
    );
    return this.initializeResult;
  }

  private request<Method extends AcpRequestMethod>(
    method: Method,
    params: AcpRequestMap[Method]["params"],
    timeoutMs = 30000,
  ): Promise<AcpRequestMap[Method]["result"]> {
    return this.getConnectedTransport().request(method, params, timeoutMs);
  }

  private getConnectedTransport(): AcpStdioTransport {
    if (!this.transport) throw new Error("ACP process is not running");
    return this.transport;
  }

  private notifyUpdateListeners(update: unknown): void {
    for (const listener of Array.from(this.updateListeners)) {
      try {
        listener(update);
      } catch (error) {
        logUpdateListenerError(error);
      }
    }
  }
}

function logUpdateListenerError(error: unknown): void {
  try {
    if (
      typeof Zotero !== "undefined" &&
      typeof Zotero.logError === "function"
    ) {
      Zotero.logError(error as Error);
    }
  } catch {
    // Listener isolation should work in tests and during Zotero shutdown.
  }
}

function debug(message: string): void {
  try {
    if (typeof Zotero !== "undefined" && typeof Zotero.debug === "function") {
      Zotero.debug(message);
    }
  } catch {
    // Tests run outside Zotero.
  }
}
