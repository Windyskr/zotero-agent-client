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
const MAX_STDERR_SNIPPET_LENGTH = 4_000;

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
  private recentStderr = "";
  private resolvedCommand = "";

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
    this.resolvedCommand = command;
    this.recentStderr = "";
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
    this.recentStderr = "";
    this.resolvedCommand = "";
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
          Zotero.debug(`[acpchat] ignoring non-JSON stdout: ${ignored}`);
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
          this.recentStderr = appendRecentStderr(this.recentStderr, message);
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
    const error = formatAcpExitError({
      exitCode: result.exitCode,
      recentStderr: this.recentStderr,
      resolvedCommand: this.resolvedCommand,
    });
    this.recentStderr = "";
    this.resolvedCommand = "";
    this.rejectPending(error);
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
      this.notifyUpdateListeners(message.params);
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

export function appendRecentStderr(current: string, chunk: string): string {
  const next = current ? `${current}\n${chunk}` : chunk;
  return next.length <= MAX_STDERR_SNIPPET_LENGTH
    ? next
    : next.slice(-MAX_STDERR_SNIPPET_LENGTH);
}

export function formatAcpExitError(options: {
  exitCode: number;
  recentStderr?: string;
  resolvedCommand?: string;
}): Error {
  const { exitCode, recentStderr = "", resolvedCommand = "" } = options;
  const details: string[] = [];
  const stderr = recentStderr.trim();
  if (exitCode === 0) {
    details.push("ACP process exited before completing pending requests");
  } else {
    details.push(`ACP exited with ${exitCode}`);
  }
  if (stderr) {
    details.push(`stderr: ${stderr}`);
  } else {
    details.push("The process exited before responding to initialize.");
  }
  if (shouldAddWindows126Hint(exitCode, resolvedCommand, stderr)) {
    details.push(
      "The default ACP profiles run through npx. On Windows, this usually means Zotero cannot execute npx or a command required by the agent package. Verify Node.js/npm are installed, restart Zotero so it picks up PATH changes, and confirm the agent command works in a normal terminal.",
    );
  }
  return new Error(details.join(" "));
}

export function shouldAddWindows126Hint(
  exitCode: number,
  resolvedCommand: string,
  stderr: string,
): boolean {
  if (exitCode !== 126) return false;
  const command = resolvedCommand.trim().toLowerCase();
  const output = stderr.trim().toLowerCase();
  return (
    command.endsWith("npx") ||
    command.endsWith("npx.cmd") ||
    command.endsWith("npx.exe") ||
    command.endsWith("npx.bat") ||
    output.includes("not recognized") ||
    output.includes("permission denied") ||
    output.includes("is not recognized as an internal or external command") ||
    output.includes("cannot execute")
  );
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
  if (!getEnvironmentValue(next, "PATH", "Path")) {
    const mergedPath = joinPathEntries(collectSearchPathEntries(env));
    if (mergedPath) next.PATH = mergedPath;
  }
  return next;
}

function collectSearchPathEntries(env: Record<string, string>): string[] {
  const pathEntries = splitPathEntries(
    getEnvironmentValue(env, "PATH", "Path"),
  );
  const processPath = splitPathEntries(
    getServiceEnvironmentValue("PATH", "Path"),
  );
  const defaults = defaultPathEntries(env);
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
    .map((entry) => expandHomePath(stripSurroundingQuotes(entry.trim())))
    .filter((entry) => !!entry);
}

export function joinPathEntries(pathEntries: string[]): string {
  const separator = pathEntries.some(isWindowsPathEntry) ? ";" : ":";
  return pathEntries.join(separator);
}

function isWindowsPathEntry(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function stripSurroundingQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  return (first === '"' && last === '"') || (first === "'" && last === "'")
    ? value.slice(1, -1).trim()
    : value;
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
  const configured = getEnvironmentValue(env, "PATHEXT", "PathExt");
  if (configured) return configured;
  return getServiceEnvironmentValue("PATHEXT", "PathExt");
}

function defaultPathEntries(env: Record<string, string> = {}): string[] {
  const home = getHomeDir(env);
  return defaultPathEntriesForHome(home, {
    appData:
      getEnvironmentValue(env, "APPDATA") ||
      getServiceEnvironmentValue("APPDATA"),
    programFiles:
      getEnvironmentValue(env, "ProgramFiles") ||
      getServiceEnvironmentValue("ProgramFiles"),
    programFilesX86:
      getEnvironmentValue(env, "ProgramFiles(x86)") ||
      getServiceEnvironmentValue("ProgramFiles(x86)"),
  });
}

export function defaultPathEntriesForHome(
  home: string,
  options: {
    appData?: string;
    programFiles?: string;
    programFilesX86?: string;
  } = {},
): string[] {
  const isWindowsHome = isWindowsPathEntry(home);
  const appData =
    options.appData ||
    (isWindowsHome ? joinPath(home, "AppData", "Roaming") : "");
  const programFiles =
    options.programFiles || (isWindowsHome ? "C:\\Program Files" : "");
  const programFilesX86 =
    options.programFilesX86 || (isWindowsHome ? "C:\\Program Files (x86)" : "");
  const dynamic = [
    home ? joinPath(home, ".local", "bin") : "",
    home ? joinPath(home, "bin") : "",
    home ? joinPath(home, ".cargo", "bin") : "",
    home ? joinPath(home, ".npm-global", "bin") : "",
    home ? joinPath(home, "Library", "pnpm") : "",
    appData ? joinPath(appData, "npm") : "",
    programFiles ? joinPath(programFiles, "nodejs") : "",
    programFilesX86 ? joinPath(programFilesX86, "nodejs") : "",
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

function getHomeDir(env: Record<string, string> = {}): string {
  const configuredHome = getEnvironmentValue(env, "HOME", "USERPROFILE");
  if (configuredHome) return configuredHome;

  if (typeof PathUtils !== "undefined") {
    const pathUtils = PathUtils as unknown as { homeDir?: unknown };
    if (typeof pathUtils.homeDir === "string") {
      return pathUtils.homeDir;
    }
  }
  if (typeof Services !== "undefined") {
    const envHome = getServiceEnvironmentValue("HOME", "USERPROFILE");
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

function getEnvironmentValue(
  env: Record<string, string>,
  ...names: string[]
): string {
  for (const name of names) {
    const value = env[name];
    if (value) return value;
  }
  const lowerNames = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(env)) {
    if (value && lowerNames.has(key.toLowerCase())) return value;
  }
  return "";
}

function getServiceEnvironmentValue(...names: string[]): string {
  if (typeof Services === "undefined") return "";
  const candidates = new Set<string>();
  for (const name of names) {
    candidates.add(name);
    candidates.add(name.toUpperCase());
    candidates.add(name.toLowerCase());
  }
  for (const name of candidates) {
    const value = Services.env.get(name);
    if (value) return value;
  }
  return "";
}

function joinPath(...parts: string[]): string {
  if (typeof PathUtils !== "undefined") return PathUtils.join(...parts);
  const values = parts.filter((part) => !!part);
  if (!values.length) return "";
  const separator = values.some(isWindowsPathEntry) ? "\\" : "/";
  return values
    .map((part, index) =>
      index === 0
        ? part.replace(/[\\/]+$/, "")
        : part.replace(/^[\\/]+|[\\/]+$/g, ""),
    )
    .filter((part) => !!part)
    .join(separator);
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
