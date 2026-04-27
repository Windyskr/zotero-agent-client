import { config } from "../../package.json";
import MarkdownIt from "markdown-it";
import type { AcpChatRoot, ChatStatus, SendPromptRequest } from "./acpChatView";

export type ChatRole = "user" | "assistant" | "tool" | "system";

export interface AgentProfile {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface PromptPreset {
  id: string;
  name: string;
  prompt: string;
}

export interface Settings {
  agentProfiles: AgentProfile[];
  defaultAgent: string;
  promptPresets: PromptPreset[];
  defaultPresetId: string;
  sessionStorePath: string;
  defaultTemplate: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  status?: "streaming" | "done" | "error" | "cancelled";
}

export interface SessionRecord {
  key: string;
  agentId: string;
  sessionId?: string;
  pdfItemID: number;
  pdfPathHash: string;
  messages: ChatMessage[];
  updatedAt: string;
}

export interface PdfContext {
  itemID: number;
  libraryID: number;
  sourceItemID: number;
  title: string;
  year: string;
  fileName: string;
  filePath: string;
  fileUri: string;
  fileSize: number | null;
  cwd: string;
}

interface StoreDocument {
  version: 1;
  records: SessionRecord[];
}

export type MessageStatus = NonNullable<ChatMessage["status"]>;
export type StatusKind = "ready" | "busy" | "success" | "error" | "muted";

interface FluentPattern {
  value: string | null;
  attributes: Array<{ name: string; value: string }> | null;
}

const PANE_ID = "acpchat-reader";
const PREF_PREFIX = config.prefsPrefix;

const clientPool = new Map<string, AcpClient>();
const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: false,
});
const renderMarkdownLink =
  markdown.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) =>
    self.renderToken(tokens, index, options));
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noreferrer");
  return renderMarkdownLink(tokens, index, options, env, self);
};
let toolbarHandler: ((event: any) => void) | null = null;
let mainWindowL10n: any | null = null;
const panelRoots = new Map<HTMLElement, AcpChatRoot>();

export function registerAcpChat(): void {
  injectStyles();
  Zotero.ItemPaneManager.registerSection({
    paneID: PANE_ID,
    pluginID: config.addonID,
    header: {
      l10nID: `${config.addonRef}-acpchat-reader-section-head-text`,
      icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
    },
    sidenav: {
      l10nID: `${config.addonRef}-acpchat-reader-section-sidenav-tooltip`,
      icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
      orderable: true,
    } as any,
    onItemChange: ({ tabType, setEnabled }: any) => {
      setEnabled(tabType === "reader");
      return true;
    },
    onRender: ({ body, item }: any) => {
      movePaneToTop(body);
      renderPanel(body, item);
    },
  });
  registerReaderToolbarEntry();
}

export function unregisterAcpChat(): void {
  if (toolbarHandler) {
    Zotero.Reader.unregisterEventListener("renderToolbar", toolbarHandler);
    toolbarHandler = null;
  }
  Zotero.ItemPaneManager.unregisterSection(PANE_ID);
  for (const client of clientPool.values()) {
    client.close();
  }
  clientPool.clear();
  for (const root of panelRoots.values()) {
    root.unmount();
  }
  panelRoots.clear();
  for (const win of Zotero.getMainWindows()) {
    win.document.getElementById("acpchat-style")?.remove();
  }
}

