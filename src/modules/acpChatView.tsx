import type { KeyboardEvent } from "react";
import type {
  AttachmentContext,
  AgentProfile,
  ChatMessage,
  ChatRole,
  MessageStatus,
  PdfContext,
  SessionConfigOption,
  SessionRecord,
  Settings,
  StatusKind,
  TopicSummary,
} from "./acpChat";
import { createZoteroReactRoot, getZoteroReact } from "./zoteroReact";

const React = getZoteroReact();
const { useEffect, useMemo, useRef, useState } = React;

export interface ChatStatus {
  kind: StatusKind;
  text: string;
}

export interface SendPromptRequest {
  agentId: string;
  attachment: AttachmentContext | null;
  includePdf: boolean;
  record: SessionRecord;
  setConfigOptions: (options: SessionConfigOption[]) => void;
  setTopics: (topics: TopicSummary[]) => void;
  setRecord: (record: SessionRecord) => void;
  setStatus: (status: ChatStatus) => void;
  text: string;
}

export interface SetConfigOptionRequest {
  agentId: string;
  configId: string;
  sessionId: string;
  value: string;
}

export interface NewTopicRequest {
  agentId: string;
  setConfigOptions: (options: SessionConfigOption[]) => void;
  setTopics: (topics: TopicSummary[]) => void;
  setRecord: (record: SessionRecord) => void;
  setStatus: (status: ChatStatus) => void;
}

export interface LoadAgentStateRequest {
  agentId: string;
  preferredTopicKey?: string;
  setConfigOptions: (options: SessionConfigOption[]) => void;
  setTopics: (topics: TopicSummary[]) => void;
  setRecord: (record: SessionRecord) => void;
  setStatus: (status: ChatStatus) => void;
}

export type Localize = (
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
) => string;

