import { assert } from "chai";
import type {
  AttachmentContext,
  PdfContext,
} from "../src/modules/acpChatTypes";
import {
  makePromptContent,
  promptTextOrNull,
} from "../src/modules/acpPromptContent";

describe("ACP prompt content", function () {
  it("always starts with the prompt text", function () {
    assert.deepEqual(makePromptContent("summarize", pdf, false, null), [
      { type: "text", text: "summarize" },
    ]);
  });

  it("includes the active PDF when requested", function () {
    assert.deepEqual(makePromptContent("summarize", pdf, true, null), [
      { type: "text", text: "summarize" },
      {
        type: "resource_link",
        uri: "file:///tmp/paper.pdf",
        name: "paper.pdf",
        mimeType: "application/pdf",
        size: 123,
      },
    ]);
  });

  it("includes an additional attachment independently of PDF inclusion", function () {
    assert.deepEqual(makePromptContent("compare", pdf, false, attachment), [
      { type: "text", text: "compare" },
      {
        type: "resource_link",
        uri: "file:///tmp/data.csv",
        name: "data.csv",
        mimeType: "text/csv",
        size: null,
      },
    ]);
  });

  it("deduplicates resources by URI", function () {
    assert.deepEqual(
      makePromptContent("summarize", pdf, true, {
        fileName: "paper-copy.pdf",
        filePath: "/tmp/paper.pdf",
        fileUri: pdf.fileUri,
        fileSize: pdf.fileSize,
        mimeType: "application/pdf",
      }),
      [
        { type: "text", text: "summarize" },
        {
          type: "resource_link",
          uri: "file:///tmp/paper.pdf",
          name: "paper.pdf",
          mimeType: "application/pdf",
          size: 123,
        },
      ],
    );
  });

  it("preserves non-empty prompt text exactly while rejecting blanks", function () {
    assert.equal(
      promptTextOrNull("  keep my spacing  "),
      "  keep my spacing  ",
    );
    assert.isNull(promptTextOrNull(" \n\t "));
  });
});

const pdf: PdfContext = {
  itemID: 1,
  libraryID: 2,
  sourceItemID: 3,
  title: "Paper",
  year: "2026",
  fileName: "paper.pdf",
  filePath: "/tmp/paper.pdf",
  fileUri: "file:///tmp/paper.pdf",
  fileSize: 123,
  cwd: "/tmp",
};

const attachment: AttachmentContext = {
  fileName: "data.csv",
  filePath: "/tmp/data.csv",
  fileUri: "file:///tmp/data.csv",
  fileSize: null,
  mimeType: "text/csv",
};
