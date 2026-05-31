import { assert } from "chai";
import {
  AcpClient,
  closeAllClients,
  getClient,
  profileConnectionSignature,
} from "../src/modules/acpClient";
import {
  deriveHomeFromProfileDir,
  executableNameCandidates,
  isWindowsBatchCommand,
  isPathLikeCommand,
  joinPathEntries,
  normalizeProcessEnvironment,
  prepareAcpProcessOptions,
  quoteCmdArgumentList,
  splitPathEntries,
} from "../src/modules/acpProcessLauncher";
import {
  appendRecentStderr,
  AcpStdioTransport,
  formatAcpExitError,
  shouldAddWindows126Hint,
} from "../src/modules/acpStdioTransport";
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

  it("wraps Windows batch commands through cmd.exe for subprocess launch", function () {
    const { options, diagnosticCommand, strategy } = prepareAcpProcessOptions(
      "C:\\Program Files\\nodejs\\npx.cmd",
      ["-y", "@scope/agent"],
      { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
    );

    assert.equal(options.command, "C:\\Windows\\System32\\cmd.exe");
    assert.deepEqual(options.arguments, [
      "/d",
      "/s",
      "/c",
      '"C:\\Program Files\\nodejs\\npx.cmd" -y @scope/agent',
    ]);
    assert.equal(
      options.environment?.ComSpec,
      "C:\\Windows\\System32\\cmd.exe",
    );
    assert.isTrue(options.environmentAppend);
    assert.equal(diagnosticCommand, "C:\\Program Files\\nodejs\\npx.cmd");
    assert.equal(strategy, "cmd");
  });

  it("adds launch diagnostics when subprocess creation fails", async function () {
    const originalChromeUtils = (
      globalThis as unknown as {
        ChromeUtils?: unknown;
      }
    ).ChromeUtils;
    (
      globalThis as unknown as {
        ChromeUtils?: unknown;
      }
    ).ChromeUtils = {
      importESModule: () => ({
        Subprocess: {
          call: async () => {
            throw {
              message: "Failed to create process",
              result: 2147500037,
            };
          },
          pathSearch: async () => null,
        },
      }),
    };
    try {
      await import("../src/modules/acpProcessLauncher").then(
        async ({ launchAcpProcess }) => {
          try {
            await launchAcpProcess(
              makeProfile({ command: "/usr/local/bin/custom", args: [] }),
            );
            assert.fail("Expected launchAcpProcess to fail");
          } catch (error) {
            const message = (error as Error).message;
            assert.include(message, "Failed to start ACP process");
            assert.include(message, "Failed to create process");
            assert.include(message, '"result":2147500037');
            assert.include(message, "Strategy: direct");
            assert.include(message, "Command: /usr/local/bin/custom");
            assert.include(message, "Arguments: (none)");
          }
        },
      );
    } finally {
      (
        globalThis as unknown as {
          ChromeUtils?: unknown;
        }
      ).ChromeUtils = originalChromeUtils;
    }
  });

  it("wraps Windows path commands through cmd.exe", function () {
    const { options, diagnosticCommand } = prepareAcpProcessOptions(
      "C:\\Program Files\\Volta\\npx.exe",
      ["-y", "@scope/agent"],
      { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
    );

    assert.equal(options.command, "C:\\Windows\\System32\\cmd.exe");
    assert.deepEqual(options.arguments, [
      "/d",
      "/s",
      "/c",
      '"C:\\Program Files\\Volta\\npx.exe" -y @scope/agent',
    ]);
    assert.equal(diagnosticCommand, "C:\\Program Files\\Volta\\npx.exe");
  });

  it("wraps extensionless Windows path commands through cmd.exe", function () {
    const { options, diagnosticCommand } = prepareAcpProcessOptions(
      "C:\\Users\\ouyang\\AppData\\Local\\Volta\\tools\\image\\npm\\11.15.0\\bin\\npx",
      ["-y", "@scope/agent"],
      { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
    );

    assert.equal(options.command, "C:\\Windows\\System32\\cmd.exe");
    assert.deepEqual(options.arguments, [
      "/d",
      "/s",
      "/c",
      "C:\\Users\\ouyang\\AppData\\Local\\Volta\\tools\\image\\npm\\11.15.0\\bin\\npx -y @scope/agent",
    ]);
    assert.equal(
      diagnosticCommand,
      "C:\\Users\\ouyang\\AppData\\Local\\Volta\\tools\\image\\npm\\11.15.0\\bin\\npx",
    );
  });

  it("quotes cmd argument lists for paths and shell metacharacters", function () {
    assert.equal(
      quoteCmdArgumentList([
        "C:\\Program Files\\Volta\\npx.exe",
        "-y",
        "@scope/agent",
        "value with spaces",
        "a&b",
        "%PATH%",
      ]),
      '"C:\\Program Files\\Volta\\npx.exe" -y @scope/agent "value with spaces" "a^&b" "^%PATH^%"',
    );
  });

  it("leaves non-batch commands unchanged for subprocess launch", function () {
    const { options, strategy } = prepareAcpProcessOptions(
      "/usr/local/bin/custom",
      ["-y", "@scope/agent"],
    );

    assert.equal(options.command, "/usr/local/bin/custom");
    assert.deepEqual(options.arguments, ["-y", "@scope/agent"]);
    assert.isUndefined(options.environment);
    assert.isUndefined(options.environmentAppend);
    assert.equal(strategy, "direct");
  });

  it("detects only Windows cmd and bat wrappers as batch commands", function () {
    assert.isTrue(isWindowsBatchCommand("npx.cmd"));
    assert.isTrue(isWindowsBatchCommand("C:\\Tools\\run.BAT"));
    assert.isFalse(isWindowsBatchCommand("npx.exe"));
    assert.isFalse(isWindowsBatchCommand("/usr/local/bin/npx"));
  });

  it("passes only explicitly configured environment entries", function () {
    assert.isUndefined(normalizeProcessEnvironment({}));
    assert.deepEqual(
      normalizeProcessEnvironment({
        " API_KEY ": "secret",
        PATH: "C:\\Existing",
      }),
      {
        " API_KEY ": "secret",
        PATH: "C:\\Existing",
      },
    );
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
        notifyUpdateListeners(update: unknown): void;
      }
    ).notifyUpdateListeners({ ok: true });

    assert.deepEqual(updates, [{ ok: true }]);
  });

  it("notifies listeners when the ACP transport closes unexpectedly", async function () {
    let finishWait: (value: { exitCode: number }) => void = () => {};
    const closed = new Promise<Error>((resolve) => {
      const transport = new AcpStdioTransport(
        {
          stdin: {
            write: () => {},
            close: () => {},
          },
          stdout: {
            readString: async () => "",
          },
          wait: () =>
            new Promise<{ exitCode: number }>((resolveWait) => {
              finishWait = resolveWait;
            }),
          kill: () => {},
        },
        {
          command: "npx.cmd",
          options: { command: "npx.cmd", arguments: [] },
          diagnosticCommand: "npx.cmd",
          environment: {},
          resolvedCommand: "npx.cmd",
          strategy: "direct",
        },
      );
      transport.onClose(resolve);
    });

    finishWait({ exitCode: 0 });
    const error = await closed;

    assert.include(
      error.message,
      "ACP process exited before completing pending requests",
    );
  });

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
      recentStderr:
        "'claude' is not recognized as an internal or external command",
      resolvedCommand: "C:/Program Files/nodejs/npx.cmd",
    });

    assert.include(error.message, "npx or Windows command-wrapper failure");
    assert.include(error.message, "restart Zotero after changing PATH");
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
