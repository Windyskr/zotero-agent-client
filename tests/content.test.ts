import { describe, expect, it } from "vitest";
import { makePdfResourceLink, makePromptContent, pathToFileUri } from "../src/core/content";

describe("content helpers", () => {
  it("builds encoded file URIs", () => {
    expect(pathToFileUri("/Users/me/My Paper.pdf")).toBe("file:///Users/me/My%20Paper.pdf");
  });

  it("builds ACP resource_link content blocks", () => {
    expect(makePdfResourceLink({
      fileUri: "file:///tmp/paper.pdf",
      fileName: "paper.pdf",
      fileSize: 123
    })).toEqual({
      type: "resource_link",
      uri: "file:///tmp/paper.pdf",
      name: "paper.pdf",
      mimeType: "application/pdf",
      size: 123
    });
  });

  it("combines prompt text and PDF attachment", () => {
    expect(makePromptContent("Read this", {
      fileUri: "file:///tmp/paper.pdf",
      fileName: "paper.pdf",
      fileSize: null
    })).toEqual([
      { type: "text", text: "Read this" },
      {
        type: "resource_link",
        uri: "file:///tmp/paper.pdf",
        name: "paper.pdf",
        mimeType: "application/pdf",
        size: null
      }
    ]);
  });
});