export interface AcpChatPanelProps {
  initialConfigOptions: SessionConfigOption[];
  initialRecord: SessionRecord | null;
  initialStatus: ChatStatus;
  initialTopics: TopicSummary[];
  l10n: Localize;
  onCancel: (agentId: string) => boolean;
  onLoadAgentState: (request: LoadAgentStateRequest) => Promise<void>;
  onSetConfigOption: (
    request: SetConfigOptionRequest,
  ) => Promise<SessionConfigOption[]>;
  onNewTopic: (request: NewTopicRequest) => Promise<void>;
  onPickAttachment: () => Promise<AttachmentContext | null>;
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
  initialConfigOptions,
  initialRecord,
  initialStatus,
  initialTopics,
  l10n,
  onCancel,
  onLoadAgentState,
  onSetConfigOption,
  onNewTopic,
  onPickAttachment,
  onSend,
  pdf,
  renderMarkdown,
  settings,
}: AcpChatPanelProps) {
  const [agentId, setAgentId] = useState(
    initialRecord?.agentId || settings.defaultAgent,
  );
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const [isAgentSwitching, setIsAgentSwitching] = useState(false);
  const [record, setRecord] = useState(initialRecord);
  const [, setStatus] = useState(initialStatus);
  const [configOptions, setConfigOptions] = useState(initialConfigOptions);
  const [topics, setTopics] = useState(initialTopics);
  const [includePdf, setIncludePdf] = useState(!!pdf);
  const [attachment, setAttachment] = useState<AttachmentContext | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const selectedAgent = useMemo(
    () => settings.agentProfiles.find((profile) => profile.id === agentId),
    [agentId, settings.agentProfiles],
  );

  const messages = record?.messages ?? [];

  const handleAgentChange = async (nextAgentId: string) => {
    if (isRunning) return;
    setAgentId(nextAgentId);
    setAttachment(null);
    setIsHistoryOpen(false);
    setIsAgentSwitching(true);
    setIsHydrating(true);
    try {
      await onLoadAgentState({
        agentId: nextAgentId,
        setConfigOptions,
        setTopics,
        setRecord,
        setStatus,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: String(error),
      });
    } finally {
      setIsHydrating(false);
      setIsAgentSwitching(false);
    }
  };

  const handleTopicSelect = async (topicKey: string) => {
    if (isRunning || isHydrating) return;
    setAttachment(null);
    setIsHydrating(true);
    try {
      await onLoadAgentState({
        agentId,
        preferredTopicKey: topicKey,
        setConfigOptions,
        setTopics,
        setRecord,
        setStatus,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: String(error),
      });
    } finally {
      setIsHydrating(false);
    }
  };

  const handleNewTopic = async () => {
    if (!pdf || isRunning || isHydrating) return;
    setIsRunning(true);
    try {
      await onNewTopic({
        agentId,
        setConfigOptions,
        setTopics,
        setRecord,
        setStatus,
      });
      setInput("");
      setIncludePdf(true);
      setAttachment(null);
    } finally {
      setIsRunning(false);
    }
  };

  const handlePickAttachment = async () => {
    if (isRunning || isHydrating) return;
    try {
      const selected = await onPickAttachment();
      if (selected) {
        setAttachment(selected);
      }
    } catch (error) {
      setStatus({ kind: "error", text: String(error) });
    }
  };

  const handleSend = async () => {
    if (!pdf || !record || isRunning || isHydrating) return;
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
    setInput("");
    try {
      await onSend({
        agentId,
        attachment,
        includePdf: !!pdf && includePdf,
        record,
        setConfigOptions,
        setTopics,
        setRecord,
        setStatus,
        text,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handlePause = () => {
    if (!isRunning) return;
    if (onCancel(agentId)) {
      setStatus({
        kind: "busy",
        text: l10n("acpchat-status-cancelling", "Cancelling..."),
      });
    }
  };

  const handleConfigOptionChange = async (configId: string, value: string) => {
    if (!record?.sessionId || isRunning) return;
    try {
      const nextOptions = await onSetConfigOption({
        agentId,
        configId,
        sessionId: record.sessionId,
        value,
      });
      setConfigOptions(nextOptions);
    } catch (error) {
      setStatus({ kind: "error", text: String(error) });
    }
  };

  return (
    <section className={`acpchat-panel${pdf ? "" : " acpchat-panel-no-pdf"}`}>
      <TopAgentBar
        agentId={agentId}
        agents={settings.agentProfiles}
        disabled={isRunning || isHydrating}
        disableNewTopic={!pdf || isRunning || isHydrating}
        isHistoryOpen={isHistoryOpen}
        l10n={l10n}
        onAgentChange={(nextAgentId) => {
          void handleAgentChange(nextAgentId);
        }}
        onNewTopic={() => {
          void handleNewTopic();
        }}
        onToggleHistory={() => setIsHistoryOpen((current) => !current)}
      />
      {isHistoryOpen && (
        <button
          aria-label={l10n("acpchat-history-button", "History")}
          className="acpchat-history-backdrop"
          onClick={() => setIsHistoryOpen(false)}
          type="button"
        />
      )}
      <div
        className={`acpchat-history-drawer${isHistoryOpen ? " is-open" : ""}`}
      >
        <TopicList
          activeTopicKey={record?.key}
          disabled={isRunning || isHydrating}
          l10n={l10n}
          onSelect={(topicKey) => {
            setIsHistoryOpen(false);
            void handleTopicSelect(topicKey);
          }}
          topics={topics}
        />
      </div>
      {isAgentSwitching ? (
        <LoadingCard l10n={l10n} />
      ) : (
        <>
          <MessageList
            hasPdf={!!pdf}
            l10n={l10n}
            messages={messages}
            renderMarkdown={renderMarkdown}
          />
          <Composer
            attachment={attachment}
            disabled={!pdf}
            hasPdf={!!pdf}
            includePdf={includePdf}
            input={input}
            isRunning={isRunning || isHydrating}
            l10n={l10n}
            configOptions={configOptions}
            onInputChange={setInput}
            onConfigOptionChange={handleConfigOptionChange}
            onPause={handlePause}
            onPickAttachment={handlePickAttachment}
            onSend={handleSend}
            onRemoveAttachment={() => setAttachment(null)}
            onSetAttachmentIncluded={(included) => setIncludePdf(included)}
            pdf={pdf}
          />
        </>
      )}
    </section>
  );
}

export function AcpChatLoading({ l10n }: { l10n: Localize }) {
  return (
    <section className="acpchat-panel">
      <LoadingCard l10n={l10n} />
    </section>
  );
}

function LoadingCard({ l10n }: { l10n: Localize }) {
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

function TopAgentBar({
  agentId,
  agents,
  disabled,
  disableNewTopic,
  isHistoryOpen,
  l10n,
  onAgentChange,
  onNewTopic,
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
  onToggleHistory: () => void;
}) {
  return (
    <header className="acpchat-topbar">
      <div className="acpchat-topbar-main">
        <select
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
        <button
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

function TopicList({
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
  if (!topics.length) return null;
  return (
    <section className="acpchat-topic-list">
      <div className="acpchat-topic-list-label">
        {l10n("acpchat-topic-list-label", "History")}
      </div>
      <div className="acpchat-topic-list-items">
        {topics.map((topic) => (
          <button
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
    </section>
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
  const [nowMs, setNowMs] = useState(Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
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

interface ChatTurn {
  id: string;
  userMessage: ChatMessage | null;
  responseMessages: ChatMessage[];
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
  if (!toolMessages.length) return null;

  const isActive = toolMessages.some(
    (message) => message.status === "streaming",
  );
  const elapsedSeconds = getTurnElapsedSeconds(turn, nowMs, isActive);
  const durationLabel = formatElapsedDuration(elapsedSeconds);

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

function groupMessagesIntoTurns(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let currentTurn: ChatTurn | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      currentTurn = {
        id: `turn-${message.id}`,
        userMessage: message,
        responseMessages: [],
      };
      turns.push(currentTurn);
      continue;
    }

    if (!currentTurn) {
      currentTurn = {
        id: `turn-${message.id}`,
        userMessage: null,
        responseMessages: [message],
      };
      turns.push(currentTurn);
      continue;
    }

    currentTurn.responseMessages.push(message);
  }

  return turns;
}

function getTurnElapsedSeconds(
  turn: ChatTurn,
  nowMs: number,
  isActive: boolean,
): number {
  const start = toTimestamp(
    turn.userMessage?.createdAt ??
      turn.responseMessages[0]?.createdAt ??
      new Date(nowMs).toISOString(),
  );
  const end = isActive
    ? nowMs
    : Math.max(
        ...turn.responseMessages.map((message) =>
          toTimestamp(message.createdAt),
        ),
        start,
      );
  return Math.max(1, Math.floor((end - start) / 1000));
}

function toTimestamp(iso: string): number {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? Date.now() : value;
}

function formatElapsedDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${remainder}s`;
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

function isMetaRole(role: ChatRole): boolean {
  return role === "tool" || role === "system";
}

function isAttachedPdfSystemMessage(message: ChatMessage): boolean {
  if (message.role !== "system") return false;
  return /(?:Attached PDF|已附加 PDF)[:：]/.test(message.text);
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

function Composer({
  attachment,
  disabled,
  hasPdf,
  includePdf,
  input,
  isRunning,
  l10n,
  configOptions,
  onInputChange,
  onConfigOptionChange,
  onPause,
  onPickAttachment,
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
  isRunning: boolean;
  configOptions: SessionConfigOption[];
  l10n: Localize;
  onInputChange: (input: string) => void;
  onConfigOptionChange: (configId: string, value: string) => void;
  onPause: () => void;
  onPickAttachment: () => Promise<void>;
  onSend: () => Promise<void>;
  onRemoveAttachment: () => void;
  onSetAttachmentIncluded: (included: boolean) => void;
  pdf: PdfContext | null;
}) {
  const modelOption = pickConfigOption(configOptions, "model");
  const thoughtOption = pickConfigOption(configOptions, "thought_level");

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
        value={input}
        wrap="soft"
      />

      <div className="acpchat-actions-row">
        <div className="acpchat-attach-wrap">
          <button
            className={`acpchat-attach-button${
              includePdf || !!attachment ? " is-active" : ""
            }`}
            disabled={!hasPdf || isRunning}
            onClick={() => void onPickAttachment()}
            title={l10n("acpchat-attach-button-title", "Choose attachment")}
            type="button"
          >
            +
          </button>
        </div>

        <div className="acpchat-actions-spacer"></div>

        {modelOption && (
          <select
            className="acpchat-select acpchat-select-compact"
            disabled={disabled || isRunning}
            onChange={(event) =>
              onConfigOptionChange(modelOption.id, event.currentTarget.value)
            }
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
            className="acpchat-select acpchat-select-compact"
            disabled={disabled || isRunning}
            onChange={(event) =>
              onConfigOptionChange(thoughtOption.id, event.currentTarget.value)
            }
            value={thoughtOption.currentValue}
          >
            {thoughtOption.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.name}
              </option>
            ))}
          </select>
        )}

        <button
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

function attachmentTypeLabel(fileName: string): string {
  const ext = fileName.trim().split(".").pop()?.toUpperCase();
  if (!ext || ext.length > 6) return "FILE";
  return ext;
}

function pickConfigOption(
  options: SessionConfigOption[],
  targetCategory: string,
): SessionConfigOption | null {
  const byCategory = options.find(
    (option) => option.category === targetCategory && option.type === "select",
  );
  if (byCategory) return byCategory;
  return (
    options.find(
      (option) =>
        option.type === "select" &&
        option.id.toLowerCase() === targetCategory.toLowerCase(),
    ) ?? null
  );
}
