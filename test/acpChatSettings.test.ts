import { assert } from "chai";
import {
  normalizeAgentProfiles,
  normalizeNpxArgs,
  normalizeSendKeyMode,
  selectDefaultAgent,
} from "../src/modules/acpChatSettings";

describe("ACP chat settings", function () {
  let previousZotero: unknown;

  beforeEach(function () {
    previousZotero = getRuntime().Zotero;
  });

  afterEach(function () {
    getRuntime().Zotero = previousZotero;
  });

  it("normalizes npx args to require non-interactive install", function () {
    assert.deepEqual(normalizeNpxArgs(["@scope/agent"]), [
      "-y",
      "@scope/agent",
    ]);
    assert.deepEqual(normalizeNpxArgs(["--yes", "@scope/agent"]), [
      "--yes",
      "@scope/agent",
    ]);
  });

  it("normalizes valid agent profiles and string-only env values", function () {
    const profiles = normalizeAgentProfiles([
      {
        id: " codex ",
        name: " Codex ",
        command: " codex-acp ",
        args: [" --stdio "],
        env: {
          PATH: "/opt/homebrew/bin",
          " API_KEY ": "secret",
          TOKEN_VERSION: 2,
        },
      },
    ]);

    assert.deepEqual(profiles, [
      {
        id: "codex",
        name: "Codex",
        command: "codex-acp",
        args: ["--stdio"],
        env: {
          PATH: "/opt/homebrew/bin",
          API_KEY: "secret",
        },
      },
    ]);
  });

  it("allows args and env to be omitted", function () {
    const profiles = normalizeAgentProfiles([
      {
        id: "claude",
        name: "Claude",
        command: "claude-agent-acp",
      },
    ]);

    assert.deepEqual(profiles, [
      {
        id: "claude",
        name: "Claude",
        command: "claude-agent-acp",
        args: [],
        env: {},
      },
    ]);
  });

  it("drops npx profiles without an explicit package", function () {
    const profiles = normalizeAgentProfiles([
      {
        id: "codex",
        name: "Codex",
        command: "npx",
      },
    ]);

    assert.deepEqual(profiles, []);
  });

  it("migrates old bundled npx defaults to executable commands", function () {
    const profiles = normalizeAgentProfiles([
      {
        id: "codex",
        name: "Codex ACP",
        command: "npx.exe",
        args: ["-y", "@zed-industries/codex-acp"],
        env: {
          PATH: "C:\\Program Files\\Volta",
        },
      },
      {
        id: "claude",
        name: "Claude ACP",
        command: "npx",
        args: ["-y", "@agentclientprotocol/claude-agent-acp"],
        env: {
          PATH: "C:\\Program Files\\Volta",
        },
      },
    ]);

    assert.deepEqual(profiles, [
      {
        id: "codex",
        name: "Codex ACP",
        command: "codex-acp",
        args: [],
        env: {},
      },
      {
        id: "claude",
        name: "Claude Code ACP",
        command: "claude-agent-acp",
        args: [],
        env: {},
      },
    ]);
  });

  it("uses the Windows Volta command path when migrating from a Zotero profile", function () {
    getRuntime().Zotero = {
      Profile: {
        dir: "C:\\Users\\Administrator\\AppData\\Roaming\\Zotero\\Zotero\\Profiles\\piko4o23.default",
      },
    };

    const profiles = normalizeAgentProfiles([
      {
        id: "codex",
        name: "Codex ACP",
        command: "npx.exe",
        args: ["-y", "@zed-industries/codex-acp"],
        env: {
          PATH: "C:\\Program Files\\Volta",
        },
      },
    ]);

    assert.deepEqual(profiles, [
      {
        id: "codex",
        name: "Codex ACP",
        command: "C:/Users/Administrator/AppData/Local/Volta/bin/codex-acp.cmd",
        args: [],
        env: {},
      },
    ]);
  });

  it("accepts npx command casing from manual settings", function () {
    const profiles = normalizeAgentProfiles([
      {
        id: "codex",
        name: "Codex",
        command: " NPX ",
        args: ["@scope/agent"],
      },
      {
        id: "windows",
        name: "Windows",
        command: "npx.cmd",
        args: ["@scope/windows-agent"],
      },
    ]);

    assert.deepEqual(profiles, [
      {
        id: "codex",
        name: "Codex",
        command: "npx",
        args: ["-y", "@scope/agent"],
        env: {},
      },
      {
        id: "windows",
        name: "Windows",
        command: "npx",
        args: ["-y", "@scope/windows-agent"],
        env: {},
      },
    ]);
  });

  it("keeps non-npx commands and their arguments unchanged", function () {
    const profiles = normalizeAgentProfiles([
      {
        id: "custom",
        name: "Custom Agent",
        command: " C:\\Tools\\agent.exe ",
        args: [" --stdio ", "config.json"],
      },
    ]);

    assert.deepEqual(profiles, [
      {
        id: "custom",
        name: "Custom Agent",
        command: "C:\\Tools\\agent.exe",
        args: ["--stdio", "config.json"],
        env: {},
      },
    ]);
  });

  it("trims and validates configured default agent IDs", function () {
    const profiles = [
      {
        id: "codex",
        name: "Codex",
        command: "npx",
        args: ["-y", "@scope/agent"],
        env: {},
      },
      {
        id: "claude",
        name: "Claude",
        command: "npx",
        args: ["-y", "@scope/agent"],
        env: {},
      },
    ];

    assert.equal(selectDefaultAgent(profiles, " claude "), "claude");
    assert.equal(selectDefaultAgent(profiles, "missing"), "codex");
    assert.equal(selectDefaultAgent([], " missing "), "missing");
  });

  it("normalizes send shortcut modes", function () {
    assert.equal(normalizeSendKeyMode("enter"), "enter");
    assert.equal(normalizeSendKeyMode(" enter "), "enter");
    assert.equal(normalizeSendKeyMode("ctrlEnter"), "ctrlEnter");
    assert.equal(normalizeSendKeyMode("bad"), "ctrlEnter");
  });

  it("deduplicates profiles by normalized id", function () {
    const profiles = normalizeAgentProfiles([
      {
        id: " codex ",
        name: "Codex",
        command: "npx",
        args: ["@scope/first"],
      },
      {
        id: "codex",
        name: "Codex Duplicate",
        command: "npx",
        args: ["@scope/second"],
      },
    ]);

    assert.lengthOf(profiles, 1);
    assert.deepEqual(profiles[0].args, ["-y", "@scope/first"]);
  });

  it("drops malformed profiles", function () {
    const profiles = normalizeAgentProfiles([
      {
        id: "missing-command",
        name: "Bad",
        command: " ",
        args: [],
        env: {},
      },
      {
        id: "bad-env",
        name: "Bad Env",
        command: "npx",
        args: ["@scope/agent"],
        env: null,
      },
      {
        id: "",
        name: "Missing ID",
        command: "npx",
        args: ["@scope/agent"],
        env: {},
      },
    ]);

    assert.deepEqual(profiles, []);
  });
});

function getRuntime(): typeof globalThis & { Zotero?: unknown } {
  return globalThis as typeof globalThis & { Zotero?: unknown };
}
