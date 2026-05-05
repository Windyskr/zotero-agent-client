import { config } from "../../package.json";
import type { AgentProfile, Settings } from "./acpChatTypes";

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
    id: "codex",
    name: "Codex ACP",
    command: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
    env: {},
  },
  {
    id: "claude",
    name: "Claude ACP",
    command: "npx",
    args: ["-y", "@zed-industries/claude-agent-acp"],
    env: {},
  },
];

export function getSettings(): Settings {
  const configuredProfiles = normalizeAgentProfiles(
    getJson("agentProfiles", []),
  );
  const agentProfiles = configuredProfiles.length
    ? configuredProfiles
    : DEFAULT_AGENT_PROFILES;
  const configuredDefaultAgent = getString("defaultAgent", "codex");
  const defaultAgent = agentProfiles.some(
    (profile) => profile.id === configuredDefaultAgent,
  )
    ? configuredDefaultAgent
    : (agentProfiles[0]?.id ?? configuredDefaultAgent);
  return {
    agentProfiles,
    defaultAgent,
    sessionStorePath: getString("sessionStorePath", ""),
    defaultTemplate: getString("defaultTemplate", "{{prompt}}"),
  };
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
      const normalizedProfile = normalizeAgentProfile(profile);
      if (seenIds.has(normalizedProfile.id)) continue;
      seenIds.add(normalizedProfile.id);
      normalized.push(normalizedProfile);
    } catch (error) {
      logSkippedAgentProfile(error);
    }
  }
  return normalized;
}

function normalizeAgentProfile(profile: AgentProfileInput): AgentProfile {
  const id = profile.id.trim();
  const name = profile.name.trim();
  const command = profile.command.trim();
  if (!id || !name) {
    throw new Error("Agent profiles require non-empty id and name.");
  }
  if (command !== "npx") {
    throw new Error(
      `NPX-only mode: unsupported agent command "${profile.command}".`,
    );
  }
  const args = (profile.args ?? []).filter(
    (arg): arg is string => typeof arg === "string" && !!arg.trim(),
  );
  const defaultPackage = defaultNpxPackageForProfile(id);
  const normalizedArgs =
    args.length > 0
      ? normalizeNpxArgs(args)
      : defaultPackage
        ? ["-y", defaultPackage]
        : [];
  if (!normalizedArgs.find((arg) => !arg.startsWith("-"))) {
    throw new Error(
      `NPX-only mode: missing package name in args for agent "${id}".`,
    );
  }
  return {
    id,
    name,
    command: "npx",
    args: normalizedArgs,
    env: normalizeEnvironment(profile.env ?? {}),
  };
}

function defaultNpxPackageForProfile(profileId: string): string | null {
  if (profileId === "codex") return "@zed-industries/codex-acp";
  if (profileId === "claude") return "@zed-industries/claude-agent-acp";
  return null;
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
