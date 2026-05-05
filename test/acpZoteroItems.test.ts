import { assert } from "chai";
import {
  getZoteroItem,
  getZoteroItems,
  toZoteroItem,
} from "../src/modules/acpZoteroItems";

type ZoteroStub = {
  Items: {
    get(ids: number | number[]): unknown;
  };
};

describe("ACP Zotero item helpers", function () {
  let previousZotero: unknown;

  beforeEach(function () {
    previousZotero = getRuntime().Zotero;
  });

  afterEach(function () {
    getRuntime().Zotero = previousZotero;
  });

  it("narrows record values to Zotero item-like objects", function () {
    const item = { id: 1, attachmentFilename: "paper.pdf" };

    assert.strictEqual(toZoteroItem(item), item);
    assert.isNull(toZoteroItem(null));
    assert.isNull(toZoteroItem("not an item"));
    assert.isNull(toZoteroItem([item]));
  });

  it("reads a single Zotero item through the global item registry", function () {
    const item = { id: 7 };
    getRuntime().Zotero = {
      Items: {
        get(id) {
          return id === 7 ? item : false;
        },
      },
    };

    assert.strictEqual(getZoteroItem(7), item);
    assert.isNull(getZoteroItem(8));
  });

  it("filters invalid batch results from the global item registry", function () {
    const first = { id: 1 };
    const second = { id: 2 };
    getRuntime().Zotero = {
      Items: {
        get(ids) {
          return Array.isArray(ids) ? [first, null, "bad", second] : null;
        },
      },
    };

    assert.deepEqual(getZoteroItems([1, 2]), [first, second]);
  });
});

function getRuntime(): typeof globalThis & { Zotero?: unknown } {
  return globalThis as typeof globalThis & { Zotero?: unknown };
}
