import { assert } from "chai";
import {
  createMarkdownRenderer,
  isSafeMarkdownLink,
} from "../src/modules/acpMarkdown";

describe("ACP markdown rendering", function () {
  it("allows only explicit safe link protocols", function () {
    assert.isTrue(isSafeMarkdownLink("https://example.com"));
    assert.isTrue(isSafeMarkdownLink("http://example.com"));
    assert.isTrue(isSafeMarkdownLink("mailto:person@example.com"));
    assert.isTrue(isSafeMarkdownLink("#section"));

    assert.isFalse(isSafeMarkdownLink("javascript:alert(1)"));
    assert.isFalse(isSafeMarkdownLink("java\nscript:alert(1)"));
    assert.isFalse(isSafeMarkdownLink("file:///tmp/paper.pdf"));
    assert.isFalse(isSafeMarkdownLink("chrome://zotero/content"));
    assert.isFalse(isSafeMarkdownLink("//example.com/path"));
    assert.isFalse(isSafeMarkdownLink("/relative/path"));
  });

  it("renders safe links with external-link attributes", function () {
    const html = createMarkdownRenderer().render(
      "[paper](https://example.com)",
    );

    assert.include(html, 'href="https://example.com"');
    assert.include(html, 'target="_blank"');
    assert.include(html, 'rel="noopener noreferrer"');
  });

  it("does not treat hash links as external links", function () {
    const html = createMarkdownRenderer().render("[section](#section)");

    assert.include(html, 'href="#section"');
    assert.notInclude(html, 'target="_blank"');
    assert.notInclude(html, "rel=");
  });

  it("does not render unsafe links as anchors", function () {
    const html = createMarkdownRenderer().render(
      "[bad](javascript:alert(1)) [local](file:///tmp/a.pdf)",
    );

    assert.notInclude(html, "<a ");
    assert.notInclude(html, 'href="javascript:');
    assert.notInclude(html, 'href="file://');
  });
});
