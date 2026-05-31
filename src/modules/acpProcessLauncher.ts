import type { AgentProfile } from "./acpChatTypes";
import { normalizeNpxArgs } from "./acpChatSettings";
import { ACP_SPAWN_TIMEOUT_MS, withTimeout } from "./acpChatUtils";
import {
  getRuntimeHomeDir,
  getServiceEnvironmentValue,
  getZoteroProfileDir,
} from "./acpZoteroRuntime";

export { deriveHomeFromProfileDir } from "./acpZoteroRuntime";

export interface AcpProcessOptions {
  command: string;
  arguments: string[];
  environment?: Record<string, string>;
  environmentAppend?: boolean;
}

export interface AcpProcess {
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

export type AcpLaunchStrategy = "direct" | "cmd";

export interface AcpProcessLaunchPlan {
  options: AcpProcessOptions;
  diagnosticCommand: string;
  resolvedCommand: string;
  strategy: AcpLaunchStrategy;
  environment?: Record<string, string>;
}

export interface AcpLaunchedProcess {
  process: AcpProcess;
  plan: AcpProcessLaunchPlan;
}

export async function launchAcpProcess(
  profile: AgentProfile,
): Promise<AcpLaunchedProcess> {
  const plan = await buildAcpProcessLaunchPlan(profile);
  debug(
    `[acpchat] starting ${profile.id}: ${JSON.stringify({
      arguments: plan.options.arguments,
      command: plan.options.command,
      diagnosticCommand: plan.diagnosticCommand,
      strategy: plan.strategy,
    })}`,
  );
  void writeAcpSpawnDebug({
    arguments: plan.options.arguments,
    command: plan.options.command,
    diagnosticCommand: plan.diagnosticCommand,
    environment: plan.environment,
    profileId: profile.id,
    profileName: profile.name,
    resolvedCommand: plan.resolvedCommand,
    strategy: plan.strategy,
  });

  const { Subprocess } = getSubprocessModule();
  let process: AcpProcess;
  try {
    process = await withTimeout(
      Subprocess.call(plan.options),
      ACP_SPAWN_TIMEOUT_MS,
      `Timed out starting ACP agent: ${profile.name}`,
    );
  } catch (error) {
    throw formatAcpLaunchError(error, plan);
  }
  return { process, plan };
}

export async function buildAcpProcessLaunchPlan(
  profile: AgentProfile,
): Promise<AcpProcessLaunchPlan> {
  const requestedCommand = profile.command.trim();
  const profileArgs = normalizeProfileArguments(profile);
  if (isNpxCommandName(requestedCommand)) {
    const packageArg = profileArgs.find((arg) => !arg.startsWith("-"));
    if (!packageArg) {
      throw new Error(
        "NPX mode requires a package name in agentProfiles.args.",
      );
    }
  }

  const resolvedCommand = await resolveExecutableCommand(requestedCommand);
  const environment = normalizeProcessEnvironment(profile.env ?? {});
  return prepareAcpProcessOptions(resolvedCommand, profileArgs, environment);
}

function normalizeProfileArguments(profile: AgentProfile): string[] {
  const args = (profile.args ?? []).map((arg) => arg.trim()).filter(Boolean);
  return isNpxCommandName(profile.command) ? normalizeNpxArgs(args) : args;
}

export function prepareAcpProcessOptions(
  command: string,
  args: string[],
  environment?: Record<string, string>,
): AcpProcessLaunchPlan {
  const options = shouldWrapWindowsCommand(command)
    ? {
        command: getCmdExecutable(environment ?? {}),
        arguments: ["/d", "/s", "/c", quoteCmdArgumentList([command, ...args])],
      }
    : { command, arguments: args };
  return {
    options: withEnvironment(options, environment),
    diagnosticCommand: command,
    resolvedCommand: command,
    strategy: options.command === command ? "direct" : "cmd",
    environment,
  };
}

function withEnvironment(
  options: AcpProcessOptions,
  environment?: Record<string, string>,
): AcpProcessOptions {
  if (!environment || !Object.keys(environment).length) return options;
  return {
    ...options,
    environment,
    environmentAppend: true,
  };
}

export function isWindowsBatchCommand(command: string): boolean {
  return /\.(cmd|bat)$/i.test(command.trim());
}

function shouldWrapWindowsCommand(command: string): boolean {
  return isWindowsBatchCommand(command) || isWindowsPathEntry(command.trim());
}

function isNpxCommandName(command: string): boolean {
  const executableName = basename(command.trim()).toLowerCase();
  return (
    executableName === "npx" || /^npx\.(exe|cmd|bat)$/.test(executableName)
  );
}

export function quoteCmdArgumentList(args: string[]): string {
  return args.map(quoteCmdArgument).join(" ");
}

function quoteCmdArgument(arg: string): string {
  if (!arg) return '""';
  if (!/[\s"&|<>^()%!]/.test(arg)) return arg;
  return `"${arg.replace(/(["^&|<>%])/g, "^$1")}"`;
}

function getCmdExecutable(environment: Record<string, string>): string {
  return (
    getEnvironmentValue(environment, "ComSpec", "COMSPEC") ||
    getServiceEnvironmentValue("ComSpec", "COMSPEC") ||
    defaultCmdExecutable(environment)
  );
}

function formatAcpLaunchError(
  error: unknown,
  plan: AcpProcessLaunchPlan,
): Error {
  const details = [
    `Failed to start ACP process: ${errorToMessage(error)}`,
    `Strategy: ${plan.strategy}`,
    `Command: ${plan.options.command}`,
    `Arguments: ${formatDisplayArguments(plan.options.arguments)}`,
    `Diagnostic command: ${plan.diagnosticCommand}`,
    `Resolved command: ${plan.resolvedCommand}`,
    `Environment keys: ${formatEnvironmentKeys(plan.environment ?? {})}`,
    `PATH entries: ${formatPathEntries(plan.environment ?? {})}`,
    `Zotero profile: ${safeZoteroProfileDir() || "(unknown)"}`,
  ];
  return new Error(details.join("\n"));
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.stack || error.name;
  if (isRecord(error)) {
    const details = collectErrorDetails(error);
    const message =
      typeof details.message === "string" && details.message.trim()
        ? details.message.trim()
        : "";
    const serialized = safeJsonStringify(details);
    if (message && serialized && serialized !== "{}") {
      return `${message} ${serialized}`;
    }
    if (message) return message;
    if (serialized && serialized !== "{}") return serialized;
  }
  try {
    return String(error);
  } catch {
    return Object.prototype.toString.call(error);
  }
}

function collectErrorDetails(
  error: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(error)) {
    copyErrorDetail(error, details, key);
  }
  for (const key of [
    "message",
    "name",
    "result",
    "resultName",
    "filename",
    "fileName",
    "lineNumber",
    "columnNumber",
    "stack",
    "operation",
    "command",
    "arguments",
  ]) {
    if (Object.hasOwn(details, key)) continue;
    copyErrorDetail(error, details, key);
  }
  return details;
}

function copyErrorDetail(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  key: string,
): void {
  try {
    const value = source[key];
    if (value !== undefined && typeof value !== "function") {
      target[key] = normalizeErrorDetail(value);
    }
  } catch {
    // Some native error objects throw while reading optional fields.
  }
}

function normalizeErrorDetail(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    };
  }
  return value;
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (typeof nested === "bigint") return nested.toString();
      if (typeof nested === "function") {
        return `[Function ${nested.name || "anonymous"}]`;
      }
      if (nested && typeof nested === "object") {
        if (seen.has(nested)) return "[Circular]";
        seen.add(nested);
      }
      return nested;
    });
  } catch {
    return "";
  }
}

