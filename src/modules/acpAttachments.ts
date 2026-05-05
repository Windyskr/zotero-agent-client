import {
  type AttachmentCandidate,
  createAttachmentContext,
  makeLibraryAttachmentLabel,
} from "./acpAttachmentCandidates";
import type { AttachmentContext } from "./acpChatTypes";
import { basename, statFile } from "./acpChatUtils";
import {
  getZoteroItem,
  getZoteroItems,
  type ZoteroItemLike,
} from "./acpZoteroItems";

type Localize = (
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
) => string;

interface FilePickerConstructor {
  new (): ZoteroFilePicker;
}

interface ZoteroFilePicker {
  modeOpen: number;
  filterAll: number;
  returnOK: number;
  returnReplace: number;
  displayDirectory?: string;
  file?: string;
  init(parentWindow: Window, title: string, mode: number): void;
  appendFilters(filter: number): void;
  show(): Promise<number>;
}

interface PromptServiceWithSelect {
  select(
    parentWindow: Window,
    title: string,
    text: string,
    count: number,
    labels: string[],
    selected: { value?: number },
  ): boolean;
}

export async function pickLocalAttachment(
  parentWindow: Window,
  l10n: Localize,
  initialDirectory?: string,
): Promise<AttachmentContext | null> {
  const FilePickerCtor = getFilePickerConstructor(l10n);
  const picker = new FilePickerCtor();
  picker.init(
    parentWindow,
    l10n("acpchat-filepicker-title", "Choose attachment"),
    picker.modeOpen,
  );
  picker.appendFilters(picker.filterAll);

  if (initialDirectory && (await IOUtils.exists(initialDirectory))) {
    picker.displayDirectory = initialDirectory;
  }

  const result = await picker.show();
  if (result !== picker.returnOK && result !== picker.returnReplace) {
    return null;
  }

  const filePath = picker.file;
  if (!filePath) return null;
  const stat = await statFile(filePath);
  return createAttachmentContext({
    filePath,
    fileSize: stat?.size ?? null,
  });
}

export async function pickLibraryAttachment(
  parentWindow: Window,
  l10n: Localize,
): Promise<AttachmentContext | null> {
  const selectedItem = selectLibraryItem(parentWindow);
  if (!selectedItem) return null;

  const attachments = await getLocalAttachmentCandidates(selectedItem);
  if (!attachments.length) {
    throw new Error(
      l10n(
        "acpchat-library-file-missing",
        "The selected Zotero item has no local files.",
      ),
    );
  }

  const selectedAttachment =
    attachments.length === 1
      ? attachments[0]
      : selectAttachmentCandidate(parentWindow, l10n, attachments);
  if (!selectedAttachment) return null;

  const stat = await statFile(selectedAttachment.filePath);
  return createAttachmentContext({
    fileName: selectedAttachment.fileName,
    filePath: selectedAttachment.filePath,
    fileSize: stat?.size ?? null,
    mimeType: selectedAttachment.item.attachmentContentType || null,
  });
}

function selectLibraryItem(parentWindow: Window): ZoteroItemLike | null {
  const io: {
    dataOut?: number[];
    itemTreeID: string;
    multiSelect: boolean;
    singleSelection: boolean;
  } = {
    itemTreeID: "acpchat-library-attachment-picker",
    multiSelect: false,
    singleSelection: true,
  };
  parentWindow.openDialog(
    "chrome://zotero/content/selectItemsDialog.xhtml",
    "",
    "chrome,modal,centerscreen,resizable",
    io,
  );
  const itemID = io.dataOut?.[0];
  return itemID ? getZoteroItem(itemID) : null;
}

async function getLocalAttachmentCandidates(
  item: ZoteroItemLike,
): Promise<AttachmentCandidate[]> {
  const items = item.isAttachment?.()
    ? [item]
    : item.getAttachments
      ? getZoteroItems(item.getAttachments(false))
      : [];
  const candidates: AttachmentCandidate[] = [];
  for (const attachment of items) {
    if (!attachment?.isAttachment?.()) continue;
    const filePath = await getAttachmentFilePath(attachment);
    if (!filePath || !(await IOUtils.exists(filePath))) continue;
    const fileName = attachment.attachmentFilename || basename(filePath);
    candidates.push({
      item: attachment,
      fileName,
      filePath,
      label: makeLibraryAttachmentLabel(attachment, fileName),
    });
  }
  return candidates;
}

async function getAttachmentFilePath(
  item: ZoteroItemLike,
): Promise<string | null> {
  try {
    const filePath = await Promise.resolve(item.getFilePathAsync?.());
    return typeof filePath === "string" && filePath ? filePath : null;
  } catch (error) {
    Zotero.logError(error as Error);
    return null;
  }
}

function selectAttachmentCandidate(
  parentWindow: Window,
  l10n: Localize,
  candidates: AttachmentCandidate[],
): AttachmentCandidate | null {
  const selected: { value?: number } = {};
  const prompt = Services.prompt as unknown as PromptServiceWithSelect;
  const accepted = prompt.select(
    parentWindow,
    l10n("acpchat-library-attachment-picker-title", "Choose item file"),
    l10n(
      "acpchat-library-attachment-picker-message",
      "This Zotero item has multiple local files.",
    ),
    candidates.length,
    candidates.map((candidate) => candidate.label),
    selected,
  );
  if (!accepted) return null;
  const index = selected.value ?? -1;
  return candidates[index] ?? null;
}

function getFilePickerConstructor(l10n: Localize): FilePickerConstructor {
  try {
    const module = ChromeUtils.importESModule(
      "chrome://zotero/content/modules/filePicker.mjs",
    ) as { FilePicker?: FilePickerConstructor };
    if (module.FilePicker) return module.FilePicker;
  } catch (error) {
    throw new Error(
      l10n(
        "acpchat-filepicker-unavailable",
        "File picker is unavailable in this Zotero build.",
      ),
      { cause: error as Error },
    );
  }
  throw new Error(
    l10n(
      "acpchat-filepicker-unavailable",
      "File picker is unavailable in this Zotero build.",
    ),
  );
}
