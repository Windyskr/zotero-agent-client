import { assert } from "chai";
import { getZoteroProfileDir } from "../src/modules/acpZoteroRuntime";

describe("ACP Zotero runtime helpers", function () {
  let previousZotero: unknown;

  beforeEach(function () {
    previousZotero = getRuntime().Zotero;
  });

  afterEach(function () {
    getRuntime().Zotero = previousZotero;
  });

  it("returns Zotero Profile.dir when it is a string", function () {
    getRuntime().Zotero = {
      Profile: {
        dir: "/tmp/zotero-profile",
      },
    };

    assert.equal(getZoteroProfileDir(), "/tmp/zotero-profile");
  });

  it("returns an empty string when Profile.dir is unavailable", function () {
    getRuntime().Zotero = {};
    assert.equal(getZoteroProfileDir(), "");

    getRuntime().Zotero = {
      Profile: {
        dir: null,
      },
    };
    assert.equal(getZoteroProfileDir(), "");
  });
});

function getRuntime(): typeof globalThis & { Zotero?: unknown } {
  return globalThis as typeof globalThis & { Zotero?: unknown };
}
