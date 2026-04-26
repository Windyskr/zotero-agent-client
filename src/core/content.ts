import type { ContentBlock, PdfContext, ResourceLinkBlock, TextContentBlock } from "./types";

export function pathToFileUri(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `file://${withLeadingSlash
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

export function makePdfResourceLink(pdf: Pick<PdfContext, "fileUri" | "fileName" | "fileSize">): ResourceLinkBlock {
  return {
    type: "resource_link",
    uri: pdf.fileUri,
    name: pdf.fileName,
    mimeType: "application/pdf",
    size: pdf.fileSize
  };
}

export function makePromptContent(text: string, pdf: Pick<PdfContext, "fileUri" | "fileName" | "fileSize">): ContentBlock[] {
  const content: TextContentBlock = {
    type: "text",
    text
  };
  return [content, makePdfResourceLink(pdf)];
}
