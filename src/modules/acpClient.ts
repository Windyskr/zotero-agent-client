import { version } from "../../package.json";
import type { AgentProfile, SessionConfigOption } from "./acpChatTypes";
import { normalizeNpxArgs } from "./acpChatSettings";
import { extractJsonMessagesFromBuffer } from "./acpJsonStream";
import type { PromptContentPart } from "./acpPromptContent";
import {
  ACP_PROMPT_TIMEOUT_MS,
  ACP_REQUEST_TIMEOUT_MS,
  ACP_SESSION_TIMEOUT_MS,
  ACP_SPAWN_TIMEOUT_MS,
  normalizeConfigOptions,
  withTimeout,
} from "./acpChatUtils";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

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

interface AcpProcessOptions {
  command: string;
  arguments: string[];
  environment?: Record<string, string>;
  environmentAppend?: boolean;
}

interface AcpProcess {
  stdin: {
    write(value: string): void;
    close(): void;
  };
  stdout: {
    readString(): Promise<string>;
  };
  stderr?: {
    readString?: () => Promise<string>;
  };
  wait(): Promise<{ exitCode: number }>;
  kill(): void;
}

interface AcpOutgoingMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

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
  private process: AcpProcess | null = null;
  private connectPromise: Promise<AcpInitializeResult> | null = null;
  private nextId = 1;
  private initializeResult: AcpInitializeResult | null = null;
  private pending = new Map<number, PendingRequest>();
  private updateListeners = new Set<(update: unknown) => void>();

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

  private async openConnection(): Promise<AcpInitializeResult> {
    const args = normalizeNpxArgs(this.profile.args ?? []);
    const packageArg = args.find((arg) => !arg.startsWith("-"));
    if (!packageArg) {
      throw new Error(
        "NPX mode requires a package name in agentProfiles.args.",
      );
    }
    const command = await resolveExecutableCommand(
      this.profile.command,
      this.profile.env ?? {},
    );
    const environment = buildProcessEnvironment(this.profile.env ?? {});
    const options: AcpProcessOptions = { command, arguments: args };
    if (Object.keys(environment).length) {
      options.environment = environment;
      options.environmentAppend = true;
    }
    const { Subprocess } = getSubprocessModule();
    const process = await withTimeout(
      Subprocess.call(options),
      ACP_SPAWN_TIMEOUT_MS,
      `Timed out starting ACP agent: ${this.profile.name}`,
    );
    this.process = process;
    void this.readStdout(process);
    void this.readStderr(process);
    void this.watchExit(process);
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
        Zotero.debug(
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
    this.write({
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId },
    });
  }

  close(): void {
    const process = this.process;
    this.process = null;
    this.initializeResult = null;
    this.connectPromise = null;
    try {
      process?.stdin?.close();
      process?.kill?.();
    } catch {
      // The subprocess may already be gone while Zotero is unloading.
    }
    this.rejectPending(new Error("ACP process was closed"));
  }

  private request<Method extends AcpRequestMethod>(
    method: Method,
    params: AcpRequestMap[Method]["params"],
    timeoutMs = 30000,
  ): Promise<AcpRequestMap[Method]["result"]> {
    const id = this.nextId++;
    return new Promise<AcpRequestMap[Method]["result"]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as AcpRequestMap[Method]["result"]),
        reject,
        timeout,
      });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private write(message: AcpOutgoingMessage): void {
    if (!this.process) throw new Error("ACP process is not running");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private async readStdout(process: AcpProcess): Promise<void> {
    let buffer = "";
    let chunk = "";
    try {
      while (
        this.process === process &&
        (chunk = await process.stdout.readString())
      ) {
        buffer += chunk;
        const { ignoredPrefixes, messages, rest } =
          extractJsonMessagesFromBuffer(buffer);
        buffer = rest;
        for (const ignored of ignoredPrefixes) {
          Zotero.debug(
            `[acpchat] ignoring non-JSON stdout: ${ignored.slice(0, 200)}`,
          );
        }
        for (const raw of messages) {
          try {
            this.handleMessage(JSON.parse(raw));
          } catch (error) {
            Zotero.debug(
              `[acpchat] dropped unparsable ACP message: ${String(error)}`,
            );
          }
        }
        if (buffer.length > 1_048_576) {
          Zotero.debug(
            "[acpchat] stdout buffer exceeded 1MB while waiting for complete JSON message; trimming.",
          );
          buffer = "";
        }
      }
    } catch (error) {
      if (this.process === process) {
        Zotero.debug(
          `[acpchat] failed while reading ACP stdout: ${String(error)}`,
        );
        this.rejectPending(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }

  private async readStderr(process: AcpProcess): Promise<void> {
    if (typeof process.stderr?.readString !== "function") return;
    let chunk = "";
    try {
      while (
        this.process === process &&
        (chunk = await process.stderr.readString())
      ) {
        const message = chunk.trim();
        if (message) {
          Zotero.debug(
            `[acpchat] ${this.profile.id} stderr: ${message.slice(0, 2000)}`,
          );
        }
      }
    } catch (error) {
      Zotero.debug(
        `[acpchat] failed while reading ACP stderr: ${String(error)}`,
      );
    }
  }

  private async watchExit(process: AcpProcess): Promise<void> {
    let result: { exitCode: number };
    try {
      result = await process.wait();
    } catch (error) {
      if (this.process === process) {
        this.process = null;
        this.initializeResult = null;
        this.rejectPending(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      return;
    }
    if (this.process !== process) return;
    this.process = null;
    this.initializeResult = null;
    this.rejectPending(
      result.exitCode === 0
        ? new Error("ACP process exited before completing pending requests")
        : new Error(`ACP exited with ${result.exitCode}`),
    );
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message)) return;
    if (
      typeof message.id === "number" &&
      (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))
    ) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        const errorMessage = isRecord(message.error)
          ? message.error.message
          : "";
        pending.reject(
          new Error(
            typeof errorMessage === "string" && errorMessage
              ? errorMessage
              : "ACP request failed",
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method === "session/update") {
      for (const listener of this.updateListeners) listener(message.params);
      return;
    }
    if (typeof message.id === "number") {
      this.write({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "Unsupported client method" },
      });
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

async function resolveExecutableCommand(
  command: string,
  env: Record<string, string>,
): Promise<string> {
  const normalizedCommand = expandHomePath(command.trim());
  if (!normalizedCommand) {
    throw new Error("ACP command is empty");
  }
  if (isPathLikeCommand(normalizedCommand)) {
    return normalizedCommand;
  }

  const pathEntries = collectSearchPathEntries(env);
  const executableNames = executableNameCandidates(
    normalizedCommand,
    getPathExt(env),
    pathEntries.some(isWindowsPathEntry),
  );
  for (const entry of pathEntries) {
    for (const executableName of executableNames) {
      const candidate = PathUtils.join(entry, executableName);
      if (await IOUtils.exists(candidate)) {
        return candidate;
      }
    }
  }

  const { Subprocess } = getSubprocessModule();
  try {
    const resolved = await Subprocess.pathSearch(normalizedCommand);
    if (resolved && resolved !== normalizedCommand) {
      return resolved;
    }
  } catch {
    // Some Zotero runtimes do not expose pathSearch consistently.
  }

  throw new Error(
    `Executable not found: ${normalizedCommand}. ` +
      "NPX-only mode requires npx in PATH. " +
      "Install Node.js/npm and ensure npx is available to Zotero.",
  );
}

function buildProcessEnvironment(
  env: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...env };
  if (!next.PATH && !next.Path) {
    const mergedPath = joinPathEntries(collectSearchPathEntries(env));
    if (mergedPath) next.PATH = mergedPath;
  }
  return next;
}

function collectSearchPathEntries(env: Record<string, string>): string[] {
  const pathEntries = splitPathEntries(env.PATH || env.Path || "");
  const processPath = splitPathEntries(
    Services.env.get("PATH") || Services.env.get("Path"),
  );
  const defaults = defaultPathEntries();
  return Array.from(new Set([...pathEntries, ...processPath, ...defaults]));
}

export function splitPathEntries(pathValue: string): string[] {
  const value = pathValue.trim();
  if (!value) return [];
  const separator = value.includes(";")
    ? ";"
    : /^[A-Za-z]:[\\/]/.test(value)
      ? null
      : ":";
  const entries = separator ? value.split(separator) : [value];
  return entries
    .map((entry) => expandHomePath(entry.trim()))
    .filter((entry) => !!entry);
}

export function joinPathEntries(pathEntries: string[]): string {
  const separator = pathEntries.some(isWindowsPathEntry) ? ";" : ":";
  return pathEntries.join(separator);
}

function isWindowsPathEntry(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export function isPathLikeCommand(command: string): boolean {
  return (
    command.includes("/") ||
    command.includes("\\") ||
    /^[A-Za-z]:/.test(command)
  );
}

export function executableNameCandidates(
  command: string,
  pathExt = "",
  includeWindowsFallbacks = false,
): string[] {
  const names = [command];
  if (hasExecutableExtension(command)) return names;
  const extensions = splitPathExtensions(pathExt);
  if (!extensions.length && includeWindowsFallbacks) {
    extensions.push(".cmd", ".exe", ".bat");
  }
  for (const extension of extensions) {
    names.push(`${command}${extension}`);
  }
  return Array.from(new Set(names));
}

function hasExecutableExtension(command: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(command.split(/[\\/]/).pop() ?? command);
}

function splitPathExtensions(pathExt: string): string[] {
  return pathExt
    .split(";")
    .map((extension) => extension.trim())
    .filter((extension) => !!extension)
    .map((extension) =>
      extension.startsWith(".") ? extension : `.${extension}`,
    );
}

function getPathExt(env: Record<string, string>): string {
  const configured = env.PATHEXT || env.PathExt || "";
  if (configured) return configured;
  if (typeof Services === "undefined") return "";
  return Services.env.get("PATHEXT") || Services.env.get("PathExt") || "";
}

function defaultPathEntries(): string[] {
  const home = getHomeDir();
  const dynamic = [
    home ? PathUtils.join(home, ".local", "bin") : "",
    home ? PathUtils.join(home, "bin") : "",
    home ? PathUtils.join(home, ".cargo", "bin") : "",
    home ? PathUtils.join(home, ".npm-global", "bin") : "",
    home ? PathUtils.join(home, "Library", "pnpm") : "",
  ];
  return [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    ...dynamic,
  ]
    .map((entry) => expandHomePath(entry))
    .filter((entry) => !!entry);
}

function expandHomePath(path: string): string {
  if (!path) return "";
  if (path !== "~" && !path.startsWith("~/") && !path.startsWith("~\\"))
    return path;
  const home = getHomeDir();
  if (!home) return path;
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    if (typeof PathUtils !== "undefined")
      return PathUtils.join(home, path.slice(2));
    return `${home.replace(/[\\/]$/, "")}/${path.slice(2)}`;
  }
  return path;
}

function getHomeDir(): string {
  if (typeof PathUtils !== "undefined") {
    const pathUtils = PathUtils as unknown as { homeDir?: unknown };
    if (typeof pathUtils.homeDir === "string") {
      return pathUtils.homeDir;
    }
  }
  if (typeof Services !== "undefined") {
    const envHome = Services.env.get("HOME") || Services.env.get("USERPROFILE");
    if (envHome) return envHome;
  }

  try {
    if (typeof Zotero === "undefined") return "";
    const zotero = Zotero as unknown as { Profile?: { dir?: unknown } };
    const profileDir = String(zotero.Profile?.dir || "");
    return deriveHomeFromProfileDir(profileDir);
  } catch {
    return "";
  }
}

function getSubprocessModule(): {
  Subprocess: {
    call(options: AcpProcessOptions): Promise<AcpProcess>;
    pathSearch(command: string): Promise<string | null | undefined>;
  };
} {
  return ChromeUtils.importESModule(
    "resource://gre/modules/Subprocess.sys.mjs",
  ) as {
    Subprocess: {
      call(options: AcpProcessOptions): Promise<AcpProcess>;
      pathSearch(command: string): Promise<string | null | undefined>;
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function deriveHomeFromProfileDir(profileDir: string): string {
  if (!profileDir) return "";
  const normalized = profileDir.replace(/\\/g, "/");
  const markers = [
    "/Library/Application Support/Zotero/",
    "/.zotero/",
    "/AppData/",
  ];
  for (const marker of markers) {
    const index = normalized.indexOf(marker);
    if (index > 0) {
      return normalized.slice(0, index);
    }
  }
  return "";
}