function injectStyles(): void {
  for (const win of Zotero.getMainWindows()) {
    const doc = win.document;
    let style = doc.getElementById("acpchat-style") as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement("style");
      style.id = "acpchat-style";
      doc.documentElement?.append(style);
    }
    style.textContent = `
      .acpchat-panel,
      .acpchat-panel * {
        box-sizing: border-box;
      }
      .acpchat-host {
        max-width: 100%;
        min-width: 0;
        overflow-x: hidden;
      }
      .acpchat-host > * {
        max-width: 100%;
        min-width: 0;
      }
      .acpchat-panel {
        --acpchat-accent: #2563eb;
        --acpchat-accent-soft: #eaf2ff;
        --acpchat-accent-border: #b9d2ff;
        --acpchat-surface: var(--material-background, #ffffff);
        --acpchat-surface-muted: var(--material-mix-quinary, #f6f7f8);
        --acpchat-border: var(--material-border-quinary, #d8dce2);
        --acpchat-text: var(--fill-primary, #202124);
        --acpchat-muted: var(--fill-secondary, #6b7280);
        --acpchat-danger: #b3261e;
        background: transparent;
        color: var(--acpchat-text);
        display: flex;
        flex-direction: column;
        font: 12px/1.42 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        gap: 8px;
        max-width: 100%;
        min-height: 360px;
        min-width: 0;
        overflow-x: hidden;
        padding: 6px 8px 8px;
        width: 100%;
      }
      .acpchat-panel button,
      .acpchat-panel select,
      .acpchat-panel textarea {
        font: inherit !important;
      }
      .acpchat-header,
      .acpchat-context-card,
      .acpchat-messages,
      .acpchat-composer,
      .acpchat-loading-card,
      .acpchat-fatal {
        background: var(--acpchat-surface);
        border: 1px solid var(--acpchat-border);
        border-radius: 8px;
        max-width: 100%;
        min-width: 0;
      }
      .acpchat-header {
        align-items: center;
        display: flex;
        gap: 8px;
        justify-content: space-between;
        max-width: 100%;
        min-height: 34px;
        min-width: 0;
        padding: 6px 8px;
      }
      .acpchat-brand {
        align-items: center;
        display: flex;
        gap: 7px;
        min-width: 0;
      }
      .acpchat-brand-mark {
        align-items: center;
        background: var(--acpchat-accent-soft);
        border: 1px solid var(--acpchat-accent-border);
        border-radius: 6px;
        color: var(--acpchat-accent);
        display: inline-flex;
        flex: 0 0 auto;
        font-size: 10px;
        font-weight: 700;
        height: 22px;
        justify-content: center;
        line-height: 1;
        width: 22px;
      }
      .acpchat-brand-copy {
        min-width: 0;
      }
      .acpchat-eyebrow {
        color: var(--acpchat-muted);
        font-size: 10px;
        line-height: 1.15;
      }
      .acpchat-title {
        font-size: 12px;
        font-weight: 650;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .acpchat-status-chip {
        align-items: center;
        background: var(--acpchat-surface-muted);
        border: 1px solid transparent;
        border-radius: 999px;
        color: var(--acpchat-muted);
        display: inline-flex;
        flex: 0 0 auto;
        font-size: 10px;
        font-weight: 600;
        line-height: 1;
        max-width: 42%;
        overflow: hidden;
        padding: 4px 7px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .acpchat-status-chip::before {
        background: currentColor;
        border-radius: 999px;
        content: "";
        flex: 0 0 auto;
        height: 5px;
        margin-right: 5px;
        width: 5px;
      }
      .acpchat-status-chip.is-ready,
      .acpchat-status-chip.is-success {
        background: #eef8f2;
        color: #157347;
      }
      .acpchat-status-chip.is-busy {
        background: #fff4dc;
        color: #8a5a00;
      }
      .acpchat-status-chip.is-error {
        background: #fdeceb;
        color: var(--acpchat-danger);
      }
      .acpchat-status-chip.is-muted {
        background: var(--acpchat-surface-muted);
        color: var(--acpchat-muted);
      }
      .acpchat-status-chip.is-busy::before {
        animation: acpchat-pulse 1.2s ease-in-out infinite;
      }
      .acpchat-context-card {
        padding: 7px 8px;
      }
      .acpchat-context-card-missing {
        border-style: dashed;
      }
      .acpchat-context-label,
      .acpchat-control-label,
      .acpchat-message-role,
      .acpchat-empty-title {
        color: var(--acpchat-muted);
        font-size: 10px;
        font-weight: 650;
        line-height: 1.2;
      }
      .acpchat-context-title {
        display: block;
        font-size: 12px;
        font-weight: 650;
        line-height: 1.35;
        margin-top: 3px;
        overflow-wrap: anywhere;
        white-space: normal;
        word-break: break-word;
      }
      .acpchat-context-meta {
        color: var(--acpchat-muted);
        font-size: 11px;
        line-height: 1.3;
        margin-top: 3px;
        overflow-wrap: anywhere;
        white-space: normal;
        word-break: break-word;
      }
      .acpchat-controls {
        display: grid;
        gap: 6px;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        max-width: 100%;
        min-width: 0;
      }
      .acpchat-control {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .acpchat-select,
      .acpchat-input {
        background: var(--acpchat-surface);
        border: 1px solid var(--acpchat-border);
        border-radius: 6px;
        color: var(--acpchat-text);
        min-width: 0;
        width: 100%;
      }
      .acpchat-select {
        height: 26px;
        line-height: 24px;
        padding: 1px 6px;
      }
      .acpchat-messages {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 8px;
        max-width: 100%;
        min-height: 180px;
        min-width: 0;
        overflow: auto;
        overflow-x: hidden;
        padding: 8px;
      }
      .acpchat-empty {
        background: var(--acpchat-surface-muted);
        border: 1px dashed var(--acpchat-border);
        border-radius: 7px;
        padding: 8px;
      }
      .acpchat-empty-title {
        color: var(--acpchat-text);
      }
      .acpchat-empty-detail {
        color: var(--acpchat-muted);
        font-size: 11px;
        line-height: 1.4;
        margin-top: 3px;
      }
      .acpchat-message {
        display: flex;
        flex-direction: column;
        gap: 3px;
        line-height: 1.45;
        max-width: 96%;
        min-width: 0;
        overflow-wrap: anywhere;
        width: 100%;
      }
      .acpchat-message-user {
        align-self: flex-end;
        max-width: 92%;
        width: auto;
      }
      .acpchat-message-assistant,
      .acpchat-message-tool,
      .acpchat-message-system {
        align-self: flex-start;
        width: 100%;
      }
      .acpchat-message-tool,
      .acpchat-message-system {
        max-width: 100%;
      }
      .acpchat-message-meta {
        align-items: center;
        color: var(--acpchat-muted);
        display: flex;
        flex-wrap: wrap;
        font-size: 10px;
        line-height: 1.25;
      }
      .acpchat-message-meta span + span {
        margin-left: 5px;
      }
      .acpchat-message-user .acpchat-message-meta {
        justify-content: flex-end;
      }
      .acpchat-message-body {
        background: var(--acpchat-surface-muted);
        border: 1px solid transparent;
        border-radius: 8px;
        font-size: 12px;
        max-width: 100%;
        min-width: 0;
        overflow-wrap: anywhere;
        padding: 6px 8px;
        white-space: normal;
        word-break: break-word;
      }
      .acpchat-message-body * {
        max-width: 100%;
        overflow-wrap: anywhere;
        white-space: normal;
        word-break: break-word;
      }
      .acpchat-message-user .acpchat-message-body {
        background: var(--acpchat-accent-soft);
        border-color: rgba(37, 99, 235, 0.15);
        color: var(--acpchat-text);
      }
      .acpchat-message-assistant .acpchat-message-body {
        background: var(--acpchat-surface);
        border-color: var(--acpchat-border);
      }
      .acpchat-message-tool .acpchat-message-body,
      .acpchat-message-system .acpchat-message-body {
        background: transparent;
        border-color: transparent;
        color: var(--acpchat-muted);
        font-size: 11px;
        padding: 2px 0;
      }
      .acpchat-message-status-error .acpchat-message-body {
        border-color: rgba(179, 38, 30, 0.25);
      }
      .acpchat-message-state {
        background: var(--acpchat-surface-muted);
        border-radius: 999px;
        padding: 1px 5px;
      }
      .acpchat-message-status-error .acpchat-message-state {
        background: #fdeceb;
        color: var(--acpchat-danger);
      }
      .acpchat-message-status-streaming .acpchat-message-state {
        background: #fff4dc;
        color: #8a5a00;
      }
      .acpchat-message-body p {
        margin: 0 0 0.5em;
        overflow-wrap: anywhere;
      }
      .acpchat-message-body p:last-child {
        margin-bottom: 0;
      }
      .acpchat-message-body ul,
      .acpchat-message-body ol {
        margin: 0.35em 0 0.5em 1.25em;
        padding: 0;
      }
      .acpchat-message-body li {
        margin: 0.1em 0;
      }
      .acpchat-message-body pre {
        background: rgba(0, 0, 0, 0.06);
        border-radius: 6px;
        margin: 0.5em 0;
        max-width: 100%;
        overflow: auto;
        padding: 6px;
        white-space: pre-wrap !important;
      }
      .acpchat-message-body code {
        background: rgba(0, 0, 0, 0.06);
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.92em;
        padding: 0 3px;
      }
      .acpchat-message-body pre code {
        background: transparent;
        padding: 0;
        white-space: pre-wrap !important;
      }
      .acpchat-message-body blockquote {
        border-left: 3px solid var(--acpchat-border);
        color: var(--acpchat-muted);
        margin: 0.5em 0;
        padding-left: 7px;
      }
      .acpchat-message-body table {
        border-collapse: collapse;
        display: block;
        margin: 0.5em 0;
        max-width: 100%;
        overflow: auto;
      }
      .acpchat-message-body th,
      .acpchat-message-body td {
        border: 1px solid var(--acpchat-border);
        padding: 3px 5px;
      }
      .acpchat-composer {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-width: 100%;
        min-width: 0;
        padding: 7px;
      }
      .acpchat-input {
        display: block;
        line-height: 1.4;
        max-width: 100%;
        min-height: 68px;
        overflow-x: hidden;
        overflow-wrap: anywhere;
        padding: 6px 7px;
        resize: vertical;
        white-space: pre-wrap !important;
        word-break: break-word;
      }
      .acpchat-input:focus,
      .acpchat-select:focus {
        border-color: rgba(37, 99, 235, 0.42);
        outline: 2px solid rgba(37, 99, 235, 0.12);
      }
      .acpchat-input:disabled {
        opacity: 0.64;
      }
      .acpchat-composer-footer {
        align-items: center;
        display: flex;
        gap: 6px;
        justify-content: space-between;
        max-width: 100%;
        min-width: 0;
      }
      .acpchat-composer-hint {
        color: var(--acpchat-muted);
        min-width: 0;
        overflow-wrap: anywhere;
        font-size: 10px;
        line-height: 1.25;
      }
      .acpchat-button-row {
        display: flex;
        flex: 0 0 auto;
        gap: 5px;
        min-width: 0;
      }
      .acpchat-send,
      .acpchat-cancel {
        border-radius: 6px;
        font-weight: 600;
        min-height: 26px;
        padding: 2px 9px;
      }
      .acpchat-send {
        background: var(--acpchat-accent);
        border: 1px solid var(--acpchat-accent);
        color: #ffffff;
      }
      .acpchat-send:disabled {
        opacity: 0.5;
      }
      .acpchat-cancel {
        background: var(--acpchat-surface);
        border: 1px solid var(--acpchat-border);
        color: var(--acpchat-muted);
      }
      .acpchat-loading-card,
      .acpchat-fatal {
        padding: 10px;
      }
      .acpchat-loading-title,
      .acpchat-fatal-title {
        font-size: 12px;
        font-weight: 650;
      }
      .acpchat-loading-detail,
      .acpchat-fatal-detail {
        color: var(--acpchat-muted);
        font-size: 11px;
        line-height: 1.4;
        margin-top: 3px;
      }
      .acpchat-fatal {
        border-color: rgba(179, 38, 30, 0.24);
      }
      .acpchat-fatal-title,
      .acpchat-error {
        color: var(--acpchat-danger);
      }
      .acpchat-toolbar-button {
        align-items: center;
        display: inline-flex;
        font-weight: 700;
        justify-content: center;
        min-height: 28px;
        min-width: 28px;
      }
      @keyframes acpchat-pulse {
        0%, 100% { opacity: 0.42; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.12); }
      }
      @media (max-width: 260px) {
        .acpchat-controls {
          grid-template-columns: 1fr;
        }
        .acpchat-composer-footer {
          align-items: stretch;
          flex-direction: column;
        }
        .acpchat-button-row {
          justify-content: flex-end;
        }
      }
      @media (prefers-color-scheme: dark) {
        .acpchat-panel {
          --acpchat-accent: #7aa2ff;
          --acpchat-accent-soft: rgba(122, 162, 255, 0.16);
          --acpchat-accent-border: rgba(122, 162, 255, 0.32);
          --acpchat-surface: #1f2125;
          --acpchat-surface-muted: #2a2d32;
          --acpchat-border: rgba(255, 255, 255, 0.14);
          --acpchat-text: #f2f4f8;
          --acpchat-muted: #a7adb7;
          --acpchat-danger: #ffb4ab;
        }
        .acpchat-status-chip.is-ready,
        .acpchat-status-chip.is-success {
          background: rgba(62, 166, 105, 0.16);
          color: #91d7a8;
        }
        .acpchat-status-chip.is-busy,
        .acpchat-message-status-streaming .acpchat-message-state {
          background: rgba(214, 162, 67, 0.16);
          color: #f4c26b;
        }
        .acpchat-status-chip.is-error,
        .acpchat-message-status-error .acpchat-message-state {
          background: rgba(255, 180, 171, 0.14);
          color: var(--acpchat-danger);
        }
      }
    `;
  }
}
function registerReaderToolbarEntry(): void {
  if (toolbarHandler) return;
  toolbarHandler = (event: any) => {
    const { doc, reader, append } = event;
    const button = doc.createElement("button");
    button.className = "toolbar-button acpchat-toolbar-button";
    button.type = "button";
    button.title = getMainWindowString(
      "acpchat-toolbar-button-title",
      "Open Agent Client",
    );
    button.setAttribute("aria-label", button.title);
    button.textContent = getMainWindowString(
      "acpchat-toolbar-button-label",
      "AI",
    );
    button.addEventListener("click", () => {
      try {
        focusAcpPane(reader._window ?? Zotero.getMainWindow());
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
}

function focusAcpPane(win: Window): void {
  const doc = win.document;
  const itemDetails = doc.querySelector(
    'item-details[tabType="reader"]',
  ) as any;
  const section = Array.from(
    doc.querySelectorAll("item-pane-custom-section"),
  ).find((node) => (node as HTMLElement).dataset.pane?.includes(PANE_ID)) as
    | HTMLElement
    | undefined;
  const paneID = section?.dataset.pane;
  if (!itemDetails || !paneID) return;
  const pane = itemDetails.closest("context-pane, item-pane") as any;
  if (pane) pane.collapsed = false;
  itemDetails.pinnedPane = paneID;
  void itemDetails.scrollToPane?.(paneID, "smooth");
}

function movePaneToTop(body: HTMLElement): void {
  const section = body.closest(
    "item-pane-custom-section",
  ) as HTMLElement | null;
  const itemDetails = body.closest("item-details") as any;
  const paneID = section?.dataset?.pane;
  if (!paneID || typeof itemDetails?.changePaneOrder !== "function") return;
  void itemDetails.changePaneOrder(paneID, 0, { render: false });
}

function renderPanel(body: HTMLElement, item: any): void {
  panelRoots.get(body)?.unmount();
  panelRoots.delete(body);
  body.classList.add("acpchat-host");
  renderPlainLoading(body);

  void renderPanelAsync(body, item).catch((error) => {
    renderPlainError(body, error);
  });
}

async function renderPanelAsync(body: HTMLElement, item: any): Promise<void> {
  const view = await import("./acpChatView");
  const root = view.createAcpChatRoot(body);
  panelRoots.set(body, root);
  root.renderLoading(getMainWindowString);

  const settings = getSettings();
  const store = new FileSessionStore(settings.sessionStorePath);
  const pdf = await resolvePdfContext(item);
  let activeSessionId: string | null = null;

  const initialRecord = pdf
    ? await getOrCreateRecord(store, pdf, settings.defaultAgent)
    : null;
  const initialStatus: ChatStatus = pdf
    ? {
        kind: "ready",
        text: getMainWindowString("acpchat-status-ready", "Ready"),
      }
    : {
        kind: "muted",
        text: getMainWindowString("acpchat-status-no-pdf", "No PDF"),
      };

  const buildPrompt = (presetId: string) => {
    if (!pdf) return "";
    const preset = settings.promptPresets.find(
      (candidate) => candidate.id === presetId,
    );
    return renderTemplate(settings.defaultTemplate, {
      title: pdf.title,
      year: pdf.year,
      prompt: renderTemplate(preset?.prompt ?? "", {
        title: pdf.title,
        year: pdf.year,
        prompt: "",
      }),
    });
  };

  const onSend = async ({
    agentId,
    record,
    setRecord,
    setStatus,
    text,
  }: SendPromptRequest) => {
    if (!pdf) return;
    const profile = settings.agentProfiles.find(
      (candidate) => candidate.id === agentId,
    );
    if (!profile) {
      setStatus({
        kind: "error",
        text: getMainWindowString(
          "acpchat-error-invalid-agent",
          "Select a valid ACP agent",
        ),
      });
      return;
    }

    const userMessage = makeMessage("user", text, "done");
    const assistantMessage = makeMessage("assistant", "", "streaming");
    let nextRecord: SessionRecord = {
      ...record,
      agentId: profile.id,
      messages: [...record.messages, userMessage, assistantMessage],
      updatedAt: new Date().toISOString(),
    };
    setRecord(nextRecord);
    await store.upsert(nextRecord);

    const client = getClient(profile);
    const removeUpdate = client.onUpdate((update) => {
      if (!activeSessionId || update.sessionId !== activeSessionId) return;
      nextRecord = applyAcpUpdate(
        nextRecord,
        assistantMessage.id,
        update.update,
      );
      setRecord(nextRecord);
      void store.upsert(nextRecord);
    });

    try {
      setStatus({
        kind: "busy",
        text: getMainWindowString(
          "acpchat-status-starting",
          "Starting {agent}...",
          {
            agent: profile.name,
          },
        ),
      });
      activeSessionId = await client.loadOrCreateSession(
        nextRecord.sessionId,
        pdf.cwd,
      );
      nextRecord = {
        ...nextRecord,
        sessionId: activeSessionId,
        updatedAt: new Date().toISOString(),
      };
      await store.upsert(nextRecord);
      setRecord(nextRecord);
      setStatus({
        kind: "busy",
        text: getMainWindowString("acpchat-status-running", "Running"),
      });

      const response = await client.sendPrompt(
        activeSessionId,
        makePromptContent(text, pdf),
      );
      nextRecord = markMessage(
        nextRecord,
        assistantMessage.id,
        response.stopReason === "cancelled" ? "cancelled" : "done",
      );
      await store.upsert(nextRecord);
      setRecord(nextRecord);
      setStatus({
        kind: response.stopReason ? "muted" : "success",
        text: response.stopReason
          ? getMainWindowString("acpchat-status-stopped", "Stopped: {reason}", {
              reason: response.stopReason,
            })
          : getMainWindowString("acpchat-status-done", "Done"),
      });
    } catch (error) {
      nextRecord = markMessage(
        nextRecord,
        assistantMessage.id,
        "error",
        toMessage(error),
      );
      await store.upsert(nextRecord);
      setRecord(nextRecord);
      setStatus({ kind: "error", text: toMessage(error) });
    } finally {
      activeSessionId = null;
      removeUpdate();
    }
  };

  const onCancel = (agentId: string) => {
    const profile = settings.agentProfiles.find(
      (candidate) => candidate.id === agentId,
    );
    if (!profile || !activeSessionId) return false;
    getClient(profile).cancel(activeSessionId);
    return true;
  };

  if (panelRoots.get(body) !== root) return;
  root.renderPanel({
    buildPrompt,
    initialRecord,
    initialStatus,
    l10n: getMainWindowString,
    onCancel,
    onSend,
    pdf,
    renderMarkdown: (text: string) => markdown.render(text),
    settings,
  });
}

function renderPlainLoading(body: HTMLElement): void {
  body.textContent = "";
  const doc = body.ownerDocument!;
  const panel = doc.createElement("section");
  panel.className = "acpchat-panel";
  const card = doc.createElement("div");
  card.className = "acpchat-loading-card";
  const title = doc.createElement("div");
  title.className = "acpchat-loading-title";
  title.textContent = getMainWindowString(
    "acpchat-panel-loading-title",
    "Preparing research context",
  );
  const detail = doc.createElement("div");
  detail.className = "acpchat-loading-detail";
  detail.textContent = getMainWindowString(
    "acpchat-panel-loading-detail",
    "Looking for a local PDF attachment and recent chat state.",
  );
  card.append(title, detail);
  panel.append(card);
  body.append(panel);
}

function renderPlainError(body: HTMLElement, error: unknown): void {
  panelRoots.get(body)?.unmount();
  panelRoots.delete(body);
  body.textContent = "";
  const doc = body.ownerDocument!;
  const panel = doc.createElement("section");
  panel.className = "acpchat-panel";
  const card = doc.createElement("div");
  card.className = "acpchat-fatal";
  const title = doc.createElement("div");
  title.className = "acpchat-fatal-title";
  title.textContent = getMainWindowString(
    "acpchat-fatal-title",
    "Could not load Agent Client",
  );
  const detail = doc.createElement("div");
  detail.className = "acpchat-fatal-detail";
  detail.textContent = toMessage(error);
  card.append(title, detail);
  panel.append(card);
  body.append(panel);
}

function getSettings(): Settings {
  return {
    agentProfiles: getJson("agentProfiles", []),
    defaultAgent: getString("defaultAgent", "codex"),
    promptPresets: getJson("promptPresets", []),
    defaultPresetId: getString("defaultPresetId", "summary"),
    sessionStorePath: getString("sessionStorePath", ""),
    defaultTemplate: getString("defaultTemplate", "{{prompt}}"),
  };
}

function getString(name: string, fallback: string): string {
  const value = Zotero.Prefs.get(`${PREF_PREFIX}.${name}`, true);
  return typeof value === "string" ? value : fallback;
}

function getJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(getString(name, JSON.stringify(fallback))) as T;
  } catch (error) {
    Zotero.logError(error as Error);
    return fallback;
  }
}

async function resolvePdfContext(item: any): Promise<PdfContext | null> {
  const pdfItem = await getPdfAttachment(item);
  if (!pdfItem) return null;
  const filePath = await pdfItem.getFilePathAsync();
  if (!filePath) return null;
  const sourceItem = pdfItem.parentItem ?? item;
  const title = String(
    sourceItem?.getField?.("title", false, true) ||
      pdfItem.attachmentFilename ||
      "Untitled PDF",
  );
  const date = String(sourceItem?.getField?.("date", false, true) || "");
  const stat = await statFile(filePath);
  return {
    itemID: pdfItem.id,
    libraryID: pdfItem.libraryID,
    sourceItemID: sourceItem?.id ?? pdfItem.id,
    title,
    year: date.match(/\d{4}/)?.[0] ?? "",
    fileName: pdfItem.attachmentFilename || basename(filePath),
    filePath,
    fileUri: pathToFileUri(filePath),
    fileSize: stat?.size ?? null,
    cwd: dirname(filePath),
  };
}

async function getPdfAttachment(item: any): Promise<any | null> {
  if (!item) return null;
  if (item.isAttachment?.()) return isPdf(item) ? item : null;
  const best = await item.getBestAttachment?.();
  if (best && isPdf(best)) return best;
  if (item.getAttachments) {
    const attachments = Zotero.Items.get(
      item.getAttachments(false),
    ) as unknown as any[];
    return attachments.find((candidate: any) => isPdf(candidate)) ?? null;
  }
  return null;
}

function isPdf(item: any): boolean {
  return (
    item.isPDFAttachment?.() || item.attachmentContentType === "application/pdf"
  );
}

function makePromptContent(text: string, pdf: PdfContext): any[] {
  return [
    { type: "text", text },
    {
      type: "resource_link",
      uri: pdf.fileUri,
      name: pdf.fileName,
      mimeType: "application/pdf",
      size: pdf.fileSize,
    },
  ];
}

class AcpClient {
  private process: any | null = null;
  private nextId = 1;
  private initializeResult: any = null;
  private pending = new Map<number, any>();
  private updateListeners = new Set<(update: any) => void>();

  constructor(private profile: AgentProfile) {}

  onUpdate(listener: (update: any) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  async connect(): Promise<any> {
    if (this.initializeResult) return this.initializeResult;
    const command = await resolveExecutableCommand(
      this.profile.command,
      this.profile.env ?? {},
    );
    const environment = buildProcessEnvironment(this.profile.env ?? {});
    const options: any = { command, arguments: this.profile.args ?? [] };
    if (Object.keys(environment).length) {
      options.environment = environment;
      options.environmentAppend = true;
    }
    const { Subprocess } = ChromeUtils.importESModule(
      "resource://gre/modules/Subprocess.sys.mjs",
    );
    this.process = await Subprocess.call(options);
    void this.readStdout();
    void this.watchExit();
    this.initializeResult = await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: {
        name: "zotero-agent-client",
        title: "Zotero Agent Client",
        version: "0.1.0",
      },
    });
    return this.initializeResult;
  }

  async loadOrCreateSession(
    recordedSessionId: string | undefined,
    cwd: string,
  ): Promise<string> {
    const init = await this.connect();
    if (recordedSessionId && init.agentCapabilities?.loadSession) {
      await this.request(
        "session/load",
        { sessionId: recordedSessionId, cwd, mcpServers: [] },
        120000,
      );
      return recordedSessionId;
    }
    const result = await this.request("session/new", { cwd, mcpServers: [] });
    if (!result.sessionId)
      throw new Error("ACP agent did not return a sessionId");
    return result.sessionId;
  }

  sendPrompt(sessionId: string, prompt: any[]): Promise<any> {
    return this.request(
      "session/prompt",
      { sessionId, prompt },
      10 * 60 * 1000,
    );
  }

  cancel(sessionId: string): void {
    this.write({
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId },
    });
  }

  close(): void {
    try {
      this.process?.stdin?.close();
      this.process?.kill?.();
    } catch {
      // The subprocess may already be gone while Zotero is unloading.
    }
    this.process = null;
  }

  private request(
    method: string,
    params: any,
    timeoutMs = 30000,
  ): Promise<any> {
    const id = this.nextId++;
    this.write({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  private write(message: any): void {
    if (!this.process) throw new Error("ACP process is not running");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private async readStdout(): Promise<void> {
    let buffer = "";
    let chunk = "";
    while (this.process && (chunk = await this.process.stdout.readString())) {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) this.handleMessage(JSON.parse(line));
        index = buffer.indexOf("\n");
      }
    }
  }

  private async watchExit(): Promise<void> {
    const result = await this.process.wait();
    if (result.exitCode !== 0) {
      for (const pending of this.pending.values())
        pending.reject(new Error(`ACP exited with ${result.exitCode}`));
      this.pending.clear();
    }
  }

  private handleMessage(message: any): void {
    if (
      typeof message.id === "number" &&
      (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))
    ) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(message.error.message || "ACP request failed"),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method === "session/update") {
      for (const listener of this.updateListeners) listener(message.params);
      return;
    }
    if (typeof message.id === "number") {
      this.write({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "Unsupported client method" },
      });
    }
  }
}

