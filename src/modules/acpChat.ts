import { config } from "../../package.json";
import MarkdownIt from "markdown-it";
import type {
  AcpChatRoot,
  ChatStatus,
  LoadAgentStateRequest,
  NewTopicRequest,
  SetConfigOptionRequest,
  SendPromptRequest,
} from "./acpChatView";

export type ChatRole = "user" | "assistant" | "tool" | "system";

export interface AgentProfile {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface Settings {
  agentProfiles: AgentProfile[];
  defaultAgent: string;
  sessionStorePath: string;
  defaultTemplate: string;
}

export interface SessionConfigOptionValue {
  value: string;
  name: string;
  description?: string;
}

export interface SessionConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: "select";
  currentValue: string;
  options: SessionConfigOptionValue[];
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
  topicId: string;
  agentId: string;
  sessionId?: string;
  pdfItemID: number;
  pdfPathHash: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface TopicSummary {
  key: string;
  title: string;
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

export interface AttachmentContext {
  fileName: string;
  filePath: string;
  fileUri: string;
  fileSize: number | null;
  mimeType?: string;
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
const DEFAULT_AGENT_PROFILES: AgentProfile[] = [
  {
    id: "codex",
    name: "Codex ACP",
    command: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
    env: {},
  },
  {
    id: "claude",
    name: "Claude ACP",
    command: "npx",
    args: ["-y", "@zed-industries/claude-agent-acp"],
    env: {},
  },
];

const clientPool = new Map<string, AcpClient>();
const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: false,
  xhtmlOut: true,
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
        contain: inline-size;
        display: flex;
        flex-direction: column;
        inline-size: 100%;
        max-width: 100%;
        min-height: 0;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
      }
      .acpchat-host > * {
        flex: 1 1 auto;
        inline-size: 100%;
        max-width: 100%;
        min-height: 0;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
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
        block-size: min(76vh, 860px);
        color: var(--acpchat-text);
        contain: inline-size;
        display: flex;
        flex-direction: column;
        font: 12px/1.42 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        gap: 8px;
        inline-size: 100%;
        max-block-size: min(76vh, 860px);
        max-width: 100%;
        min-block-size: 320px;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
        overflow-y: hidden;
        padding: 6px 8px 8px;
        position: relative;
        width: 100%;
      }
      .acpchat-panel button,
      .acpchat-panel select,
      .acpchat-panel textarea {
        font: inherit !important;
      }
      .acpchat-topbar,
      .acpchat-topic-list,
      .acpchat-header,
      .acpchat-context-card,
      .acpchat-messages,
      .acpchat-composer,
      .acpchat-loading-card,
      .acpchat-fatal {
        background: var(--acpchat-surface);
        border: 1px solid var(--acpchat-border);
        border-radius: 8px;
        inline-size: 100%;
        max-width: 100%;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
      }
      .acpchat-topbar {
        display: flex;
        flex: 0 0 auto;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
        padding: 7px 8px;
        z-index: 2;
      }
      .acpchat-topbar-main {
        align-items: center;
        display: grid;
        gap: 6px;
        grid-template-columns: minmax(0, 1fr) auto auto;
        min-width: 0;
      }
      .acpchat-agent-select {
        width: 100%;
      }
      .acpchat-topbar-action,
      .acpchat-topbar-plus {
        align-items: center;
        background: var(--acpchat-surface-muted);
        border: 1px solid var(--acpchat-border);
        border-radius: 6px;
        color: var(--acpchat-muted);
        display: inline-flex;
        font-size: 10px;
        font-weight: 650;
        justify-content: center;
        line-height: 1;
        min-height: 26px;
        min-width: 0;
        padding: 2px 8px;
      }
      .acpchat-topbar-action.is-active {
        border-color: var(--acpchat-accent-border);
        color: var(--acpchat-accent);
      }
      .acpchat-topbar-plus {
        font-size: 17px;
        padding: 0;
        width: 28px;
      }
      .acpchat-topbar-status {
        display: flex;
        justify-content: flex-end;
      }
      .acpchat-topic-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
        padding: 7px 8px;
      }
      .acpchat-topic-list-label {
        color: var(--acpchat-muted);
        font-size: 10px;
        font-weight: 650;
        line-height: 1.2;
      }
      .acpchat-topic-list-items {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: min(34vh, 220px);
        overflow-y: auto;
      }
      .acpchat-history-backdrop {
        background: transparent;
        border: 0;
        bottom: 0;
        left: 0;
        position: absolute;
        right: 0;
        top: 50px;
        z-index: 3;
      }
      .acpchat-history-drawer {
        left: 8px;
        opacity: 0;
        pointer-events: none;
        position: absolute;
        right: 8px;
        top: 50px;
        transform: translateY(-4px);
        transition: opacity 0.14s ease, transform 0.14s ease;
        z-index: 4;
      }
      .acpchat-history-drawer.is-open {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }
      .acpchat-history-drawer .acpchat-topic-list {
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.15);
      }
      .acpchat-topic-item {
        align-items: center;
        background: var(--acpchat-surface-muted);
        border: 1px solid var(--acpchat-border);
        border-radius: 6px;
        color: var(--acpchat-text);
        display: grid;
        gap: 6px;
        grid-template-columns: minmax(0, 1fr) auto;
        min-width: 0;
        padding: 4px 6px;
        text-align: left;
      }
      .acpchat-topic-item.is-active {
        border-color: var(--acpchat-accent-border);
        box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16);
      }
      .acpchat-topic-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .acpchat-topic-time {
        color: var(--acpchat-muted);
        font-size: 10px;
        line-height: 1.2;
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
      .acpchat-header-actions {
        align-items: center;
        display: flex;
        flex: 0 1 auto;
        gap: 6px;
        justify-content: flex-end;
        max-width: 58%;
        min-width: 0;
        overflow: hidden;
      }
      .acpchat-new-topic {
        background: var(--acpchat-surface-muted);
        border: 1px solid var(--acpchat-border);
        border-radius: 999px;
        color: var(--acpchat-muted);
        flex: 0 1 auto;
        font-size: 10px;
        font-weight: 650;
        line-height: 1.2;
        max-width: 74px;
        min-height: 24px;
        min-width: 0;
        overflow: hidden;
        padding: 2px 7px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .acpchat-new-topic:disabled {
        opacity: 0.48;
      }
      .acpchat-brand {
        align-items: center;
        display: flex;
        flex: 1 1 auto;
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
        max-width: 100%;
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
        flex: 1 1 auto;
        flex-direction: column;
        gap: 8px;
        inline-size: 100%;
        max-height: none;
        max-width: 100%;
        min-height: 0;
        min-width: 0;
        overflow: auto;
        overflow-x: clip;
        overflow-x: hidden;
        overflow-y: auto;
        padding: 8px;
        width: 100%;
        z-index: 1;
      }
      .acpchat-turn {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
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
        contain: inline-size;
        display: flex;
        flex-direction: column;
        gap: 3px;
        line-height: 1.45;
        max-width: 100%;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
        overflow-wrap: anywhere;
        width: 100%;
      }
      .acpchat-message-user {
        align-self: stretch;
        max-width: 100%;
        width: 100%;
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
        align-self: flex-end;
        background: var(--acpchat-accent-soft);
        border-color: rgba(37, 99, 235, 0.15);
        color: var(--acpchat-text);
        max-width: 92%;
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
      .acpchat-turn-tools {
        background: var(--acpchat-surface-muted);
        border: 1px solid var(--acpchat-border);
        border-radius: 7px;
        color: var(--acpchat-muted);
        font-size: 10px;
        min-width: 0;
      }
      .acpchat-turn-tools-summary {
        align-items: center;
        cursor: pointer;
        display: flex;
        gap: 6px;
        justify-content: space-between;
        list-style: none;
        min-width: 0;
        padding: 6px 8px;
      }
      .acpchat-turn-tools-summary::-webkit-details-marker {
        display: none;
      }
      .acpchat-turn-tools-state {
        color: var(--acpchat-muted);
        font-size: 10px;
        font-weight: 650;
        min-width: 0;
      }
      .acpchat-turn-tools-state.is-active {
        color: #8a5a00;
      }
      .acpchat-turn-tools-chevron {
        color: var(--acpchat-muted);
        flex: 0 0 auto;
        font-size: 11px;
        font-weight: 700;
        transform: translateY(-0.5px);
      }
      .acpchat-turn-tools[open] .acpchat-turn-tools-chevron {
        transform: rotate(90deg);
      }
      .acpchat-turn-tools-list {
        border-top: 1px dashed var(--acpchat-border);
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 5px 8px 8px;
      }
      .acpchat-tool-item {
        background: var(--acpchat-surface);
        border: 1px solid var(--acpchat-border);
        border-radius: 6px;
        min-width: 0;
        padding: 5px 6px;
      }
      .acpchat-tool-item-meta {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .acpchat-tool-item-body {
        color: var(--acpchat-muted);
        margin-top: 2px;
        overflow-wrap: anywhere;
        white-space: normal;
        word-break: break-word;
      }
      .acpchat-turn-tools:not([open]) .acpchat-turn-tools-summary {
        border-bottom: 1px solid var(--acpchat-border);
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
        contain: inline-size;
        display: flex;
        flex: 0 0 auto;
        flex-direction: column;
        gap: 6px;
        inline-size: 100%;
        max-width: 100%;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
        padding: 7px;
        width: 100%;
      }
      .acpchat-attachments {
        display: flex;
        inline-size: 100%;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
        width: 100%;
      }
      .acpchat-attachment-pill {
        align-items: center;
        background: var(--acpchat-surface-muted);
        border: 1px solid var(--acpchat-border);
        border-radius: 999px;
        display: inline-flex;
        gap: 6px;
        inline-size: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        padding: 3px 8px;
        width: 100%;
      }
      .acpchat-attachment-type {
        color: var(--acpchat-accent);
        flex: 0 0 auto;
        font-size: 9px;
        font-weight: 700;
      }
      .acpchat-attachment-name {
        color: var(--acpchat-muted);
        flex: 1 1 auto;
        font-size: 10px;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .acpchat-attachment-remove {
        align-items: center;
        background: transparent;
        border: 0;
        color: var(--acpchat-muted);
        display: inline-flex;
        flex: 0 0 auto;
        font-size: 12px;
        height: 16px;
        justify-content: center;
        line-height: 1;
        margin-left: 2px;
        min-width: 16px;
        padding: 0;
        width: 16px;
      }
      .acpchat-attachment-remove:disabled {
        opacity: 0.42;
      }
      .acpchat-input {
        display: block;
        inline-size: 100%;
        line-height: 1.4;
        max-height: 148px;
        max-width: 100%;
        min-height: 68px;
        min-width: 0;
        overflow: hidden auto;
        overflow-x: clip;
        overflow-x: hidden;
        overflow-wrap: anywhere;
        padding: 6px 7px;
        resize: vertical;
        width: 100%;
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
      .acpchat-actions-row {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        inline-size: 100%;
        max-width: 100%;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
        width: 100%;
      }
      .acpchat-actions-spacer {
        flex: 1 1 auto;
        min-width: 0;
      }
      .acpchat-attach-wrap {
        flex: 0 0 auto;
        min-width: 0;
        position: relative;
      }
      .acpchat-attach-button {
        align-items: center;
        background: var(--acpchat-surface-muted);
        border: 1px solid var(--acpchat-border);
        border-radius: 999px;
        color: var(--acpchat-text);
        display: inline-flex;
        font-size: 18px;
        height: 30px;
        justify-content: center;
        min-width: 0;
        width: 30px;
      }
      .acpchat-attach-button.is-active {
        border-color: var(--acpchat-accent-border);
        color: var(--acpchat-accent);
      }
      .acpchat-attach-menu {
        background: var(--acpchat-surface);
        border: 1px solid var(--acpchat-border);
        border-radius: 8px;
        bottom: calc(100% + 6px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
        display: grid;
        gap: 0;
        left: 0;
        min-width: 180px;
        overflow: hidden;
        position: absolute;
        width: 220px;
        max-width: 220px;
        z-index: 5;
      }
      .acpchat-attach-option {
        align-items: center;
        background: transparent;
        border: 0;
        color: var(--acpchat-text);
        cursor: pointer;
        display: grid;
        gap: 6px;
        grid-template-columns: 12px minmax(0, 1fr);
        line-height: 1.2;
        min-width: 0;
        padding: 7px 8px;
        text-align: left;
        width: 100%;
      }
      .acpchat-attach-option:hover {
        background: var(--acpchat-surface-muted);
      }
      .acpchat-attach-option.is-active {
        background: var(--acpchat-accent-soft);
      }
      .acpchat-attach-option-check {
        color: var(--acpchat-accent);
        display: inline-flex;
        font-size: 10px;
        font-weight: 700;
        justify-content: center;
      }
      .acpchat-attach-option-content {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .acpchat-attach-option-title {
        color: var(--acpchat-text);
        font-size: 10px;
        font-weight: 650;
      }
      .acpchat-attach-option-label {
        color: var(--acpchat-muted);
        font-size: 10px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .acpchat-inline-action {
        background: var(--acpchat-surface-muted);
        border: 1px solid var(--acpchat-border);
        border-radius: 6px;
        color: var(--acpchat-muted);
        flex: 0 0 auto;
        font-size: 10px;
        font-weight: 600;
        min-height: 26px;
        padding: 2px 8px;
      }
      .acpchat-select-compact {
        flex: 0 1 92px;
        max-width: 92px;
        min-height: 26px;
        min-width: 0;
        width: 92px;
      }
      .acpchat-send {
        border-radius: 6px;
        flex: 0 0 auto;
        font-weight: 600;
        min-height: 26px;
        padding: 2px 9px;
        background: var(--acpchat-accent);
        border: 1px solid var(--acpchat-accent);
        color: #ffffff;
      }
      .acpchat-send.is-pausing {
        background: #fff4dc;
        border-color: #f1d18a;
        color: #8a5a00;
      }
      .acpchat-send:disabled {
        opacity: 0.5;
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
        .acpchat-topbar-main {
          grid-template-columns: 1fr;
        }
        .acpchat-actions-spacer {
          display: none;
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
  let pdf: PdfContext | null = null;
  try {
    pdf = await resolvePdfContext(item);
  } catch (error) {
    Zotero.logError(error as Error);
    pdf = null;
  }
  let activeSessionId: string | null = null;

  let initialLoadedState: {
    record: SessionRecord;
    topics: TopicSummary[];
    configOptions: SessionConfigOption[];
  } | null = null;
  if (pdf) {
    try {
      initialLoadedState = await loadAgentState(
        store,
        pdf,
        settings.agentProfiles,
        settings.defaultAgent,
      );
    } catch (error) {
      Zotero.logError(error as Error);
    }
  }
  const initialRecord =
    initialLoadedState?.record ??
    (pdf ? makeInitialRecord(pdf, settings.defaultAgent) : null);
  const initialTopics = initialLoadedState?.topics ?? [];
  const initialConfigOptions = initialLoadedState?.configOptions ?? [];
  const initialStatus: ChatStatus = pdf
    ? {
        kind: "ready",
        text: getMainWindowString("acpchat-status-ready", "Ready"),
      }
    : {
        kind: "muted",
        text: getMainWindowString("acpchat-status-no-pdf", "No PDF"),
      };

  const onSend = async ({
    agentId,
    attachment,
    includePdf,
    record,
    setConfigOptions,
    setTopics,
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
    setTopics(await listTopicSummaries(store, pdf, profile.id));

    const client = getClient(profile);
    const removeUpdate = client.onUpdate((update) => {
      if (!activeSessionId || update.sessionId !== activeSessionId) return;
      if (
        update.update?.sessionUpdate === "config_option_update" &&
        Array.isArray(update.update?.configOptions)
      ) {
        setConfigOptions(normalizeConfigOptions(update.update.configOptions));
        return;
      }
      nextRecord = applyAcpUpdate(
        nextRecord,
        assistantMessage.id,
        update.update,
      );
      setRecord(nextRecord);
      void store.upsert(nextRecord);
      void listTopicSummaries(store, pdf, profile.id).then(setTopics);
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
      const session = await client.loadOrCreateSession(
        nextRecord.agentId === profile.id ? nextRecord.sessionId : undefined,
        pdf.cwd,
      );
      setConfigOptions(session.configOptions);
      activeSessionId = session.sessionId;
      nextRecord = {
        ...nextRecord,
        sessionId: activeSessionId,
        updatedAt: new Date().toISOString(),
      };
      await store.upsert(nextRecord);
      setRecord(nextRecord);
      setTopics(await listTopicSummaries(store, pdf, profile.id));
      setStatus({
        kind: "busy",
        text: getMainWindowString("acpchat-status-running", "Running"),
      });

      const response = await client.sendPrompt(
        activeSessionId,
        makePromptContent(text, pdf, includePdf, attachment),
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
      setTopics(await listTopicSummaries(store, pdf, profile.id));
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

  const onNewTopic = async ({
    agentId,
    setConfigOptions,
    setTopics,
    setRecord,
    setStatus,
  }: NewTopicRequest) => {
    if (!pdf) return;
    activeSessionId = null;
    const nextRecord = makeInitialRecord(pdf, agentId);
    await store.upsert(nextRecord);
    const profile = settings.agentProfiles.find(
      (candidate) => candidate.id === agentId,
    );
    if (!profile) return;
    const session = await getClient(profile).loadOrCreateSession(
      nextRecord.sessionId,
      pdf.cwd,
    );
    const nextWithSession = {
      ...nextRecord,
      sessionId: session.sessionId,
      updatedAt: new Date().toISOString(),
    };
    await store.upsert(nextWithSession);
    setConfigOptions(session.configOptions);
    setTopics(await listTopicSummaries(store, pdf, agentId));
    setRecord(nextWithSession);
    setStatus({
      kind: "ready",
      text: getMainWindowString(
        "acpchat-status-new-topic",
        "New topic started",
      ),
    });
  };

  const onLoadAgentState = async ({
    agentId,
    preferredTopicKey,
    setConfigOptions,
    setTopics,
    setRecord,
    setStatus,
  }: LoadAgentStateRequest) => {
    if (!pdf) return;
    setStatus({
      kind: "busy",
      text: getMainWindowString("acpchat-status-loading", "Loading session..."),
    });
    const loaded = await loadAgentState(
      store,
      pdf,
      settings.agentProfiles,
      agentId,
      preferredTopicKey,
    );
    setRecord(loaded.record);
    setTopics(loaded.topics);
    setConfigOptions(loaded.configOptions);
    setStatus({
      kind: "ready",
      text: getMainWindowString("acpchat-status-ready", "Ready"),
    });
  };

  const onSetConfigOption = async ({
    agentId,
    configId,
    sessionId,
    value,
  }: SetConfigOptionRequest): Promise<SessionConfigOption[]> => {
    const profile = settings.agentProfiles.find(
      (candidate) => candidate.id === agentId,
    );
    if (!profile) {
      throw new Error(
        getMainWindowString(
          "acpchat-error-invalid-agent",
          "Select a valid ACP agent",
        ),
      );
    }
    const client = getClient(profile);
    return await client.setSessionConfigOption(sessionId, configId, value);
  };

  const onPickAttachment = async (): Promise<AttachmentContext | null> => {
    const parentWindow =
      body.ownerDocument?.defaultView ?? Zotero.getMainWindow();
    const initialDirectory = pdf?.cwd;
    return await pickLocalAttachment(parentWindow, initialDirectory);
  };

  if (panelRoots.get(body) !== root) return;
  root.renderPanel({
    initialConfigOptions,
    initialRecord,
    initialStatus,
    initialTopics,
    l10n: getMainWindowString,
    onCancel,
    onLoadAgentState,
    onSetConfigOption,
    onNewTopic,
    onPickAttachment,
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
  const configuredProfiles = normalizeAgentProfiles(
    getJson("agentProfiles", []),
  );
  const agentProfiles = configuredProfiles.length
    ? configuredProfiles
    : DEFAULT_AGENT_PROFILES;
  return {
    agentProfiles,
    defaultAgent: getString("defaultAgent", "codex"),
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

function normalizeAgentProfiles(profiles: unknown): AgentProfile[] {
  if (!Array.isArray(profiles)) return [];
  const normalized: AgentProfile[] = [];
  for (const profile of profiles) {
    if (
      !profile ||
      typeof profile !== "object" ||
      typeof (profile as AgentProfile).id !== "string" ||
      typeof (profile as AgentProfile).name !== "string" ||
      typeof (profile as AgentProfile).command !== "string" ||
      !Array.isArray((profile as AgentProfile).args) ||
      typeof (profile as AgentProfile).env !== "object"
    ) {
      continue;
    }
    try {
      normalized.push(normalizeAgentProfile(profile as AgentProfile));
    } catch (error) {
      Zotero.debug(`[acpchat] skip invalid agent profile: ${String(error)}`);
    }
  }
  return normalized;
}

function normalizeAgentProfile(profile: AgentProfile): AgentProfile {
  const command = profile.command.trim();
  if (command !== "npx") {
    throw new Error(
      `NPX-only mode: unsupported agent command "${profile.command}".`,
    );
  }
  const args = (profile.args ?? []).filter(
    (arg): arg is string => typeof arg === "string" && !!arg.trim(),
  );
  const defaultPackage = defaultNpxPackageForProfile(profile.id);
  const normalizedArgs =
    args.length > 0
      ? normalizeNpxArgs(args)
      : defaultPackage
        ? ["-y", defaultPackage]
        : [];
  if (!normalizedArgs.find((arg) => !arg.startsWith("-"))) {
    throw new Error(
      `NPX-only mode: missing package name in args for agent "${profile.id}".`,
    );
  }
  return {
    ...profile,
    command: "npx",
    args: normalizedArgs,
  };
}

function defaultNpxPackageForProfile(profileId: string): string | null {
  if (profileId === "codex") return "@zed-industries/codex-acp";
  if (profileId === "claude") return "@zed-industries/claude-agent-acp";
  return null;
}

function normalizeNpxArgs(args: string[]): string[] {
  const clean = args.map((arg) => arg.trim()).filter((arg) => !!arg);
  if (!clean.length) return clean;
  if (clean[0] === "-y" || clean[0] === "--yes") return clean;
  return ["-y", ...clean];
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

async function pickLocalAttachment(
  parentWindow: Window,
  initialDirectory?: string,
): Promise<AttachmentContext | null> {
  let FilePickerCtor: any;
  try {
    FilePickerCtor = ChromeUtils.importESModule(
      "chrome://zotero/content/modules/filePicker.mjs",
    ).FilePicker;
  } catch (error) {
    throw new Error(
      getMainWindowString(
        "acpchat-filepicker-unavailable",
        "File picker is unavailable in this Zotero build.",
      ),
      { cause: error as Error },
    );
  }
  const picker = new FilePickerCtor();
  picker.init(
    parentWindow,
    getMainWindowString("acpchat-filepicker-title", "Choose attachment"),
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
  return {
    fileName: basename(filePath),
    filePath,
    fileUri: pathToFileUri(filePath),
    fileSize: stat?.size ?? null,
    mimeType: inferMimeType(filePath),
  };
}

function makePromptContent(
  text: string,
  pdf: PdfContext,
  includePdf: boolean,
  attachment: AttachmentContext | null,
): any[] {
  const content: any[] = [{ type: "text", text }];
  if (includePdf) {
    content.push({
      type: "resource_link",
      uri: pdf.fileUri,
      name: pdf.fileName,
      mimeType: "application/pdf",
      size: pdf.fileSize,
    });
  }
  if (attachment) {
    content.push({
      type: "resource_link",
      uri: attachment.fileUri,
      name: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.fileSize,
    });
  }
  return content;
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
    const args = normalizeNpxArgs(this.profile.args ?? []);
    const packageArg = args.find((arg) => !arg.startsWith("-"));
    if (!packageArg) {
      throw new Error(
        "NPX mode requires a package name in agentProfiles.args.",
      );
    }
    const command = await resolveExecutableCommand(
      "npx",
      this.profile.env ?? {},
    );
    const environment = buildProcessEnvironment(this.profile.env ?? {});
    const options: any = { command, arguments: args };
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
  ): Promise<{ sessionId: string; configOptions: SessionConfigOption[] }> {
    const init = await this.connect();
    if (recordedSessionId && init.agentCapabilities?.loadSession) {
      const result = await this.request(
        "session/load",
        { sessionId: recordedSessionId, cwd, mcpServers: [] },
        120000,
      );
      return {
        sessionId: recordedSessionId,
        configOptions: normalizeConfigOptions(result?.configOptions),
      };
    }
    const result = await this.request("session/new", { cwd, mcpServers: [] });
    if (!result.sessionId)
      throw new Error("ACP agent did not return a sessionId");
    return {
      sessionId: result.sessionId,
      configOptions: normalizeConfigOptions(result?.configOptions),
    };
  }

  async setSessionConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<SessionConfigOption[]> {
    const result = await this.request("session/set_config_option", {
      sessionId,
      configId,
      value,
    });
    return normalizeConfigOptions(result?.configOptions);
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

  async list(): Promise<SessionRecord[]> {
    return (await this.read()).records;
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
      return normalizeStoreDocument(
        JSON.parse(await IOUtils.readUTF8(await this.path())) as StoreDocument,
      );
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

function normalizeStoreDocument(store: StoreDocument): StoreDocument {
  if (!store || typeof store !== "object" || !Array.isArray(store.records)) {
    return { version: 1, records: [] };
  }
  const normalized: SessionRecord[] = [];
  for (const record of store.records ?? []) {
    if (!record || typeof record !== "object") continue;
    const key = String(record.key || "");
    const topicId =
      typeof record.topicId === "string" && record.topicId
        ? record.topicId
        : key.split(":").slice(3).join(":") || makeTopicId();
    const updatedAt =
      typeof record.updatedAt === "string" && record.updatedAt
        ? record.updatedAt
        : new Date().toISOString();
    normalized.push({
      key,
      topicId,
      agentId: String(record.agentId || "codex"),
      sessionId:
        typeof record.sessionId === "string" ? record.sessionId : undefined,
      pdfItemID: Number(record.pdfItemID || 0),
      pdfPathHash: String(record.pdfPathHash || ""),
      messages: Array.isArray(record.messages) ? record.messages : [],
      createdAt:
        typeof record.createdAt === "string" && record.createdAt
          ? record.createdAt
          : updatedAt,
      updatedAt,
    });
  }
  return { version: 1, records: normalized.filter((record) => !!record.key) };
}

function getClient(profile: AgentProfile): AcpClient {
  const existing = clientPool.get(profile.id);
  if (existing) return existing;
  const client = new AcpClient(profile);
  clientPool.set(profile.id, client);
  return client;
}

async function loadAgentState(
  store: FileSessionStore,
  pdf: PdfContext,
  agentProfiles: AgentProfile[],
  agentId: string,
  preferredTopicKey?: string,
): Promise<{
  record: SessionRecord;
  topics: TopicSummary[];
  configOptions: SessionConfigOption[];
}> {
  const profile = agentProfiles.find((candidate) => candidate.id === agentId);
  if (!profile) {
    throw new Error(
      getMainWindowString(
        "acpchat-error-invalid-agent",
        "Select a valid ACP agent",
      ),
    );
  }
  let records = await listRecordsForPdfAgent(store, pdf, agentId);
  if (!records.length) {
    const firstRecord = makeInitialRecord(pdf, agentId);
    await store.upsert(firstRecord);
    records = [firstRecord];
  }
  const record = selectPreferredRecord(records, preferredTopicKey);
  const session = await getClient(profile).loadOrCreateSession(
    record.sessionId,
    pdf.cwd,
  );
  const withSession =
    record.sessionId === session.sessionId
      ? record
      : {
          ...record,
          sessionId: session.sessionId,
          updatedAt: new Date().toISOString(),
        };
  if (withSession !== record) {
    await store.upsert(withSession);
  }
  return {
    record: withSession,
    topics: await listTopicSummaries(store, pdf, agentId),
    configOptions: session.configOptions,
  };
}

async function listTopicSummaries(
  store: FileSessionStore,
  pdf: PdfContext,
  agentId: string,
): Promise<TopicSummary[]> {
  const records = await listRecordsForPdfAgent(store, pdf, agentId);
  return records.map((record) => ({
    key: record.key,
    title: topicTitle(record),
    updatedAt: record.updatedAt,
  }));
}

async function listRecordsForPdfAgent(
  store: FileSessionStore,
  pdf: PdfContext,
  agentId: string,
): Promise<SessionRecord[]> {
  const base = sessionKeyBase(pdf);
  return (await store.list())
    .filter((record) => record.agentId === agentId)
    .filter(
      (record) => record.key === base || record.key.startsWith(`${base}:`),
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
}

function selectPreferredRecord(
  records: SessionRecord[],
  preferredTopicKey?: string,
): SessionRecord {
  if (preferredTopicKey) {
    const preferred = records.find(
      (record) => record.key === preferredTopicKey,
    );
    if (preferred) return preferred;
  }
  return records[0];
}

function topicTitle(record: SessionRecord): string {
  const firstUser = record.messages.find(
    (message) => message.role === "user" && message.text.trim(),
  );
  if (!firstUser) return "";
  return firstUser.text.trim().replace(/\s+/g, " ").slice(0, 60);
}

function makeInitialRecord(pdf: PdfContext, agentId: string): SessionRecord {
  const now = new Date().toISOString();
  const topicId = makeTopicId();
  return {
    key: `${sessionKeyBase(pdf)}:${topicId}`,
    topicId,
    agentId,
    pdfItemID: pdf.itemID,
    pdfPathHash: simpleHash(pdf.filePath),
    messages: [makeAttachedPdfMessage(pdf)],
    createdAt: now,
    updatedAt: now,
  };
}

function sessionKeyBase(pdf: PdfContext): string {
  return `${pdf.libraryID}:${pdf.sourceItemID}:${pdf.itemID}`;
}

function makeTopicId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeAttachedPdfMessage(pdf: PdfContext): ChatMessage {
  return makeMessage(
    "system",
    getMainWindowString(
      "acpchat-system-attached-pdf",
      "Attached PDF: {fileName}",
      {
        fileName: pdf.fileName,
      },
    ),
    "done",
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

function normalizeConfigOptions(raw: unknown): SessionConfigOption[] {
  if (!Array.isArray(raw)) return [];
  const normalized: SessionConfigOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const option = item as Record<string, unknown>;
    if (option.type !== "select") continue;
    const id = typeof option.id === "string" ? option.id : "";
    const name = typeof option.name === "string" ? option.name : "";
    const currentValue =
      typeof option.currentValue === "string" ? option.currentValue : "";
    const values = Array.isArray(option.options)
      ? option.options
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const value = entry as Record<string, unknown>;
            if (
              typeof value.value !== "string" ||
              typeof value.name !== "string"
            ) {
              return null;
            }
            return {
              value: value.value,
              name: value.name,
              description:
                typeof value.description === "string"
                  ? value.description
                  : undefined,
            };
          })
          .filter((value) => !!value)
      : [];
    if (!id || !name || !currentValue || !values.length) continue;
    normalized.push({
      id,
      name,
      description:
        typeof option.description === "string" ? option.description : undefined,
      category:
        typeof option.category === "string" ? option.category : undefined,
      type: "select",
      currentValue,
      options: values as SessionConfigOptionValue[],
    });
  }
  return normalized;
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

function inferMimeType(path: string): string | undefined {
  const ext = basename(path).split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  const known: Record<string, string> = {
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return known[ext];
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
      "NPX-only mode requires npx in PATH. " +
      "Install Node.js/npm and ensure npx is available to Zotero.",
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
