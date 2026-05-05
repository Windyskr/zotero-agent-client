import { config } from "../../package.json";

type Localize = (
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
) => string;

export type ReaderToolbarHandler = (event: unknown) => void;

interface ReaderToolbarEvent {
  doc: Document;
  reader: {
    _window?: Window;
  };
  append(button: HTMLButtonElement): void;
}

interface ItemDetailsElement extends HTMLElement {
  pinnedPane?: string;
  scrollToPane?: (paneID: string, behavior?: ScrollBehavior) => Promise<void>;
  changePaneOrder?: (
    paneID: string,
    index: number,
    options?: { render?: boolean },
  ) => Promise<void>;
}

interface CollapsiblePaneElement extends HTMLElement {
  collapsed?: boolean;
}

export function registerReaderToolbarEntry(
  paneId: string,
  l10n: Localize,
): ReaderToolbarHandler {
  const toolbarHandler: ReaderToolbarHandler = (rawEvent) => {
    const event = toReaderToolbarEvent(rawEvent);
    if (!event) return;
    const { doc, reader, append } = event;
    const button = doc.createElement("button");
    button.className = "toolbar-button acpchat-toolbar-button";
    button.type = "button";
    button.title = l10n("acpchat-toolbar-button-title", "Open Agent Client");
    button.setAttribute("aria-label", button.title);
    button.textContent = l10n("acpchat-toolbar-button-label", "AI");
    button.addEventListener("click", () => {
      try {
        focusAcpPane(reader._window ?? Zotero.getMainWindow(), paneId);
      } catch (error) {
        Zotero.logError(error as Error);
      }
    });
    append(button);
  };
  Zotero.Reader.registerEventListener(
    "renderToolbar",
    toolbarHandler,
    config.addonID,
  );
  return toolbarHandler;
}

export function unregisterReaderToolbarEntry(
  toolbarHandler: ReaderToolbarHandler,
): void {
  Zotero.Reader.unregisterEventListener("renderToolbar", toolbarHandler);
}

function focusAcpPane(win: Window, paneId: string): void {
  const doc = win.document;
  const itemDetails = doc.querySelector(
    'item-details[tabType="reader"]',
  ) as ItemDetailsElement | null;
  const section = Array.from(
    doc.querySelectorAll("item-pane-custom-section"),
  ).find((node) => (node as HTMLElement).dataset.pane?.includes(paneId)) as
    | HTMLElement
    | undefined;
  const paneID = section?.dataset.pane;
  if (!itemDetails || !paneID) return;
  const pane = itemDetails.closest(
    "context-pane, item-pane",
  ) as CollapsiblePaneElement | null;
  if (pane) pane.collapsed = false;
  itemDetails.pinnedPane = paneID;
  const scrollPromise = itemDetails.scrollToPane?.(paneID, "smooth");
  void scrollPromise?.catch(logPaneError);
}

export function movePaneToTop(body: HTMLElement): void {
  const section = body.closest(
    "item-pane-custom-section",
  ) as HTMLElement | null;
  const itemDetails = body.closest("item-details") as ItemDetailsElement | null;
  const paneID = section?.dataset?.pane;
  if (!paneID || typeof itemDetails?.changePaneOrder !== "function") return;
  void itemDetails
    .changePaneOrder(paneID, 0, { render: false })
    .catch(logPaneError);
}

function logPaneError(error: unknown): void {
  try {
    if (
      typeof Zotero !== "undefined" &&
      typeof Zotero.logError === "function"
    ) {
      Zotero.logError(error as Error);
    }
  } catch {
    // Pane lifecycle errors should not prevent reader rendering.
  }
}

function toReaderToolbarEvent(value: unknown): ReaderToolbarEvent | null {
  if (!isRecord(value)) return null;
  const doc = value.doc as Document | undefined;
  const append = value.append;
  if (!doc || typeof doc.createElement !== "function") return null;
  if (typeof append !== "function") return null;
  return {
    doc,
    reader: isRecord(value.reader) ? value.reader : {},
    append: append as (button: HTMLButtonElement) => void,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
