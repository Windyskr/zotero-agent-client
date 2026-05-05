import { assert } from "chai";
import {
  createAttachmentContext,
  makeLibraryAttachmentLabel,
} from "../src/modules/acpAttachmentCandidates";
import type { ZoteroItemLike } from "../src/modules/acpZoteroItems";

describe("ACP attachment candidates", function () {
  it("builds attachment contexts with file URIs and inferred mime types", function () {
    assert.deepEqual(
      createAttachmentContext({
        filePath: "/tmp/My Paper.pdf",
        fileSize: 42,
      }),
      {
        fileName: "My Paper.pdf",
        filePath: "/tmp/My Paper.pdf",
        fileUri: "file:///tmp/My%20Paper.pdf",
        fileSize: 42,
        mimeType: "application/pdf",
      },
    );
  });

  it("prefers explicit file names and mime types", function () {
    assert.deepEqual(
      createAttachmentContext({
        fileName: "renamed.bin",
        filePath: "/tmp/original.bin",
        fileSize: null,
        mimeType: "text/plain",
      }),
      {
        fileName: "renamed.bin",
        filePath: "/tmp/original.bin",
        fileUri: "file:///tmp/original.bin",
        fileSize: null,
        mimeType: "text/plain",
      },
    );
  });

  it("labels library attachments from parent, attachment, or file names", function () {
    assert.equal(
      makeLibraryAttachmentLabel(
        item("Attachment title", item("Parent paper")),
        "supp.pdf",
      ),
      "Parent paper - supp.pdf",
    );
    assert.equal(
      makeLibraryAttachmentLabel(item("Attachment title"), "supp.pdf"),
      "Attachment title - supp.pdf",
    );
    assert.equal(makeLibraryAttachmentLabel({}, "supp.pdf"), "supp.pdf");
  });
});

function item(title: string, parentItem?: ZoteroItemLike): ZoteroItemLike {
  return {
    parentItem,
    getField: (field) => (field === "title" ? title : ""),
  };
}
