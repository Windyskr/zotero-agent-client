import type { KeyboardEvent } from "react";
import type {
  AgentProfile,
  AttachmentContext,
  ChatMessage,
  PdfContext,
  SessionConfigOption,
  TopicSummary,
} from "./acpChatTypes";
import {
  attachmentTypeLabel,
  compactSelectStyle,
  formatMessageTime,
  getMessageStatusLabel,
  getRoleLabel,
  pickConfigOption,
} from "./acpChatViewFormatting";
import type { AttachmentPickSource, ChatStatus, Localize } from "./acpChatView";
import type { ChatTurn } from "./acpChatViewModel";
import {
  formatElapsedDuration,
  getTurnElapsedSeconds,
  groupMessagesIntoTurns,
  isAttachedPdfSystemMessage,
  isMetaRole,
} from "./acpChatViewModel";
import { getZoteroReact } from "./zoteroReact";

const React = getZoteroReact();
const { useEffect, useRef, useState } = React;

export function LoadingCard({ l10n }: { l10n: Localize }) {
  return (
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
  );
}

export function TopAgentBar({
  agentId,
  agents,
  disabled,
  disableNewTopic,
  isHistoryOpen,
  l10n,
  onAgentChange,
  onNewTopic,
  status,
  onToggleHistory,
}: {
  agentId: string;
  agents: AgentProfile[];
  disabled: boolean;
  disableNewTopic: boolean;
  isHistoryOpen: boolean;
  l10n: Localize;
  onAgentChange: (agentId: string) => void;
  onNewTopic: () => void;
  status: ChatStatus;
  onToggleHistory: () => void;
}) {
  const statusTitle = status.text || l10n("acpchat-status-ready", "Ready");
  return (
    <header className="acpchat-topbar">
      <div className="acpchat-topbar-main">
        <div className="acpchat-agent-status">
          <select
            aria-label={l10n("acpchat-control-agent-label", "Agent")}
            className="acpchat-select acpchat-agent-select"
            disabled={disabled || !agents.length}
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
          <span
            aria-label={statusTitle}
            className={`acpchat-status-dot is-${status.kind}`}
            role="status"
            title={statusTitle}
          />
        </div>
        <button
          aria-label={l10n("acpchat-history-button", "History")}
          aria-expanded={isHistoryOpen}
          className={`acpchat-topbar-action${
            isHistoryOpen ? " is-active" : ""
          }`}
          disabled={disabled}
          onClick={onToggleHistory}
          type="button"
        >
          {l10n("acpchat-history-button", "History")}
        </button>
        <button
          aria-label={l10n("acpchat-new-topic-button", "New topic")}
          className="acpchat-topbar-plus"
          disabled={disableNewTopic}
          onClick={onNewTopic}
          title={l10n("acpchat-new-topic-button", "New topic")}
          type="button"
        >
          +
        </button>
      </div>
    </header>
  );
}

