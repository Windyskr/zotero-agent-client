import { assert } from "chai";
import { resolvePdfContext } from "../src/modules/acpPdfContext";

describe("ACP PDF context", function () {
  let previousZotero: unknown;
  let previousPathUtils: unknown;

  beforeEach(function () {
    previousZotero = getRuntime().Zotero;
    previousPathUtils = getRuntime().PathUtils;
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
    getRuntime().Zotero = previousZotero;
    getRuntime().PathUtils = previousPathUtils;
  });

  it("returns null when no PDF attachment is available", async function () {
    assert.isNull(await resolvePdfContext(null, l10n));
    assert.isNull(
      await resolvePdfContext(
        {
          isAttachment: () => true,
          attachmentContentType: "text/plain",
        },
        l10n,
      ),
    );
  });

  it("resolves local PDF attachment metadata", async function () {
    const pdfItem = {
      id: 11,
      libraryID: 22,
      attachmentFilename: "paper.pdf",
      attachmentContentType: "application/pdf",
      isAttachment: () => true,
      getFilePathAsync: () => "/tmp/paper.pdf",
      parentItem: {
        id: 33,
        getField(field: string) {
          if (field === "title") return "Interesting Paper";
          if (field === "date") return "2026-05-05";
          return "";
        },
      },
    };

    assert.deepEqual(await resolvePdfContext(pdfItem, l10n), {
      itemID: 11,
      libraryID: 22,
      sourceItemID: 33,
      title: "Interesting Paper",
      year: "2026",
      fileName: "paper.pdf",
      filePath: "/tmp/paper.pdf",
      fileUri: "file-uri:/tmp/paper.pdf",
      fileSize: null,
      cwd: "/tmp",
    });
  });

  it("recognizes PDF MIME types case-insensitively", async function () {
    const pdfItem = {
      id: 12,
      libraryID: 22,
      attachmentFilename: "paper.pdf",
      attachmentContentType: " Application/PDF ; charset=binary ",
      isAttachment: () => true,
      getFilePathAsync: () => "/tmp/paper.pdf",
    };

    const context = await resolvePdfContext(pdfItem, l10n);

    assert.include(context, {
      itemID: 12,
      libraryID: 22,
      fileName: "paper.pdf",
      filePath: "/tmp/paper.pdf",
    });
  });

  it("uses a parent item's best PDF attachment", async function () {
    const pdfItem = {
      id: 44,
      libraryID: 55,
      attachmentFilename: "best.pdf",
      isPDFAttachment: () => true,
      getFilePathAsync: () => "/tmp/best.pdf",
    };
    const parentItem = {
      id: 66,
      getBestAttachment: () => pdfItem,
      getField(field: string) {
        return field === "title" ? "Parent title" : "";
      },
    };

    const context = await resolvePdfContext(parentItem, l10n);
    assert.include(context, {
      itemID: 44,
      libraryID: 55,
      sourceItemID: 66,
      title: "Parent title",
      fileName: "best.pdf",
      filePath: "/tmp/best.pdf",
    });
  });

  it("treats a false best attachment result as missing", async function () {
    assert.isNull(
      await resolvePdfContext(
        {
          getBestAttachment: () => false,
        },
        l10n,
      ),
    );
  });

  it("falls back to item attachments when no best attachment is available", async function () {
    const pdfAttachment = {
      id: 77,
      libraryID: 88,
      attachmentFilename: "fallback.pdf",
      attachmentContentType: "application/pdf",
      isAttachment: () => true,
      getFilePathAsync: () => "/tmp/fallback.pdf",
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
      Items: {
        get(ids: number | number[]) {
          return Array.isArray(ids) && ids.includes(77) ? [pdfAttachment] : [];
        },
      },
    };

    const context = await resolvePdfContext(
      {
        id: 99,
        getAttachments: () => [77],
        getField(field: string) {
          return field === "title" ? "Fallback parent" : "";
        },
      },
      l10n,
    );

    assert.include(context, {
      itemID: 77,
      libraryID: 88,
      sourceItemID: 99,
      title: "Fallback parent",
      fileName: "fallback.pdf",
      filePath: "/tmp/fallback.pdf",
    });
  });
});

function l10n(_id: string, fallback: string): string {
  return fallback;
}

function getRuntime(): typeof globalThis & {
  PathUtils?: unknown;
  Zotero?: unknown;
} {
  return globalThis as typeof globalThis & {
    PathUtils?: unknown;
    Zotero?: unknown;
  };
}
