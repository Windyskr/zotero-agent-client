import type {
  AttachmentContext,
  PdfContext,
  SessionConfigOption,
  SessionRecord,
  Settings,
  StatusKind,
  TopicSummary,
} from "./acpChatTypes";
import { toMessage } from "./acpChatUtils";
import { promptTextOrNull } from "./acpPromptContent";
import {
  Composer,
  LoadingCard,
  MessageList,
  TopAgentBar,
  TopicList,
} from "./acpChatViewComponents";
import { createZoteroReactRoot, getZoteroReact } from "./zoteroReact";

const React = getZoteroReact();
const { useEffect, useMemo, useRef, useState } = React;

export interface ChatStatus {
  kind: StatusKind;
  text: string;
}

export type AttachmentPickSource = "local" | "library";

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

export interface PrepareAgentSessionRequest {
  agentId: string;
  record: SessionRecord;
}

export interface PreparedAgentSession {
  sessionId: string;
  configOptions: SessionConfigOption[];
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
  onPrepareAgentSession: (
    request: PrepareAgentSessionRequest,
  ) => Promise<PreparedAgentSession>;
  onSetConfigOption: (
    request: SetConfigOptionRequest,
  ) => Promise<SessionConfigOption[]>;
  onNewTopic: (request: NewTopicRequest) => Promise<void>;
  onPickAttachment: (
    source: AttachmentPickSource,
  ) => Promise<AttachmentContext | null>;
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
  onPrepareAgentSession,
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
  const [status, setStatus] = useState(initialStatus);
  const [configOptions, setConfigOptions] = useState(initialConfigOptions);
  const [topics, setTopics] = useState(initialTopics);
  const [includePdf, setIncludePdf] = useState(!!pdf);
  const [attachment, setAttachment] = useState<AttachmentContext | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const recordRef = useRef<SessionRecord | null>(initialRecord);
  const lastHydrationKeyRef = useRef("");

  const selectedAgent = useMemo(
    () => settings.agentProfiles.find((profile) => profile.id === agentId),
    [agentId, settings.agentProfiles],
  );

  const messages = record?.messages ?? [];

  useEffect(() => {
    recordRef.current = record;
  }, [record]);

  useEffect(() => {
    if (!pdf || !record || !selectedAgent) return;
    const hydrationKey = `${agentId}:${record.key}`;
    if (lastHydrationKeyRef.current === hydrationKey) return;
    lastHydrationKeyRef.current = hydrationKey;

    let cancelled = false;
    setStatus({
      kind: "busy",
      text: l10n("acpchat-status-starting", "Starting {agent}...", {
        agent: selectedAgent.name,
      }),
    });

    void onPrepareAgentSession({ agentId, record })
      .then((session) => {
        if (cancelled) return;
        setConfigOptions(session.configOptions);
        const current = recordRef.current;
        if (current?.key === record.key && current.agentId === agentId) {
          setRecord({
            ...current,
            sessionId: session.sessionId,
            updatedAt: new Date().toISOString(),
          });
        }
        setStatus({
          kind: "success",
          text: l10n("acpchat-status-connected", "Connected"),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus({
          kind: "error",
          text: toMessage(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, l10n, onPrepareAgentSession, pdf, record?.key, selectedAgent]);

  const handleAgentChange = async (nextAgentId: string) => {
    if (isRunning) return;
    setAgentId(nextAgentId);
    setAttachment(null);
    setIsAttachMenuOpen(false);
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
        text: toMessage(error),
      });
    } finally {
      setIsHydrating(false);
      setIsAgentSwitching(false);
    }
  };

  const handleTopicSelect = async (topicKey: string) => {
    if (isRunning || isHydrating) return;
    setAttachment(null);
    setIsAttachMenuOpen(false);
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
        text: toMessage(error),
      });
    } finally {
      setIsHydrating(false);
    }
  };

  const handleNewTopic = async () => {
    if (!pdf || isRunning || isHydrating) return;
    setIsAttachMenuOpen(false);
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
    } catch (error) {
      setStatus({
        kind: "error",
        text: toMessage(error),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handlePickAttachment = async (source: AttachmentPickSource) => {
    if (isRunning || isHydrating) return;
    setIsAttachMenuOpen(false);
    try {
      const selected = await onPickAttachment(source);
      if (selected) {
        setAttachment(selected);
      }
    } catch (error) {
      setStatus({ kind: "error", text: toMessage(error) });
    }
  };

  const handleSend = async () => {
    if (!pdf || !record || isRunning || isHydrating) return;
    setIsAttachMenuOpen(false);
    if (!selectedAgent) {
      setStatus({
        kind: "error",
        text: l10n("acpchat-error-invalid-agent", "Select a valid ACP agent"),
      });
      return;
    }

    const text = promptTextOrNull(input);
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
    } catch (error) {
      setStatus({
        kind: "error",
        text: toMessage(error),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handlePause = () => {
    if (!isRunning) return;
    setIsAttachMenuOpen(false);
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
      setStatus({ kind: "error", text: toMessage(error) });
    }
  };

  const panelClassName = ["acpchat-panel", pdf ? "" : "acpchat-panel-no-pdf"]
    .filter((className) => !!className)
    .join(" ");

  return (
    <section className={panelClassName}>
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
        status={status}
        onToggleHistory={() => {
          setIsAttachMenuOpen(false);
          setIsHistoryOpen((current) => !current);
        }}
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
            isAttachMenuOpen={isAttachMenuOpen}
            isRunning={isRunning || isHydrating}
            l10n={l10n}
            configOptions={configOptions}
            onInputChange={setInput}
            onConfigOptionChange={handleConfigOptionChange}
            onPause={handlePause}
            onPickAttachment={handlePickAttachment}
            onCloseAttachMenu={() => setIsAttachMenuOpen(false)}
            onToggleAttachMenu={() =>
              setIsAttachMenuOpen((current) => !current)
            }
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