export function TopicList({
  activeTopicKey,
  disabled,
  l10n,
  onSelect,
  topics,
}: {
  activeTopicKey?: string;
  disabled: boolean;
  l10n: Localize;
  onSelect: (topicKey: string) => void;
  topics: TopicSummary[];
}) {
  return (
    <section
      aria-label={l10n("acpchat-topic-list-label", "History")}
      className="acpchat-topic-list"
    >
      {topics.length ? (
        <div className="acpchat-topic-list-items">
          {topics.map((topic) => (
            <button
              aria-label={
                topic.title ||
                l10n("acpchat-topic-untitled", "Untitled conversation")
              }
              key={topic.key}
              className={`acpchat-topic-item${
                topic.key === activeTopicKey ? " is-active" : ""
              }`}
              disabled={disabled}
              onClick={() => onSelect(topic.key)}
              type="button"
            >
              <span className="acpchat-topic-title">
                {topic.title ||
                  l10n("acpchat-topic-untitled", "Untitled conversation")}
              </span>
              <span className="acpchat-topic-time">
                {formatMessageTime(topic.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="acpchat-topic-empty">
          {l10n("acpchat-topic-empty", "No conversations yet")}
        </div>
      )}
    </section>
  );
}

export function MessageList({
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
  const [nowMs, setNowMs] = useState(Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);
  const hasStreamingMessage = messages.some(
    (message) => message.status === "streaming",
  );
  useEffect(() => {
    if (!hasStreamingMessage) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasStreamingMessage]);
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const win = node.ownerDocument?.defaultView;
    if (win?.requestAnimationFrame) {
      const frame = win.requestAnimationFrame(() => {
        node.scrollTop = node.scrollHeight;
      });
      return () => win.cancelAnimationFrame(frame);
    }
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const visibleMessages = messages.filter(
    (message) => !isAttachedPdfSystemMessage(message),
  );
  const turns = groupMessagesIntoTurns(visibleMessages);
  const showEmpty = hasPdf && turns.length === 0;

  return (
    <div className="acpchat-messages" ref={listRef}>
      {!hasPdf ? (
        <EmptyState kind="missing-pdf" l10n={l10n} />
      ) : (
        <>
          {showEmpty && <EmptyState kind="no-history" l10n={l10n} />}
          {turns.map((turn) => (
            <section className="acpchat-turn" key={turn.id}>
              {turn.userMessage && (
                <MessageItem
                  l10n={l10n}
                  message={turn.userMessage}
                  renderMarkdown={renderMarkdown}
                />
              )}
              <TurnToolStack l10n={l10n} nowMs={nowMs} turn={turn} />
              {turn.responseMessages
                .filter((message) => !isMetaRole(message.role))
                .map((message) => (
                  <MessageItem
                    key={message.id}
                    l10n={l10n}
                    message={message}
                    renderMarkdown={renderMarkdown}
                  />
                ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function TurnToolStack({
  l10n,
  nowMs,
  turn,
}: {
  l10n: Localize;
  nowMs: number;
  turn: ChatTurn;
}) {
  const toolMessages = turn.responseMessages.filter((message) =>
    isMetaRole(message.role),
  );
  const isActive = turn.responseMessages.some(
    (message) => message.status === "streaming",
  );
  const elapsedSeconds = getTurnElapsedSeconds(turn, nowMs, isActive);
  const durationLabel = formatElapsedDuration(elapsedSeconds);
  if (!turn.userMessage && !turn.responseMessages.length) return null;
  if (!toolMessages.length) {
    return (
      <div className="acpchat-turn-tools acpchat-turn-tools-summary-only">
        <div className="acpchat-turn-tools-summary-row">
          <span className="acpchat-turn-tools-state">
            {l10n("acpchat-tools-processed", "已处理 {duration}", {
              duration: durationLabel,
            })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <details className="acpchat-turn-tools" open={isActive}>
      <summary className="acpchat-turn-tools-summary">
        <span className="acpchat-turn-tools-state">
          {l10n("acpchat-tools-processed", "已处理 {duration}", {
            duration: durationLabel,
          })}
        </span>
        {!isActive && <span className="acpchat-turn-tools-chevron">{">"}</span>}
      </summary>
      <div className="acpchat-turn-tools-list">
        {toolMessages.map((message) => (
          <ToolMessageItem key={message.id} l10n={l10n} message={message} />
        ))}
      </div>
    </details>
  );
}

function ToolMessageItem({
  l10n,
  message,
}: {
  l10n: Localize;
  message: ChatMessage;
}) {
  return (
    <div className="acpchat-tool-item">
      <div className="acpchat-tool-item-meta">
        <span>{getRoleLabel(message.role, l10n)}</span>
        {formatMessageTime(message.createdAt) && (
          <span>{formatMessageTime(message.createdAt)}</span>
        )}
        {message.status && message.status !== "done" && (
          <span className="acpchat-message-state">
            {getMessageStatusLabel(message.status, l10n)}
          </span>
        )}
      </div>
      <div className="acpchat-tool-item-body">{message.text}</div>
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
          : l10n("acpchat-empty-no-history-title", "Ask about this paper")}
      </div>
      <div className="acpchat-empty-detail">
        {kind === "missing-pdf"
          ? l10n(
              "acpchat-empty-missing-pdf-detail",
              "The assistant needs a local PDF so it can pass the document to your ACP agent.",
            )
          : l10n(
              "acpchat-empty-no-history-detail",
              "Ask a focused question about this paper to begin.",
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
  const canRenderMarkdown = message.role === "assistant";

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

export function Composer({
  attachment,
  disabled,
  hasPdf,
  includePdf,
  input,
  isAttachMenuOpen,
  isRunning,
  l10n,
  configOptions,
  onInputChange,
  onConfigOptionChange,
  onCloseAttachMenu,
  onPause,
  onPickAttachment,
  onToggleAttachMenu,
  onSend,
  onRemoveAttachment,
  onSetAttachmentIncluded,
  pdf,
}: {
  attachment: AttachmentContext | null;
  disabled: boolean;
  hasPdf: boolean;
  includePdf: boolean;
  input: string;
  isAttachMenuOpen: boolean;
  isRunning: boolean;
  configOptions: SessionConfigOption[];
  l10n: Localize;
  onInputChange: (input: string) => void;
  onConfigOptionChange: (configId: string, value: string) => void;
  onCloseAttachMenu: () => void;
  onPause: () => void;
  onPickAttachment: (source: AttachmentPickSource) => Promise<void>;
  onToggleAttachMenu: () => void;
  onSend: () => Promise<void>;
  onRemoveAttachment: () => void;
  onSetAttachmentIncluded: (included: boolean) => void;
  pdf: PdfContext | null;
}) {
  const modelOption = pickConfigOption(configOptions, "model");
  const thoughtOption = pickConfigOption(configOptions, "thought_level");

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" && isAttachMenuOpen) {
      event.preventDefault();
      onCloseAttachMenu();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (isRunning) {
        onPause();
      } else if (!disabled) {
        void onSend();
      }
    }
  };

  return (
    <div className="acpchat-composer">
      {includePdf && pdf && (
        <div className="acpchat-attachments">
          <div className="acpchat-attachment-pill">
            <span className="acpchat-attachment-type">PDF</span>
            <span className="acpchat-attachment-name">{pdf.fileName}</span>
            <button
              aria-label={l10n(
                "acpchat-attachment-remove-title",
                "Remove attachment",
              )}
              className="acpchat-attachment-remove"
              disabled={isRunning}
              onClick={() => onSetAttachmentIncluded(false)}
              title={l10n(
                "acpchat-attachment-remove-title",
                "Remove attachment",
              )}
              type="button"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {attachment && (
        <div className="acpchat-attachments">
          <div className="acpchat-attachment-pill">
            <span className="acpchat-attachment-type">
              {attachmentTypeLabel(attachment.fileName)}
            </span>
            <span className="acpchat-attachment-name">
              {attachment.fileName}
            </span>
            <button
              aria-label={l10n(
                "acpchat-attachment-remove-title",
                "Remove attachment",
              )}
              className="acpchat-attachment-remove"
              disabled={isRunning}
              onClick={onRemoveAttachment}
              title={l10n(
                "acpchat-attachment-remove-title",
                "Remove attachment",
              )}
              type="button"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="acpchat-composer-card">
        <textarea
          aria-label={l10n("acpchat-input-label", "Prompt")}
          className="acpchat-input"
          cols={20}
          disabled={disabled}
          onChange={(event) => onInputChange(event.currentTarget.value)}
          onFocus={() => {
            if (isAttachMenuOpen) onCloseAttachMenu();
          }}
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
          value={input}
          wrap="soft"
        />

        <div className="acpchat-actions-row">
          <div className="acpchat-attach-wrap">
            <button
              aria-label={l10n(
                "acpchat-attach-button-title",
                "Choose attachment",
              )}
              aria-expanded={isAttachMenuOpen}
              aria-haspopup="menu"
              className={`acpchat-attach-button${
                includePdf || !!attachment ? " is-active" : ""
              }`}
              disabled={!hasPdf || isRunning}
              onClick={onToggleAttachMenu}
              title={l10n("acpchat-attach-button-title", "Choose attachment")}
              type="button"
            >
              +
            </button>
            {isAttachMenuOpen && (
              <div
                aria-label={l10n(
                  "acpchat-attach-button-title",
                  "Choose attachment",
                )}
                className="acpchat-attach-menu"
                role="menu"
              >
                <button
                  aria-label={l10n("acpchat-attach-local-title", "Local file")}
                  className="acpchat-attach-option"
                  disabled={isRunning}
                  onClick={() => void onPickAttachment("local")}
                  role="menuitem"
                  type="button"
                >
                  <span className="acpchat-attach-option-check">+</span>
                  <span className="acpchat-attach-option-content">
                    <span className="acpchat-attach-option-title">
                      {l10n("acpchat-attach-local-title", "Local file")}
                    </span>
                    <span className="acpchat-attach-option-label">
                      {l10n(
                        "acpchat-attach-local-detail",
                        "Choose a file from this computer",
                      )}
                    </span>
                  </span>
                </button>
                <button
                  aria-label={l10n(
                    "acpchat-attach-library-title",
                    "Library file",
                  )}
                  className="acpchat-attach-option"
                  disabled={isRunning}
                  onClick={() => void onPickAttachment("library")}
                  role="menuitem"
                  type="button"
                >
                  <span className="acpchat-attach-option-check">Z</span>
                  <span className="acpchat-attach-option-content">
                    <span className="acpchat-attach-option-title">
                      {l10n("acpchat-attach-library-title", "Library file")}
                    </span>
                    <span className="acpchat-attach-option-label">
                      {l10n(
                        "acpchat-attach-library-detail",
                        "Choose a file from another Zotero item",
                      )}
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="acpchat-config-selects">
            {modelOption && (
              <select
                aria-label={modelOption.name}
                className="acpchat-select acpchat-select-compact"
                disabled={disabled || isRunning}
                onChange={(event) =>
                  onConfigOptionChange(
                    modelOption.id,
                    event.currentTarget.value,
                  )
                }
                style={compactSelectStyle(modelOption)}
                title={modelOption.description || modelOption.name}
                value={modelOption.currentValue}
              >
                {modelOption.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.name}
                  </option>
                ))}
              </select>
            )}
            {thoughtOption && (
              <select
                aria-label={thoughtOption.name}
                className="acpchat-select acpchat-select-compact"
                disabled={disabled || isRunning}
                onChange={(event) =>
                  onConfigOptionChange(
                    thoughtOption.id,
                    event.currentTarget.value,
                  )
                }
                style={compactSelectStyle(thoughtOption)}
                title={thoughtOption.description || thoughtOption.name}
                value={thoughtOption.currentValue}
              >
                {thoughtOption.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            aria-label={
              isRunning
                ? l10n("acpchat-pause-button", "Pause")
                : l10n("acpchat-send-button", "Send")
            }
            className={`acpchat-send${isRunning ? " is-pausing" : ""}`}
            disabled={disabled && !isRunning}
            onClick={() => (isRunning ? onPause() : void onSend())}
            type="button"
          >
            {isRunning
              ? l10n("acpchat-pause-button", "Pause")
              : l10n("acpchat-send-button", "Send")}
          </button>
        </div>
      </div>
    </div>
  );
}
