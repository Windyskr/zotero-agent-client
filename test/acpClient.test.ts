import { assert } from "chai";
import {
  closeAllClients,
  deriveHomeFromProfileDir,
  getClient,
  profileConnectionSignature,
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
