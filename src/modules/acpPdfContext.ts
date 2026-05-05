import type { PdfContext } from "./acpChatTypes";
import {
  PDF_CONTEXT_TIMEOUT_MS,
  basename,
  dirname,
  pathToFileUri,
  statFile,
  withTimeout,
} from "./acpChatUtils";
import {
  getZoteroItems,
  toZoteroItem,
  type ZoteroItemLike,
} from "./acpZoteroItems";

type Localize = (
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
) => string;

export async function resolvePdfContext(
  item: unknown,
  l10n: Localize,
): Promise<PdfContext | null> {
  const sourceCandidate = toZoteroItem(item);
  const pdfItem = await getPdfAttachment(sourceCandidate);
  if (!pdfItem) return null;
  const filePath = await withTimeout<string | null>(
    Promise.resolve(pdfItem.getFilePathAsync?.() ?? null),
    PDF_CONTEXT_TIMEOUT_MS,
    l10n(
      "acpchat-error-pdf-context-timeout",
      "Timed out while looking for the local PDF attachment.",
    ),
  );
  if (!filePath) return null;
  const sourceItem = pdfItem.parentItem ?? sourceCandidate ?? pdfItem;
  const title = String(
    sourceItem?.getField?.("title", false, true) ||
      pdfItem.attachmentFilename ||
      "Untitled PDF",
  );
  const date = String(sourceItem?.getField?.("date", false, true) || "");
  const stat = await statFile(filePath);
  return {
    itemID: finiteNumberOrZero(pdfItem.id),
    libraryID: finiteNumberOrZero(pdfItem.libraryID),
    sourceItemID: finiteNumberOrZero(sourceItem?.id ?? pdfItem.id),
    title,
    year: date.match(/\d{4}/)?.[0] ?? "",
    fileName: pdfItem.attachmentFilename || basename(filePath),
    filePath,
    fileUri: pathToFileUri(filePath),
    fileSize: stat?.size ?? null,
    cwd: dirname(filePath),
  };
}

async function getPdfAttachment(
  item: ZoteroItemLike | null,
): Promise<ZoteroItemLike | null> {
  if (!item) return null;
  if (item.isAttachment?.()) return isPdf(item) ? item : null;
  const best = await Promise.resolve(item.getBestAttachment?.() ?? null);
  if (best && isPdf(best)) return best;
  if (item.getAttachments) {
    const attachments = getZoteroItems(item.getAttachments(false));
    return attachments.find((candidate) => isPdf(candidate)) ?? null;
  }
  return null;
}

function isPdf(item: ZoteroItemLike): boolean {
  return (
    item.isPDFAttachment?.() || item.attachmentContentType === "application/pdf"
  );
}

function finiteNumberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
