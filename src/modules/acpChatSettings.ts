import { config } from "../../package.json";
import type { AgentProfile, SendKeyMode, Settings } from "./acpChatTypes";
import { getRuntimeHomeDir } from "./acpZoteroRuntime";

const PREF_PREFIX = config.prefsPrefix;

interface AgentProfileInput {
  id: string;
  name: string;
  command: string;
  args?: unknown[];
  env?: Record<string, unknown>;
}

const DEFAULT_AGENT_PROFILES: AgentProfile[] = [
  {
    id: "claude",
    name: "Claude Code ACP",
    command: "claude-agent-acp",
    args: [],
    env: {},
  },
  {
    id: "codex",
    name: "Codex ACP",
    command: "codex-acp",
    args: [],
    env: {},
  },
];

export function getSettings(): Settings {
  const rawProfiles = getJson("agentProfiles", []);
  const configuredProfiles = normalizeAgentProfiles(rawProfiles);
  persistAgentProfilesIfChanged(rawProfiles, configuredProfiles);
  const agentProfiles = configuredProfiles.length
    ? configuredProfiles
    : DEFAULT_AGENT_PROFILES;
  const defaultAgent = selectDefaultAgent(
    agentProfiles,
    getString("defaultAgent", "claude"),
  );
  return {
    agentProfiles,
    defaultAgent,
    sendKeyMode: normalizeSendKeyMode(getString("sendKeyMode", "ctrlEnter")),
    sessionStorePath: getString("sessionStorePath", ""),
  };
}

export function normalizeSendKeyMode(value: string): SendKeyMode {
  return value.trim() === "enter" ? "enter" : "ctrlEnter";
}

export function selectDefaultAgent(
  agentProfiles: AgentProfile[],
  configuredDefaultAgent: string,
): string {
  const normalizedDefaultAgent = configuredDefaultAgent.trim();
  return agentProfiles.some((profile) => profile.id === normalizedDefaultAgent)
    ? normalizedDefaultAgent
    : (agentProfiles[0]?.id ?? normalizedDefaultAgent);
}

function getString(name: string, fallback: string): string {
  const value = Zotero.Prefs.get(`${PREF_PREFIX}.${name}`, true);
  return typeof value === "string" ? value : fallback;
}

function getJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(getString(name, JSON.stringify(fallback))) as T;
  } catch (error) {
    Zotero.logError(error as Error);
    return fallback;
  }
}

export function normalizeAgentProfiles(profiles: unknown): AgentProfile[] {
  if (!Array.isArray(profiles)) return [];
  const normalized: AgentProfile[] = [];
  const seenIds = new Set<string>();
  for (const profile of profiles) {
    if (!isAgentProfileInput(profile)) continue;
    try {
      const normalizedProfile = normalizeAgentProfile(
        migrateBundledNpxProfile(profile),
      );
      if (seenIds.has(normalizedProfile.id)) continue;
      seenIds.add(normalizedProfile.id);
      normalized.push(normalizedProfile);
    } catch (error) {
      logSkippedAgentProfile(error);
    }
  }
  return normalized;
}

function migrateBundledNpxProfile(
  profile: AgentProfileInput,
): AgentProfileInput {
  const id = profile.id.trim();
  const command = profile.command.trim().toLowerCase();
  if (!isNpxCommand(command)) return profile;
  const args = (profile.args ?? []).filter(
    (arg): arg is string => typeof arg === "string" && !!arg.trim(),
  );
  const packageArg = args.find((arg) => !arg.trim().startsWith("-"))?.trim();
  if (id === "codex" && packageArg === "@zed-industries/codex-acp") {
    return {
      id: profile.id,
      name: profile.name,
      command: preferredBundledCommand("codex-acp"),
      args: [],
      env: {},
    };
  }
  if (
    id === "claude" &&
    (packageArg === "@zed-industries/claude-agent-acp" ||
      packageArg === "@zed-industries/claude-code-acp" ||
      packageArg === "@agentclientprotocol/claude-agent-acp")
  ) {
    return {
      id: profile.id,
      name:
        profile.name.trim() === "Claude ACP" ? "Claude Code ACP" : profile.name,
      command: preferredBundledCommand("claude-agent-acp"),
      args: [],
      env: {},
    };
  }
  return profile;
}

