import { encodeNdjson, NdjsonDecoder } from "../core/ndjson";
import type { AcpInitializeResponse, AcpPromptResponse, AcpUpdate, AgentProfile, ContentBlock, JsonObject } from "../core/types";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

type UpdateListener = (update: AcpUpdate) => void;
type StatusListener = (message: string) => void;

export class AcpClient {
  private process: any | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly updates = new Set<UpdateListener>();
  private readonly statuses = new Set<StatusListener>();
  private initializeResult: AcpInitializeResponse | null = null;

  constructor(private readonly profile: AgentProfile) {}

  onUpdate(listener: UpdateListener): () => void {
    this.updates.add(listener);
    return () => this.updates.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statuses.add(listener);
    return () => this.statuses.delete(listener);
  }

  async connect(): Promise<AcpInitializeResponse> {
    if (this.initializeResult) {
      return this.initializeResult;
    }

    const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
    const command = await resolveCommand(Subprocess, this.profile.command);
    const options: any = {
      command,
      arguments: this.profile.args ?? []
    };
    if (Object.keys(this.profile.env ?? {}).length > 0) {
      options.environment = this.profile.env;
      options.environmentAppend = true;
    }

    this.process = await Subprocess.call(options);
    this.emitStatus(`Connected to ${this.profile.name}`);
    this.readStdout();
    this.readStderr();
    this.watchExit();

    this.initializeResult = (await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false
        },
        terminal: false
      },
      clientInfo: {
        name: "zotero-acp-sidebar-chat",
        title: "Zotero ACP Sidebar Chat",
        version: "0.1.0"
      }
    })) as AcpInitializeResponse;

    return this.initializeResult;
  }

  async loadOrCreateSession(recordedSessionId: string | undefined, cwd: string, mcpServers: unknown[] = []): Promise<string> {
    const init = await this.connect();
    if (recordedSessionId && init.agentCapabilities?.loadSession) {
      await this.request("session/load", {
        sessionId: recordedSessionId,
        cwd,
        mcpServers
      }, 120000);
      return recordedSessionId;
    }

    const result = (await this.request("session/new", {
      cwd,
      mcpServers
    })) as { sessionId?: string };

    if (!result.sessionId) {
      throw new Error("ACP agent did not return a sessionId");
    }
    return result.sessionId;
  }

  async sendPrompt(sessionId: string, prompt: ContentBlock[]): Promise<AcpPromptResponse> {
    return (await this.request("session/prompt", {
      sessionId,
      prompt
    }, 10 * 60 * 1000)) as AcpPromptResponse;
  }

  cancel(sessionId: string): void {
    this.notify("session/cancel", { sessionId });
  }

  close(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("ACP client closed"));
    }
    this.pending.clear();
    try {
      this.process?.stdin?.close();
    } catch {
      // Ignore shutdown races.
    }
    try {
      this.process?.kill?.();
    } catch {
      // Ignore already-exited processes.
    }
    this.process = null;
    this.initializeResult = null;
  }

  private request(method: string, params: JsonObject, timeoutMs = 30000): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    this.write({ jsonrpc: "2.0", id, method, params });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  private notify(method: string, params: JsonObject): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private write(message: unknown): void {
    if (!this.process) {
      throw new Error("ACP process is not running");
    }
    this.process.stdin.write(encodeNdjson(message));
  }

  private async readStdout(): Promise<void> {
    const decoder = new NdjsonDecoder();
    try {
      let chunk = "";
      while (this.process && (chunk = await this.process.stdout.readString())) {
        for (const message of decoder.push(chunk)) {
          this.handleMessage(message);
        }
      }
      for (const message of decoder.flush()) {
        this.handleMessage(message);
      }
    } catch (error) {
      this.rejectAll(toError(error));
    }
  }

  private async readStderr(): Promise<void> {
    try {
      let chunk = "";
      while (this.process && (chunk = await this.process.stderr.readString())) {
        this.emitStatus(chunk.trim());
      }
    } catch {
      // Stderr may close during normal shutdown.
    }
  }

  private async watchExit(): Promise<void> {
    try {
      const result = await this.process.wait();
      if (result.exitCode !== 0) {
        this.rejectAll(new Error(`ACP process exited with status ${result.exitCode}`));
      }
    } catch (error) {
      this.rejectAll(toError(error));
    }
  }

  private handleMessage(raw: unknown): void {
    if (!raw || typeof raw !== "object") {
      return;
    }
    const message = raw as any;

    if (typeof message.id === "number" && (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new Error(message.error.message || "ACP request failed"));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method === "session/update" && message.params) {
      for (const listener of this.updates) {
        listener(message.params as AcpUpdate);
      }
      return;
    }

    if (typeof message.id === "number" && typeof message.method === "string") {
      this.respondToAgentRequest(message.id, message.method);
    }
  }

  private respondToAgentRequest(id: number, method: string): void {
    if (method === "session/request_permission") {
      this.write({
        jsonrpc: "2.0",
        id,
        result: {
          outcome: {
            outcome: "cancelled"
          }
        }
      });
      return;
    }

    this.write({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not supported by Zotero ACP Sidebar Chat: ${method}`
      }
    });
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }

  private emitStatus(message: string): void {
    if (!message) {
      return;
    }
    for (const listener of this.statuses) {
      listener(message);
    }
  }
}

async function resolveCommand(Subprocess: any, command: string): Promise<string> {
  if (!command.trim()) {
    throw new Error("ACP command is empty");
  }
  if (command.includes("/")) {
    return command;
  }
  try {
    return await Subprocess.pathSearch(command);
  } catch {
    throw new Error(`Cannot find ACP command "${command}". Configure an absolute path in plugin preferences.`);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