class FileSessionStore {
  constructor(private configuredPath: string) {}

  async get(key: string): Promise<SessionRecord | undefined> {
    return (await this.read()).records.find((record) => record.key === key);
  }

  async upsert(record: SessionRecord): Promise<void> {
    const store = await this.read();
    store.records = store.records.filter(
      (candidate) => candidate.key !== record.key,
    );
    store.records.push(record);
    await this.write(store);
  }

  private async path(): Promise<string> {
    return (
      this.configuredPath.trim() ||
      PathUtils.join(
        (Zotero as any).Profile.dir,
        "agentclient",
        "sessions.json",
      )
    );
  }

  private async read(): Promise<StoreDocument> {
    try {
      return JSON.parse(
        await IOUtils.readUTF8(await this.path()),
      ) as StoreDocument;
    } catch {
      return { version: 1, records: [] };
    }
  }

  private async write(store: StoreDocument): Promise<void> {
    const path = await this.path();
    const parent = PathUtils.parent(path);
    if (parent) {
      await IOUtils.makeDirectory(parent, { ignoreExisting: true });
    }
    await IOUtils.writeUTF8(path, `${JSON.stringify(store, null, 2)}\n`);
  }
}

function getClient(profile: AgentProfile): AcpClient {
  const existing = clientPool.get(profile.id);
  if (existing) return existing;
  const client = new AcpClient(profile);
  clientPool.set(profile.id, client);
  return client;
}

