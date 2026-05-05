import type { AttachmentContext, PdfContext } from "./acpChatTypes";

export type PromptContentPart = PromptTextPart | PromptResourceLinkPart;

export interface PromptTextPart {
  type: "text";
  text: string;
}

export interface PromptResourceLinkPart {
  type: "resource_link";
  uri: string;
  name: string;
  mimeType?: string;
  size: number | null;
}

export function makePromptContent(
  text: string,
  pdf: PdfContext,
  includePdf: boolean,
  attachment: AttachmentContext | null,
): PromptContentPart[] {
  const content: PromptContentPart[] = [{ type: "text", text }];
  const resourceUris = new Set<string>();
  if (includePdf) {
    appendResourceLink(content, resourceUris, {
      type: "resource_link",
      uri: pdf.fileUri,
      name: pdf.fileName,
      mimeType: "application/pdf",
      size: pdf.fileSize,
    });
  }
  if (attachment) {
    appendResourceLink(content, resourceUris, {
      type: "resource_link",
      uri: attachment.fileUri,
      name: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.fileSize,
    });
  }
  return content;
}

export function promptTextOrNull(input: string): string | null {
  return input.trim() ? input : null;
}

function appendResourceLink(
  content: PromptContentPart[],
  resourceUris: Set<string>,
  part: PromptResourceLinkPart,
): void {
  if (resourceUris.has(part.uri)) return;
  resourceUris.add(part.uri);
  content.push(part);
}
