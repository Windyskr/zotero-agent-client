import { assert } from "chai";
import {
  normalizeAgentProfiles,
  normalizeNpxArgs,
  selectDefaultAgent,
} from "../src/modules/acpChatSettings";

describe("ACP chat settings", function () {
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
        command: "npx",
        args: [],
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
        command: "npx",
        args: ["-y", "@zed-industries/codex-acp"],
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
        command: "npx",
      },
    ]);

    assert.deepEqual(profiles, [
      {
        id: "claude",
        name: "Claude",
        command: "npx",
        args: ["-y", "@zed-industries/claude-agent-acp"],
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
    ]);

    assert.deepEqual(profiles, [
      {
        id: "codex",
        name: "Codex",
        command: "npx",
        args: ["-y", "@scope/agent"],
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

  it("drops malformed or unsupported profiles", function () {
    const profiles = normalizeAgentProfiles([
      {
        id: "bad-command",
        name: "Bad",
        command: "node",
        args: ["agent.js"],
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
