import type { KeyboardEvent } from "react";
import type {
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
const { useMemo, useState } = React;

export interface ChatStatus {
  kind: StatusKind;
  text: string;
}

export interface SendPromptRequest {
  agentId: string;
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
  const [record, setRecord] = useState(initialRecord);
  const [status, setStatus] = useState(initialStatus);
  const [configOptions, setConfigOptions] = useState(initialConfigOptions);
  const [topics, setTopics] = useState(initialTopics);
  const [includePdf, setIncludePdf] = useState(!!pdf);

  const selectedAgent = useMemo(
    () => settings.agentProfiles.find((profile) => profile.id === agentId),
    [agentId, settings.agentProfiles],
  );

  const messages = record?.messages ?? [];

  const handleAgentChange = async (nextAgentId: string) => {
    if (isRunning) return;
    setAgentId(nextAgentId);
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
    }
  };

  const handleTopicSelect = async (topicKey: string) => {
    if (isRunning || isHydrating) return;
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
    } finally {
      setIsRunning(false);
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
    try {
      await onSend({
        agentId,
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
        l10n={l10n}
        onAgentChange={(nextAgentId) => {
          void handleAgentChange(nextAgentId);
        }}
        status={status}
      />
      <TopicList
        activeTopicKey={record?.key}
        disabled={isRunning || isHydrating}
        l10n={l10n}
        onSelect={(topicKey) => {
          void handleTopicSelect(topicKey);
        }}
        topics={topics}
      />
      <MessageList
        hasPdf={!!pdf}
        l10n={l10n}
        messages={messages}
        renderMarkdown={renderMarkdown}
      />
      <Composer
        disabled={!pdf}
        hasPdf={!!pdf}
        includePdf={includePdf}
        input={input}
        isRunning={isRunning || isHydrating}
        l10n={l10n}
        configOptions={configOptions}
        onInputChange={setInput}
        onConfigOptionChange={handleConfigOptionChange}
        onNewTopic={handleNewTopic}
        onPause={handlePause}
        onSend={handleSend}
        onToggleAttachment={() => setIncludePdf((current) => !current)}
        pdf={pdf}
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

function TopAgentBar({
  agentId,
  agents,
  disabled,
  l10n,
  onAgentChange,
  status,
}: {
  agentId: string;
  agents: AgentProfile[];
  disabled: boolean;
  l10n: Localize;
  onAgentChange: (agentId: string) => void;
  status: ChatStatus;
}) {
  return (
    <header className="acpchat-topbar">
      <label className="acpchat-topbar-label">
        {l10n("acpchat-control-agent-label", "Agent")}
      </label>
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
        <div className={`acpchat-status-chip is-${status.kind}`}>
          {status.text}
        </div>
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
  const visibleMessages = messages.filter(
    (message) => !isAttachedPdfSystemMessage(message),
  );
  const showEmpty = hasPdf && visibleMessages.length === 0;

  return (
    <div className="acpchat-messages">
      {!hasPdf ? (
        <EmptyState kind="missing-pdf" l10n={l10n} />
      ) : (
        <>
          {showEmpty && <EmptyState kind="no-history" l10n={l10n} />}
          {visibleMessages.map((message) => (
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
  hasPdf,
  includePdf,
  input,
  isRunning,
  l10n,
  configOptions,
  onInputChange,
  onConfigOptionChange,
  onNewTopic,
  onPause,
  onSend,
  onToggleAttachment,
  pdf,
}: {
  disabled: boolean;
  hasPdf: boolean;
  includePdf: boolean;
  input: string;
  isRunning: boolean;
  configOptions: SessionConfigOption[];
  l10n: Localize;
  onInputChange: (input: string) => void;
  onConfigOptionChange: (configId: string, value: string) => void;
  onNewTopic: () => void;
  onPause: () => void;
  onSend: () => Promise<void>;
  onToggleAttachment: () => void;
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
        <button
          className={`acpchat-attach-button${includePdf ? " is-active" : ""}`}
          disabled={!hasPdf || isRunning}
          onClick={onToggleAttachment}
          title={l10n("acpchat-attach-button-title", "Add attachment")}
          type="button"
        >
          +
        </button>

        <div className="acpchat-actions-spacer"></div>

        <button
          className="acpchat-inline-action"
          disabled={disabled || isRunning}
          onClick={onNewTopic}
          type="button"
        >
          {l10n("acpchat-new-topic-button", "New topic")}
        </button>
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