function formatDisplayArguments(args: string[]): string {
  if (!args.length) return "(none)";
  return args.map(formatDisplayArgument).join(" ");
}

function formatDisplayArgument(arg: string): string {
  if (!arg) return '""';
  return /[\s"]/g.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function formatEnvironmentKeys(environment: Record<string, string>): string {
  const keys = Object.keys(environment).sort((left, right) =>
    left.localeCompare(right),
  );
  return keys.length ? keys.join(", ") : "(none)";
}

function formatPathEntries(environment: Record<string, string>): string {
  const entries = splitPathEntries(
    getEnvironmentValue(environment, "PATH", "Path"),
  );
  if (!entries.length) return "(none)";
  const visibleEntries = entries.slice(0, 10);
  const suffix =
    entries.length > visibleEntries.length
      ? ` ... (+${entries.length - visibleEntries.length} more)`
      : "";
  return `${visibleEntries.join("; ")}${suffix}`;
}

function safeZoteroProfileDir(): string {
  try {
    return getZoteroProfileDir();
  } catch {
    return "";
  }
}

function debug(message: string): void {
  try {
    if (typeof Zotero !== "undefined" && typeof Zotero.debug === "function") {
      Zotero.debug(message);
    }
  } catch {
    // Tests and some launch failures can run without a complete Zotero global.
  }
}

function defaultCmdExecutable(environment: Record<string, string>): string {
  const systemRoot =
    getEnvironmentValue(environment, "SystemRoot", "SYSTEMROOT", "windir") ||
    getServiceEnvironmentValue("SystemRoot", "SYSTEMROOT", "windir") ||
    "C:\\Windows";
  return joinPath(systemRoot, "System32", "cmd.exe");
}

async function resolveExecutableCommand(command: string): Promise<string> {
  const normalizedCommand = expandHomePath(command.trim());
  if (!normalizedCommand) {
    throw new Error("ACP command is empty");
  }
  if (isPathLikeCommand(normalizedCommand)) {
    return normalizedCommand;
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
      "Install the ACP agent command and ensure it is available to Zotero.",
  );
}

export function normalizeProcessEnvironment(
  env: Record<string, string>,
): Record<string, string> | undefined {
  const entries = Object.entries(env).filter(
    ([key, value]) => !!key.trim() && value !== undefined,
  );
  if (!entries.length) return undefined;
  return Object.fromEntries(entries);
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
  return /\.[A-Za-z0-9]+$/.test(basename(command));
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
  return getRuntimeHomeDir();
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

async function writeAcpSpawnDebug(
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const profileDir = getZoteroProfileDir();
    if (!profileDir) return;
    await IOUtils.writeUTF8(
      PathUtils.join(profileDir, "agentclient-spawn-debug.json"),
      JSON.stringify({ ...data, time: new Date().toISOString() }, null, 2),
    );
  } catch {
    // Debug trace only; ACP startup should not depend on writing this file.
  }
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
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
