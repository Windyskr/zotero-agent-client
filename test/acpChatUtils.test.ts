import { assert } from "chai";
import {
  basename,
  dirname,
  inferMimeType,
  normalizeConfigOptions,
  pathToFileUri,
  simpleHash,
  toMessage,
} from "../src/modules/acpChatUtils";

describe("ACP chat utilities", function () {
  beforeEach(function () {
    getRuntime().PathUtils = {
      filename(path: string) {
        return path.split(/[\\/]/).pop() || path;
      },
      parent(path: string) {
        const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
        if (index <= 0) return null;
        const parent = path.slice(0, index);
        return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
      },
    };
    getRuntime().Zotero = {
      File: {
        pathToFileURI(path: string) {
          return `file-uri:${path}`;
        },
        pathToFile(path: string) {
          const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
          const parent =
            index > 0
              ? path.slice(0, index).replace(/^([A-Za-z]:)$/, "$1\\")
              : path;
          return { parent: { path: parent } };
        },
      },
    };
  });

  afterEach(function () {
    getRuntime().PathUtils = undefined;
    getRuntime().Zotero = undefined;
  });

  it("uses Zotero file APIs for file URIs", function () {
    assert.equal(
      pathToFileUri("C:\\Users\\ouyang\\My Paper.pdf"),
      "file-uri:C:\\Users\\ouyang\\My Paper.pdf",
    );
  });

  it("extracts path names and parent directories", function () {
    assert.equal(basename("/tmp/paper.pdf"), "paper.pdf");
    assert.equal(basename("C:\\tmp\\paper.pdf"), "paper.pdf");
    assert.equal(dirname("/tmp/paper.pdf"), "/tmp");
    assert.equal(dirname("C:\\tmp\\paper.pdf"), "C:\\tmp");
    assert.equal(dirname("C:\\paper.pdf"), "C:\\");
    assert.equal(dirname("\\\\server\\share\\paper.pdf"), "\\\\server\\share");
  });

  it("infers known mime types from file names", function () {
    assert.equal(inferMimeType("/tmp/paper.PDF"), "application/pdf");
    assert.equal(inferMimeType("/tmp/data.csv"), "text/csv");
    assert.equal(
      inferMimeType("/tmp/notes.docx"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    assert.equal(inferMimeType("/tmp/refs.bib"), "text/x-bibtex");
    assert.equal(
      inferMimeType("/tmp/export.ris"),
      "application/x-research-info-systems",
    );
    assert.equal(inferMimeType("/tmp/page.html"), "text/html");
    assert.isUndefined(inferMimeType("/tmp/archive.zip"));
  });

  it("normalizes ACP config options", function () {
    assert.deepEqual(
      normalizeConfigOptions([
        {
          id: " model ",
          name: " Model ",
          category: " model ",
          type: "select",
          currentValue: " gpt ",
          options: [
            { value: " gpt ", name: " GPT ", description: " Default " },
            { value: "gpt", name: "Duplicate" },
            { value: " ", name: "Blank value" },
            { value: "other", name: " " },
            { value: 1, name: "Bad" },
          ],
        },
        {
          id: "bad",
          name: "Bad",
          type: "text",
          currentValue: "bad",
          options: [],
        },
      ]),
      [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "gpt",
          options: [{ value: "gpt", name: "GPT", description: "Default" }],
        },
      ],
    );
  });

  it("falls back to the first config option value when current value is invalid", function () {
    assert.deepEqual(
      normalizeConfigOptions([
        {
          id: "model",
          name: "Model",
          type: "select",
          currentValue: "missing",
          options: [
            { value: "gpt-1", name: "GPT 1" },
            { value: "gpt-2", name: "GPT 2" },
          ],
        },
      ]),
      [
        {
          id: "model",
          name: "Model",
          type: "select",
          currentValue: "gpt-1",
          options: [
            { value: "gpt-1", name: "GPT 1" },
            { value: "gpt-2", name: "GPT 2" },
          ],
        },
      ],
    );
  });

  it("creates stable simple hashes and stringifies errors", function () {
    assert.equal(simpleHash("paper"), simpleHash("paper"));
    assert.match(simpleHash("paper"), /^[0-9a-f]{8}$/);
    assert.equal(toMessage(new Error("failed")), "failed");
    assert.equal(toMessage({ message: "failed object" }), "failed object");
    assert.equal(toMessage({ code: "bad_request" }), '{"code":"bad_request"}');
    assert.equal(toMessage("plain"), "plain");
  });
});

function getRuntime(): typeof globalThis & {
  PathUtils?: unknown;
  Zotero?: unknown;
} {
  return globalThis as typeof globalThis & {
    PathUtils?: unknown;
    Zotero?: unknown;
  };
}