async function getOrCreateRecord(
  store: FileSessionStore,
  pdf: PdfContext,
  agentId: string,
): Promise<SessionRecord> {
  const key = `${pdf.libraryID}:${pdf.sourceItemID}:${pdf.itemID}`;
  return (
    (await store.get(key)) ?? {
      key,
      agentId,
      pdfItemID: pdf.itemID,
      pdfPathHash: simpleHash(pdf.filePath),
      messages: [
        makeMessage(
          "system",
          getMainWindowString(
            "acpchat-system-attached-pdf",
            "Attached PDF: {fileName}",
            {
              fileName: pdf.fileName,
            },
          ),
          "done",
        ),
      ],
      updatedAt: new Date().toISOString(),
    }
  );
}

function applyAcpUpdate(
  record: SessionRecord,
  id: string,
  update: any,
): SessionRecord {
  if (
    update.sessionUpdate === "agent_message_chunk" &&
    update.content?.type === "text"
  ) {
    return {
      ...record,
      messages: record.messages.map((message) =>
        message.id === id
          ? { ...message, text: message.text + update.content.text }
          : message,
      ),
      updatedAt: new Date().toISOString(),
    };
  }
  if (update.sessionUpdate === "tool_call") {
    return {
      ...record,
      messages: [
        ...record.messages,
        makeMessage(
          "tool",
          `${update.title ?? "Tool call"} (${update.status ?? "pending"})`,
          "done",
        ),
      ],
      updatedAt: new Date().toISOString(),
    };
  }
  return record;
}

