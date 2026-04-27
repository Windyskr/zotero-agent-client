import type { KeyboardEvent } from "react";
import type {
  AgentProfile,
  ChatMessage,
  ChatRole,
  MessageStatus,
  PdfContext,
  PromptPreset,
  SessionRecord,
  Settings,
  StatusKind,
} from "./acpChat";
import { createZoteroReactRoot, getZoteroReact } from "./zoteroReact";

const React = getZoteroReact();
const { useMemo, useState } = React;

export interface ChatStatus {
  kind: StatusKind;
  text: string;
}

export interface SendPromptRequest {
  agentId: string;
  record: SessionRecord;
  setRecord: (record: SessionRecord) => void;
  setStatus: (status: ChatStatus) => void;
  text: string;
}

export interface NewTopicRequest {
  agentId: string;
  setRecord: (record: SessionRecord) => void;
  setStatus: (status: ChatStatus) => void;
}

export type Localize = (
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
) => string;

export interface AcpChatPanelProps {
  buildPrompt: (presetId: string) => string;
  initialRecord: SessionRecord | null;
  initialStatus: ChatStatus;
  l10n: Localize;
  onCancel: (agentId: string) => boolean;
  onNewTopic: (request: NewTopicRequest) => Promise<void>;
  onSend: (request: SendPromptRequest) => Promise<void>;
  pdf: PdfContext | null;
  renderMarkdown: (text: string) => string;
  settings: Settings;
}

export interface AcpChatRoot {
  renderLoading: (l10n: Localize) => void;
  renderPanel: (props: AcpChatPanelProps) => void;
  unmount: () => void;
}

