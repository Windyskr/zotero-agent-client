import type { AttachmentContext } from "./acpChatTypes";
import { basename, inferMimeType, pathToFileUri } from "./acpChatUtils";
import type { ZoteroItemLike } from "./acpZoteroItems";

export interface AttachmentCandidate {
  item: ZoteroItemLike;
  fileName: string;
  filePath: string;
  label: string;
}

export interface AttachmentContextInput {
  fileName?: string;
  filePath: string;
  fileSize?: number | null;
  mimeType?: string | null;
}

export function createAttachmentContext({
  fileName,
  filePath,
  fileSize,
  mimeType,
}: AttachmentContextInput): AttachmentContext {
  const normalizedFileName = fileName?.trim() || basename(filePath);
  const normalizedMimeType = mimeType?.trim() || null;
  return {
    fileName: normalizedFileName,
    filePath,
    fileUri: pathToFileUri(filePath),
    fileSize: fileSize ?? null,
    ...(normalizedMimeType
      ? { mimeType: normalizedMimeType }
      : inferOptionalMimeType(filePath)),
  };
}

export function makeLibraryAttachmentLabel(
  item: ZoteroItemLike,
  fileName: string,
): string {
  const parentTitle = String(item.parentItem?.getField?.("title") || "").trim();
  const attachmentTitle = String(item.getField?.("title") || "").trim();
  const title = parentTitle || attachmentTitle;
  return title ? `${title} - ${fileName}` : fileName;
}

function inferOptionalMimeType(
  filePath: string,
): Pick<AttachmentContext, "mimeType"> {
  const mimeType = inferMimeType(filePath);
  return mimeType ? { mimeType } : {};
}
