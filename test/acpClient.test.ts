import { assert } from "chai";
import {
  AcpClient,
  appendRecentStderr,
  closeAllClients,
  defaultPathEntriesForHome,
  deriveHomeFromProfileDir,
  executableNameCandidates,
  formatAcpExitError,
  getClient,
  isPathLikeCommand,
  joinPathEntries,
  profileConnectionSignature,
  shouldAddWindows126Hint,
  splitPathEntries,
} from "../src/modules/acpClient";
import type { AgentProfile } from "../src/modules/acpChatTypes";

describe("ACP client pool", function () {
  afterEach(function () {
    closeAllClients();
  });

  it("uses stable signatures for env entries regardless of object order", function () {
    assert.equal(
      profileConnectionSignature(makeProfile({ env: { B: "2", A: "1" } })),
      profileConnectionSignature(makeProfile({ env: { A: "1", B: "2" } })),
    );
  });

  it("reuses clients only while connection settings are unchanged", function () {
    const first = getClient(makeProfile());
    const same = getClient(makeProfile({ env: { PATH: "/usr/bin" } }));
    const changed = getClient(
      makeProfile({ args: ["-y", "@scope/other-agent"] }),
    );

    assert.strictEqual(first, same);
    assert.notStrictEqual(first, changed);
  });

  it("recreates clients when the executable command changes", function () {
    const first = getClient(makeProfile({ command: "npx" }));
    const changed = getClient(makeProfile({ command: "/opt/bin/npx" }));

    assert.notStrictEqual(first, changed);
  });

  it("derives home directories from common Zotero profile paths", function () {
    assert.equal(
      deriveHomeFromProfileDir(
        "/Users/ouyang/Library/Application Support/Zotero/Profiles/abc",
      ),
      "/Users/ouyang",
    );
    assert.equal(
      deriveHomeFromProfileDir("/home/ouyang/.zotero/zotero/abc.default"),
      "/home/ouyang",
    );
    assert.equal(
      deriveHomeFromProfileDir(
        "C:\\Users\\ouyang\\AppData\\Roaming\\Zotero\\Zotero\\Profiles\\abc",
      ),
      "C:/Users/ouyang",
    );
    assert.equal(deriveHomeFromProfileDir("/tmp/zotero-profile"), "");
  });

  it("splits and joins search paths for POSIX and Windows", function () {
    assert.deepEqual(splitPathEntries("/usr/local/bin:/usr/bin"), [
      "/usr/local/bin",
      "/usr/bin",
    ]);
    assert.deepEqual(
      splitPathEntries("C:\\Program Files\\nodejs;C:\\Windows\\System32"),
      ["C:\\Program Files\\nodejs", "C:\\Windows\\System32"],
    );
    assert.deepEqual(splitPathEntries("C:\\Program Files\\nodejs"), [
      "C:\\Program Files\\nodejs",
    ]);
    assert.deepEqual(
      splitPathEntries('"C:\\Program Files\\nodejs";"C:\\Tools"'),
      ["C:\\Program Files\\nodejs", "C:\\Tools"],
    );
    assert.equal(
      joinPathEntries(["C:\\Program Files\\nodejs", "C:\\Windows\\System32"]),
      "C:\\Program Files\\nodejs;C:\\Windows\\System32",
    );
    assert.equal(
      joinPathEntries(["/usr/local/bin", "/usr/bin"]),
      "/usr/local/bin:/usr/bin",
    );
  });

  it("detects path-like commands across platforms", function () {
    assert.isFalse(isPathLikeCommand("npx"));
    assert.isTrue(isPathLikeCommand("/usr/local/bin/npx"));
    assert.isTrue(isPathLikeCommand("C:\\Program Files\\nodejs\\npx.cmd"));
    assert.isTrue(isPathLikeCommand("C:/Program Files/nodejs/npx.cmd"));
    assert.isTrue(isPathLikeCommand("\\\\server\\share\\npx.cmd"));
  });

  it("adds Windows executable suffix candidates when needed", function () {
    assert.deepEqual(executableNameCandidates("npx", ".COM;.EXE;.BAT;.CMD"), [
      "npx",
      "npx.COM",
      "npx.EXE",
      "npx.BAT",
      "npx.CMD",
    ]);
    assert.deepEqual(executableNameCandidates("npx.cmd", ".EXE;.CMD"), [
      "npx.cmd",
    ]);
    assert.deepEqual(executableNameCandidates("npx", "", true), [
      "npx",
      "npx.cmd",
      "npx.exe",
      "npx.bat",
    ]);
  });

  it("includes common Windows Node and npm search paths", function () {
    const entries = defaultPathEntriesForHome("C:\\Users\\ouyang", {
      appData: "C:\\Users\\ouyang\\AppData\\Roaming",
      programFiles: "C:\\Program Files",
      programFilesX86: "C:\\Program Files (x86)",
    });

    assert.include(entries, "C:\\Program Files\\nodejs");
    assert.include(entries, "C:\\Program Files (x86)\\nodejs");
    assert.include(entries, "C:\\Users\\ouyang\\AppData\\Roaming\\npm");
  });

  it("keeps notifying update listeners after one listener fails", function () {
    const client = new AcpClient(makeProfile());
    const updates: unknown[] = [];
    client.onUpdate(() => {
      throw new Error("listener failed");
    });
    client.onUpdate((update) => {
      updates.push(update);
    });

    (
      client as unknown as {
        handleMessage(message: unknown): void;
      }
    ).handleMessage({
      jsonrpc: "2.0",
      method: "session/update",
      params: { ok: true },
    });

    assert.deepEqual(updates, [{ ok: true }]);
  });
});

describe("ACP exit diagnostics", function () {
  it("keeps only the most recent stderr text", function () {
    const initial = "first line";
    const chunk = "x".repeat(4_100);
    const result = appendRecentStderr(initial, chunk);

    assert.equal(result.length, 4_000);
    assert.notInclude(result, initial);
    assert.equal(result, chunk.slice(-4_000));
  });

  it("includes stderr in nonzero exit errors", function () {
    const error = formatAcpExitError({
      exitCode: 126,
      recentStderr: "spawned command failed",
      resolvedCommand: "C:/Program Files/nodejs/npx.cmd",
    });

    assert.include(error.message, "ACP exited with 126");
    assert.include(error.message, "stderr: spawned command failed");
  });

  it("adds a Windows-specific hint for npx exit code 126", function () {
    const error = formatAcpExitError({
      exitCode: 126,
      recentStderr: "'claude' is not recognized as an internal or external command",
      resolvedCommand: "C:/Program Files/nodejs/npx.cmd",
    });

    assert.include(error.message, "The default ACP profiles run through npx.");
    assert.include(error.message, "restart Zotero so it picks up PATH changes");
  });

  it("does not add the Windows hint for other exit codes", function () {
    assert.isFalse(
      shouldAddWindows126Hint(1, "C:/Program Files/nodejs/npx.cmd", "failed"),
    );
  });

  it("does not add the Windows hint for unrelated commands", function () {
    assert.isFalse(shouldAddWindows126Hint(126, "/usr/bin/python", "failed"));
  });

  it("describes zero-exit early termination without stderr", function () {
    const error = formatAcpExitError({ exitCode: 0 });

    assert.include(
      error.message,
      "ACP process exited before completing pending requests",
    );
    assert.include(
      error.message,
      "The process exited before responding to initialize.",
    );
  });
});

function makeProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "codex",
    name: "Codex",
    command: "npx",
    args: ["-y", "@scope/agent"],
    env: { PATH: "/usr/bin" },
    ...overrides,
  };
}