export function AcpChatPanel({
  buildPrompt,
  initialRecord,
  initialStatus,
  l10n,
  onCancel,
  onNewTopic,
  onSend,
  pdf,
  renderMarkdown,
  settings,
}: AcpChatPanelProps) {
  const [agentId, setAgentId] = useState(
    initialRecord?.agentId || settings.defaultAgent,
  );
  const [presetId, setPresetId] = useState(settings.defaultPresetId);
  const [input, setInput] = useState(() =>
    pdf ? buildPrompt(settings.defaultPresetId) : "",
  );
  const [isRunning, setIsRunning] = useState(false);
  const [record, setRecord] = useState(initialRecord);
  const [status, setStatus] = useState(initialStatus);

  const selectedAgent = useMemo(
    () => settings.agentProfiles.find((profile) => profile.id === agentId),
    [agentId, settings.agentProfiles],
  );

  const handlePresetChange = (nextPresetId: string) => {
    setPresetId(nextPresetId);
    setInput(pdf ? buildPrompt(nextPresetId) : "");
  };

  const handleSend = async () => {
    if (!pdf || !record || isRunning) return;
    if (!selectedAgent) {
      setStatus({
        kind: "error",
        text: l10n("acpchat-error-invalid-agent", "Select a valid ACP agent"),
      });
      return;
    }

    const text = input.trim();
    if (!text) {
      setStatus({
        kind: "error",
        text: l10n("acpchat-error-empty-prompt", "Prompt is empty"),
      });
      return;
    }

    setIsRunning(true);
    try {
      await onSend({
        agentId,
        record,
        setRecord,
        setStatus,
        text,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = () => {
    if (!isRunning) return;
    if (onCancel(agentId)) {
      setStatus({
        kind: "busy",
        text: l10n("acpchat-status-cancelling", "Cancelling..."),
      });
    }
  };

  const handleNewTopic = async () => {
    if (!pdf || isRunning) return;
    setIsRunning(true);
    try {
      await onNewTopic({
        agentId,
        setRecord,
        setStatus,
      });
      setInput(buildPrompt(presetId));
    } finally {
      setIsRunning(false);
    }
  };

  const messages = record?.messages ?? [];

  return (
    <section className={`acpchat-panel${pdf ? "" : " acpchat-panel-no-pdf"}`}>
      <PanelHeader
        disableNewTopic={!pdf || isRunning}
        l10n={l10n}
        onNewTopic={handleNewTopic}
        status={status}
      />
      <PdfContextCard l10n={l10n} pdf={pdf} />
      <Controls
        agentId={agentId}
        agents={settings.agentProfiles}
        l10n={l10n}
        onAgentChange={setAgentId}
        onPresetChange={handlePresetChange}
        presetId={presetId}
        presets={settings.promptPresets}
      />
      <MessageList
        hasPdf={!!pdf}
        l10n={l10n}
        messages={messages}
        renderMarkdown={renderMarkdown}
      />
      <Composer
        disabled={!pdf}
        input={input}
        isRunning={isRunning}
        l10n={l10n}
        onCancel={handleCancel}
        onInputChange={setInput}
        onSend={handleSend}
      />
    </section>
  );
}

export function AcpChatLoading({ l10n }: { l10n: Localize }) {
  return (
    <section className="acpchat-panel">
      <div className="acpchat-loading-card">
        <div className="acpchat-loading-title">
          {l10n("acpchat-panel-loading-title", "Preparing research context")}
        </div>
        <div className="acpchat-loading-detail">
          {l10n(
            "acpchat-panel-loading-detail",
            "Looking for a local PDF attachment and recent chat state.",
          )}
        </div>
      </div>
    </section>
  );
}

export function createAcpChatRoot(container: HTMLElement): AcpChatRoot {
  const root = createZoteroReactRoot(container);
  return {
    renderLoading(l10n) {
      root.render(<AcpChatLoading l10n={l10n} />);
    },
    renderPanel(props) {
      root.render(<AcpChatPanel {...props} />);
    },
    unmount() {
      root.unmount();
    },
  };
}

function PanelHeader({
  disableNewTopic,
  l10n,
  onNewTopic,
  status,
}: {
  disableNewTopic: boolean;
  l10n: Localize;
  onNewTopic: () => void;
  status: ChatStatus;
}) {
  return (
    <header className="acpchat-header">
      <div className="acpchat-brand">
        <div className="acpchat-brand-mark">
          {l10n("acpchat-brand-mark", "AI")}
        </div>
        <div className="acpchat-brand-copy">
          <div className="acpchat-eyebrow">
            {l10n("acpchat-brand-eyebrow", "Agent Client")}
          </div>
          <div className="acpchat-title">
            {l10n("acpchat-panel-title", "Research Assistant")}
          </div>
        </div>
      </div>
      <div className="acpchat-header-actions">
        <button
          className="acpchat-new-topic"
          disabled={disableNewTopic}
          onClick={onNewTopic}
          type="button"
        >
          {l10n("acpchat-new-topic-button", "New topic")}
        </button>
        <div className={`acpchat-status-chip is-${status.kind}`}>
          {status.text}
        </div>
      </div>
    </header>
  );
}

function PdfContextCard({
  l10n,
  pdf,
}: {
  l10n: Localize;
  pdf: PdfContext | null;
}) {
  return (
    <div
      className={`acpchat-context-card${
        pdf ? "" : " acpchat-context-card-missing"
      }`}
    >
      <div className="acpchat-context-label">
        {pdf
          ? l10n("acpchat-context-pdf-label", "PDF context")
          : l10n("acpchat-context-missing-label", "No local PDF")}
      </div>
      <div className="acpchat-context-title">
        {pdf
          ? pdf.title
          : l10n(
              "acpchat-context-missing-title",
              "No local PDF attachment found",
            )}
      </div>
      <div className="acpchat-context-meta">
        {pdf
          ? formatPdfMeta(pdf)
          : l10n(
              "acpchat-context-missing-detail",
              "Open a PDF attachment, or select a parent item that has one.",
            )}
      </div>
    </div>
  );
}

function Controls({
  agentId,
  agents,
  l10n,
  onAgentChange,
  onPresetChange,
  presetId,
  presets,
}: {
  agentId: string;
  agents: AgentProfile[];
  l10n: Localize;
  onAgentChange: (agentId: string) => void;
  onPresetChange: (presetId: string) => void;
  presetId: string;
  presets: PromptPreset[];
}) {
  return (
    <div className="acpchat-controls">
      <label className="acpchat-control">
        <span className="acpchat-control-label">
          {l10n("acpchat-control-agent-label", "Agent")}
        </span>
        <select
          className="acpchat-select"
          disabled={!agents.length}
          onChange={(event) => onAgentChange(event.currentTarget.value)}
          value={agents.length ? agentId : ""}
        >
          {agents.length ? (
            agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))
          ) : (
            <option value="">
              {l10n("acpchat-no-agents-option", "No agents configured")}
            </option>
          )}
        </select>
      </label>
      <label className="acpchat-control">
        <span className="acpchat-control-label">
          {l10n("acpchat-control-preset-label", "Preset")}
        </span>
        <select
          className="acpchat-select"
          disabled={!presets.length}
          onChange={(event) => onPresetChange(event.currentTarget.value)}
          value={presets.length ? presetId : ""}
        >
          {presets.length ? (
            presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))
          ) : (
            <option value="">
              {l10n("acpchat-no-presets-option", "No presets configured")}
            </option>
          )}
        </select>
      </label>
    </div>
  );
}

function MessageList({
  hasPdf,
  l10n,
  messages,
  renderMarkdown,
}: {
  hasPdf: boolean;
  l10n: Localize;
  messages: ChatMessage[];
  renderMarkdown: (text: string) => string;
}) {
  const showEmpty =
    hasPdf && !messages.some((message) => message.role !== "system");

  return (
    <div className="acpchat-messages">
      {!hasPdf ? (
        <EmptyState kind="missing-pdf" l10n={l10n} />
      ) : (
        <>
          {showEmpty && <EmptyState kind="no-history" l10n={l10n} />}
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              l10n={l10n}
              message={message}
              renderMarkdown={renderMarkdown}
            />
          ))}
        </>
      )}
    </div>
  );
}

