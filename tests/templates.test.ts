import { describe, expect, it } from "vitest";
import { renderTemplate } from "../src/core/templates";

describe("renderTemplate", () => {
  it("renders supported Zotero variables", () => {
    expect(renderTemplate("{{prompt}}\n{{title}} {{year}}", {
      prompt: "Summarize",
      title: "Paper",
      year: "2026"
    })).toBe("Summarize\nPaper 2026");
  });

  it("leaves unsupported variables untouched", () => {
    expect(renderTemplate("{{authors}}", {
      prompt: "",
      title: "",
      year: ""
    })).toBe("{{authors}}");
  });
});
