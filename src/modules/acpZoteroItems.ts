export interface ZoteroItemLike {
  id?: number;
  libraryID?: number;
  parentItem?: ZoteroItemLike | null;
  attachmentFilename?: string;
  attachmentContentType?: string;
  isAttachment?: () => boolean;
  isPDFAttachment?: () => boolean;
  getBestAttachment?: () =>
    | Promise<ZoteroItemLike | false | null>
    | ZoteroItemLike
    | false
    | null;
  getAttachments?: (includeTrashed?: boolean) => number[];
  getField?: (
    field: string,
    unformatted?: boolean,
    includeBaseMapped?: boolean,
  ) => unknown;
  getFilePathAsync?: () => Promise<string | null> | string | null;
}

export function getZoteroItem(itemID: number): ZoteroItemLike | null {
  return toZoteroItem(Zotero.Items.get(itemID));
}

export function getZoteroItems(itemIDs: number[]): ZoteroItemLike[] {
  const items = Zotero.Items.get(itemIDs) as unknown;
  return Array.isArray(items)
    ? items.map(toZoteroItem).filter((item) => !!item)
    : [];
}

export function toZoteroItem(value: unknown): ZoteroItemLike | null {
  return isRecord(value) ? (value as ZoteroItemLike) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
