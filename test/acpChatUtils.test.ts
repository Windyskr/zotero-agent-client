import { assert } from "chai";
import {
  basename,
  dirname,
  inferMimeType,
  normalizeConfigOptions,
  pathToFileUri,
  renderTemplate,
  simpleHash,
  toMessage,
} from "../src/modules/acpChatUtils";

describe("ACP chat utilities", function () {
  it("renders supported prompt template variables", function () {
    assert.equal(
      renderTemplate("{{title}} {{ year }} {{prompt}} {{unknown}}", {
        title: "Paper",
        year: "2026",
        prompt: "Summarize",
      }),
      "Paper 2026 Summarize {{unknown}}",
    );
  });

  it("converts local paths to encoded file URIs", function () {
    assert.equal(
      pathToFileUri("/tmp/My Paper.pdf"),
      "file:///tmp/My%20Paper.pdf",
    );
  });

  it("extracts path names and parent directories", function () {
    assert.equal(basename("/tmp/paper.pdf"), "paper.pdf");
    assert.equal(basename("C:\\tmp\\paper.pdf"), "paper.pdf");
    assert.equal(dirname("/tmp/paper.pdf"), "/tmp");
    assert.equal(dirname("C:\\tmp\\paper.pdf"), "C:/tmp");
  });

  it("infers known mime types from file names", function () {
    assert.equal(inferMimeType("/tmp/paper.PDF"), "application/pdf");
    assert.equal(inferMimeType("/tmp/data.csv"), "text/csv");
    assert.isUndefined(inferMimeType("/tmp/archive.zip"));
  });

  it("normalizes ACP config options", function () {
    assert.deepEqual(
      normalizeConfigOptions([
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "gpt",
          options: [
            { value: "gpt", name: "GPT", description: "Default" },
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

  it("creates stable simple hashes and stringifies errors", function () {
    assert.equal(simpleHash("paper"), simpleHash("paper"));
    assert.match(simpleHash("paper"), /^[0-9a-f]{8}$/);
    assert.equal(toMessage(new Error("failed")), "failed");
    assert.equal(toMessage("plain"), "plain");
  });
});