function markMessage(
  record: SessionRecord,
  id: string,
  status: NonNullable<ChatMessage["status"]>,
  fallback = "",
): SessionRecord {
  return {
    ...record,
    messages: record.messages.map((message) =>
      message.id === id
        ? { ...message, status, text: message.text || fallback }
        : message,
    ),
    updatedAt: new Date().toISOString(),
  };
}

function makeMessage(
  role: ChatRole,
  text: string,
  status: MessageStatus,
): ChatMessage {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    role,
    text,
    status,
    createdAt: new Date().toISOString(),
  };
}

function getMainWindowString(
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
): string {
  try {
    if (!mainWindowL10n) {
      const LocalizationCtor =
        typeof Localization === "undefined"
          ? ztoolkit.getGlobal("Localization")
          : Localization;
      mainWindowL10n = new LocalizationCtor(
        [`${config.addonRef}-mainWindow.ftl`],
        true,
      );
    }
    const pattern = mainWindowL10n.formatMessagesSync([
      { id: `${config.addonRef}-${id}`, args },
    ])[0] as FluentPattern | undefined;
    return pattern?.value || formatPlainTemplate(fallback, args);
  } catch {
    return formatPlainTemplate(fallback, args);
  }
}

function formatPlainTemplate(
  template: string,
  args?: Record<string, unknown>,
): string {
  if (!args) return template;
  return template.replace(/\{\s*(\w+)\s*\}/g, (match, key) =>
    Object.hasOwn(args, key) ? String(args[key] ?? "") : match,
  );
}