function preferredBundledCommand(commandName: string): string {
  return windowsVoltaCommand(commandName) || commandName;
}

function windowsVoltaCommand(commandName: string): string {
  const home = getRuntimeHomeDir();
  if (!/^[A-Za-z]:[\\/]/.test(home)) return "";
  return `${home.replace(/\\/g, "/").replace(/\/$/, "")}/AppData/Local/Volta/bin/${commandName}.cmd`;
}

function normalizeAgentProfile(profile: AgentProfileInput): AgentProfile {
  const id = profile.id.trim();
  const name = profile.name.trim();
  const command = normalizeAgentCommand(profile.command);
  if (!id || !name) {
    throw new Error("Agent profiles require non-empty id and name.");
  }
  if (!command) {
    throw new Error(`Agent profile "${id}" requires a command.`);
  }
  const args = (profile.args ?? []).filter(
    (arg): arg is string => typeof arg === "string" && !!arg.trim(),
  );
  const normalizedArgs = normalizeAgentArgs(command, args);
  if (
    isNpxCommand(command) &&
    !normalizedArgs.find((arg) => !arg.startsWith("-"))
  ) {
    throw new Error(
      `NPX mode: missing package name in args for agent "${id}".`,
    );
  }
  return {
    id,
    name,
    command,
    args: normalizedArgs,
    env: normalizeEnvironment(profile.env ?? {}),
  };
}

function normalizeAgentCommand(command: string): string {
  const trimmed = command.trim();
  if (isNpxCommand(trimmed)) return "npx";
  return trimmed;
}

function normalizeAgentArgs(command: string, args: string[]): string[] {
  if (!isNpxCommand(command)) {
    return args.map((arg) => arg.trim()).filter((arg) => !!arg);
  }
  return normalizeNpxArgs(args);
}

function isNpxCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return (
    normalized === "npx" ||
    normalized === "npx.cmd" ||
    normalized === "npx.exe" ||
    normalized === "npx.bat"
  );
}

export function normalizeNpxArgs(args: string[]): string[] {
  const clean = args.map((arg) => arg.trim()).filter((arg) => !!arg);
  if (!clean.length) return clean;
  if (clean[0] === "-y" || clean[0] === "--yes") return clean;
  return ["-y", ...clean];
}

function normalizeEnvironment(
  env: Record<string, unknown>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(env)) {
    const key = rawKey.trim();
    if (!key || typeof value !== "string") continue;
    normalized[key] = value;
  }
  return normalized;
}

function persistAgentProfilesIfChanged(
  rawProfiles: unknown,
  profiles: AgentProfile[],
): void {
  if (!Array.isArray(rawProfiles) || !profiles.length) return;
  const next = JSON.stringify(profiles);
  if (safeJsonStringify(rawProfiles) === next) return;
  try {
    if (typeof Zotero !== "undefined" && Zotero.Prefs?.set) {
      Zotero.Prefs.set(`${PREF_PREFIX}.agentProfiles`, next, true);
    }
  } catch (error) {
    logSkippedAgentProfile(error);
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function isAgentProfileInput(profile: unknown): profile is AgentProfileInput {
  if (!isRecord(profile)) return false;
  return (
    typeof profile.id === "string" &&
    typeof profile.name === "string" &&
    typeof profile.command === "string" &&
    (profile.args === undefined || Array.isArray(profile.args)) &&
    (profile.env === undefined || isRecord(profile.env))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function logSkippedAgentProfile(error: unknown): void {
  try {
    if (typeof Zotero !== "undefined" && typeof Zotero.debug === "function") {
      Zotero.debug(`[acpchat] skip invalid agent profile: ${String(error)}`);
    }
  } catch {
    // Settings normalization can be tested outside Zotero.
  }
}
