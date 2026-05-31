import { assert } from "chai";
import { getComposerKeyAction } from "../src/modules/acpComposerKeys";

describe("ACP composer keys", function () {
  it("keeps the default Ctrl/Command+Enter send behavior", function () {
    assert.equal(
      getComposerKeyAction({ key: "Enter", ctrlKey: true }, "ctrlEnter"),
      "send",
    );
    assert.equal(
      getComposerKeyAction({ key: "Enter", metaKey: true }, "ctrlEnter"),
      "send",
    );
    assert.equal(getComposerKeyAction({ key: "Enter" }, "ctrlEnter"), "none");
  });

  it("allows Enter to send and command-modified Enter to insert newlines", function () {
    assert.equal(getComposerKeyAction({ key: "Enter" }, "enter"), "send");
    assert.equal(
      getComposerKeyAction({ key: "Enter", ctrlKey: true }, "enter"),
      "newline",
    );
    assert.equal(
      getComposerKeyAction({ key: "Enter", metaKey: true }, "enter"),
      "newline",
    );
    assert.equal(
      getComposerKeyAction({ key: "Enter", shiftKey: true }, "enter"),
      "newline",
    );
  });

  it("ignores non-Enter keys", function () {
    assert.equal(getComposerKeyAction({ key: "a" }, "enter"), "none");
  });
});