function renderTemplate(
  template: string,
  vars: { title: string; year: string; prompt: string },
): string {
  return template.replace(
    /\{\{\s*(title|year|prompt)\s*\}\}/g,
    (_match, key: "title" | "year" | "prompt") => vars[key] ?? "",
  );
}

function pathToFileUri(path: string): string {
  return `file://${path
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "/";
}

async function statFile(path: string): Promise<{ size: number } | null> {
  try {
    const stat = await IOUtils.stat(path);
    return typeof stat.size === "number" ? { size: stat.size } : null;
  } catch {
    return null;
  }
}

function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function resolveExecutableCommand(
  command: string,
  env: Record<string, string>,
): Promise<string> {
  const normalizedCommand = expandHomePath(command.trim());
  if (!normalizedCommand) {
    throw new Error("ACP command is empty");
  }
  if (normalizedCommand.includes("/")) {
    return normalizedCommand;
  }

  for (const entry of collectSearchPathEntries(env)) {
    const candidate = PathUtils.join(entry, normalizedCommand);
    if (await IOUtils.exists(candidate)) {
      return candidate;
    }
  }

  const { Subprocess } = ChromeUtils.importESModule(
    "resource://gre/modules/Subprocess.sys.mjs",
  );
  try {
    const resolved = await Subprocess.pathSearch(normalizedCommand);
    if (resolved && resolved !== normalizedCommand) {
      return resolved;
    }
  } catch {
    // Some Zotero runtimes do not expose pathSearch consistently.
  }

  throw new Error(
    `Executable not found: ${normalizedCommand}. ` +
      "Use an absolute path in agentProfiles.command, " +
      "or set agentProfiles.env.PATH to include the executable directory.",
  );
}

function buildProcessEnvironment(
  env: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...env };
  if (!next.PATH && !next.Path) {
    const mergedPath = collectSearchPathEntries(env).join(":");
    if (mergedPath) next.PATH = mergedPath;
  }
  return next;
}

function collectSearchPathEntries(env: Record<string, string>): string[] {
  const pathEntries = splitPathEntries(env.PATH || env.Path || "");
  const processPath = splitPathEntries(
    Services.env.get("PATH") || Services.env.get("Path"),
  );
  const defaults = defaultPathEntries();
  return Array.from(new Set([...pathEntries, ...processPath, ...defaults]));
}

function splitPathEntries(pathValue: string): string[] {
  return pathValue
    .split(":")
    .map((entry) => expandHomePath(entry.trim()))
    .filter((entry) => !!entry);
}

function defaultPathEntries(): string[] {
  const home = getHomeDir();
  const dynamic = [
    home ? PathUtils.join(home, ".local", "bin") : "",
    home ? PathUtils.join(home, "bin") : "",
    home ? PathUtils.join(home, ".cargo", "bin") : "",
    home ? PathUtils.join(home, ".npm-global", "bin") : "",
    home ? PathUtils.join(home, "Library", "pnpm") : "",
  ];
  return [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    ...dynamic,
  ]
    .map((entry) => expandHomePath(entry))
    .filter((entry) => !!entry);
}

function expandHomePath(path: string): string {
  if (!path) return "";
  const home = getHomeDir();
  if (!home) return path;
  if (path === "~") return home;
  if (path.startsWith("~/")) return PathUtils.join(home, path.slice(2));
  return path;
}

function getHomeDir(): string {
  if (typeof (PathUtils as any).homeDir === "string") {
    return (PathUtils as any).homeDir;
  }
  const envHome = Services.env.get("HOME") || Services.env.get("USERPROFILE");
  if (envHome) return envHome;

  try {
    const profileDir = String((Zotero as any).Profile?.dir || "");
    return deriveHomeFromProfileDir(profileDir);
  } catch {
    return "";
  }
}

function deriveHomeFromProfileDir(profileDir: string): string {
  if (!profileDir) return "";
  const normalized = profileDir.replace(/\\/g, "/");
  const markers = [
    "/Library/Application Support/Zotero/",
    "/.zotero/",
    "/AppData/",
  ];
  for (const marker of markers) {
    const index = normalized.indexOf(marker);
    if (index > 0) {
      return normalized.slice(0, index);
    }
  }
  return "";
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
