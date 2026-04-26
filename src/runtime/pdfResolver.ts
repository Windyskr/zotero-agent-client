import { pathToFileUri } from "../core/content";
import type { PdfContext } from "../core/types";

export async function resolvePdfContext(item: any): Promise<PdfContext | null> {
  if (!item) {
    return null;
  }

  const pdfItem = await getPdfAttachment(item);
  if (!pdfItem) {
    return null;
  }

  const filePath = await pdfItem.getFilePathAsync();
  if (!filePath) {
    return null;
  }

  const sourceItem = pdfItem.parentItem ?? item;
  const title = getField(sourceItem, "title") || pdfItem.attachmentFilename || "Untitled PDF";
  const year = extractYear(getField(sourceItem, "date"));
  const stat = await statFile(filePath);

  return {
    itemID: pdfItem.id,
    libraryID: pdfItem.libraryID,
    sourceItemID: sourceItem.id ?? pdfItem.id,
    title,
    year,
    fileName: pdfItem.attachmentFilename || basename(filePath),
    filePath,
    fileUri: pathToFileUri(filePath),
    fileSize: stat?.size ?? null,
    cwd: dirname(filePath)
  };
}

async function getPdfAttachment(item: any): Promise<any | null> {
  if (typeof item.isAttachment === "function" && item.isAttachment()) {
    return isPdf(item) ? item : null;
  }

  if (typeof item.getBestAttachment === "function") {
    const best = await item.getBestAttachment();
    if (best && isPdf(best)) {
      return best;
    }
  }

  if (typeof item.getAttachments === "function") {
    const ids = item.getAttachments(false);
    const attachments = Zotero.Items.get(ids);
    return attachments.find((attachment: any) => isPdf(attachment)) ?? null;
  }

  return null;
}

function isPdf(item: any): boolean {
  if (typeof item.isPDFAttachment === "function") {
    return item.isPDFAttachment();
  }
  return item.attachmentContentType === "application/pdf";
}

function getField(item: any, field: string): string {
  if (!item || typeof item.getField !== "function") {
    return "";
  }
  return String(item.getField(field, false, true) || "");
}

function extractYear(date: string): string {
  return date.match(/\d{4}/)?.[0] ?? "";
}

async function statFile(path: string): Promise<{ size: number } | null> {
  try {
    const stat = await IOUtils.stat(path);
    return { size: stat.size };
  } catch {
    return null;
  }
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "/";
}