function EmptyState({
  kind,
  l10n,
}: {
  kind: "missing-pdf" | "no-history";
  l10n: Localize;
}) {
  return (
    <div className="acpchat-empty">
      <div className="acpchat-empty-title">
        {kind === "missing-pdf"
          ? l10n("acpchat-empty-missing-pdf-title", "Attach a paper to begin")
          : l10n("acpchat-empty-no-history-title", "Ready when you are")}
      </div>
      <div className="acpchat-empty-detail">
        {kind === "missing-pdf"
          ? l10n(
              "acpchat-empty-missing-pdf-detail",
              "The assistant needs a local PDF so it can pass the document to your ACP agent.",
            )
          : l10n(
              "acpchat-empty-no-history-detail",
              "Choose a preset or ask a focused question about this paper.",
            )}
      </div>
    </div>
  );
}

function MessageItem({
  l10n,
  message,
  renderMarkdown,
}: {
  l10n: Localize;
  message: ChatMessage;
  renderMarkdown: (text: string) => string;
}) {
  const text =
    message.text ||
    (message.status === "streaming"
      ? l10n(
          "acpchat-message-streaming-placeholder",
          "Thinking through the paper...",
        )
      : "");
  const canRenderMarkdown =
    message.role === "assistant" || message.role === "tool";

  return (
    <article
      className={`acpchat-message acpchat-message-${message.role}${
        message.status ? ` acpchat-message-status-${message.status}` : ""
      }`}
    >
      <div className="acpchat-message-meta">
        <span className="acpchat-message-role">
          {getRoleLabel(message.role, l10n)}
        </span>
        {formatMessageTime(message.createdAt) && (
          <span>{formatMessageTime(message.createdAt)}</span>
        )}
        {message.status && message.status !== "done" && (
          <span className="acpchat-message-state">
            {getMessageStatusLabel(message.status, l10n)}
          </span>
        )}
      </div>
      {canRenderMarkdown ? (
        <div
          className="acpchat-message-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
        />
      ) : (
        <div className="acpchat-message-body">{text}</div>
      )}
    </article>
  );
}

function Composer({
  disabled,
  input,
  isRunning,
  l10n,
  onCancel,
  onInputChange,
  onSend,
}: {
  disabled: boolean;
  input: string;
  isRunning: boolean;
  l10n: Localize;
  onCancel: () => void;
  onInputChange: (input: string) => void;
  onSend: () => Promise<void>;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!disabled && !isRunning) void onSend();
    }
  };

  return (
    <div className="acpchat-composer">
      <textarea
        className="acpchat-input"
        cols={20}
        disabled={disabled}
        onChange={(event) => onInputChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          disabled
            ? l10n(
                "acpchat-input-disabled-placeholder",
                "Attach or open a local PDF before starting a chat.",
              )
            : l10n(
                "acpchat-input-placeholder",
                "Ask about the argument, method, evidence, or next experiments...",
              )
        }
        wrap="soft"
        value={input}
      />
      <div className="acpchat-composer-footer">
        <div className="acpchat-composer-hint">
          {l10n("acpchat-composer-hint", "Cmd/Ctrl + Enter to send")}
        </div>
        <div className="acpchat-button-row">
          <button
            className="acpchat-send"
            disabled={disabled || isRunning}
            onClick={() => void onSend()}
            type="button"
          >
            {l10n("acpchat-send-button", "Send")}
          </button>
          <button
            className="acpchat-cancel"
            disabled={!isRunning}
            onClick={onCancel}
            type="button"
          >
            {l10n("acpchat-cancel-button", "Stop")}
          </button>
        </div>
      </div>
    </div>
  );
}

function getRoleLabel(role: ChatRole, l10n: Localize): string {
  switch (role) {
    case "user":
      return l10n("acpchat-role-user", "You");
    case "assistant":
      return l10n("acpchat-role-assistant", "Agent");
    case "tool":
      return l10n("acpchat-role-tool", "Tool");
    case "system":
      return l10n("acpchat-role-system", "Context");
  }
}

function getMessageStatusLabel(status: MessageStatus, l10n: Localize): string {
  switch (status) {
    case "streaming":
      return l10n("acpchat-message-status-streaming", "Writing");
    case "error":
      return l10n("acpchat-message-status-error", "Error");
    case "cancelled":
      return l10n("acpchat-message-status-cancelled", "Cancelled");
    case "done":
      return l10n("acpchat-message-status-done", "Done");
  }
}

function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPdfMeta(pdf: PdfContext): string {
  return [pdf.fileName, pdf.year, formatFileSize(pdf.fileSize)]
    .filter((part) => !!part)
    .join(" - ");
}

function formatFileSize(size: number | null): string {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
