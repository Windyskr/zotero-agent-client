import { config } from "../../package.json";
import type {
  AcpChatRoot,
  AttachmentPickSource,
  ChatStatus,
  LoadAgentStateRequest,
  PrepareAgentSessionRequest,
  NewTopicRequest,
  SetConfigOptionRequest,
  SendPromptRequest,
} from "./acpChatView";
import type {
  AgentProfile,
  AttachmentContext,
  PdfContext,
  SessionConfigOption,
  SessionRecord,
  TopicSummary,
} from "./acpChatTypes";
import { pickLibraryAttachment, pickLocalAttachment } from "./acpAttachments";
import { closeAllClients, getClient } from "./acpClient";
import { getSettings } from "./acpChatSettings";
import { getMainWindowString } from "./acpL10n";
import { createMarkdownRenderer } from "./acpMarkdown";
import { ACP_CHAT_STYLE } from "./acpChatStyles";
import {
  movePaneToTop,
  registerReaderToolbarEntry,
  type ReaderToolbarHandler,
  unregisterReaderToolbarEntry,
} from "./acpPaneIntegration";
import { resolvePdfContext } from "./acpPdfContext";
import { renderPlainError, renderPlainLoading } from "./acpPlainRender";
import { makePromptContent } from "./acpPromptContent";
import { makeInitialRecord } from "./acpSessionRecords";
import { listTopicSummaries, loadLocalAgentState } from "./acpSessionState";
import { FileSessionStore } from "./acpSessionStore";
import {
  applyAcpUpdate,
  markMessage,
  shouldShowStopReason,
} from "./acpUpdates";
import {
  PDF_CONTEXT_TIMEOUT_MS,
  makeMessage,
  normalizeConfigOptions,
  renderTemplate,
  toMessage,
  withTimeout,
} from "./acpChatUtils";

const PANE_ID = "acpchat-reader";
const markdown = createMarkdownRenderer();
let isSectionRegistered = false;
let toolbarHandler: ReaderToolbarHandler | null = null;
const panelRoots = new Map<HTMLElement, AcpChatRoot>();
type ItemPaneSectionHookArgs =
  _ZoteroTypes.ItemPaneManagerSection.SectionHookArgs;

export function registerAcpChat(): void {
  injectStyles();
  if (!isSectionRegistered) {
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
      } as _ZoteroTypes.ItemPaneManagerSection.UIOptions & {
        orderable: boolean;
      },
      onItemChange: ({ tabType, setEnabled }: ItemPaneSectionHookArgs) => {
        setEnabled(tabType === "reader");
        return true;
      },
      onRender: ({ body, item }: ItemPaneSectionHookArgs) => {
        movePaneToTop(body);
        renderPanel(body, item);
      },
    });
    isSectionRegistered = true;
  }
  if (!toolbarHandler) {
    toolbarHandler = registerReaderToolbarEntry(PANE_ID, getMainWindowString);
  }
}

export function unregisterAcpChat(): void {
  if (toolbarHandler) {
    unregisterReaderToolbarEntry(toolbarHandler);
    toolbarHandler = null;
  }
  if (isSectionRegistered) {
    Zotero.ItemPaneManager.unregisterSection(PANE_ID);
    isSectionRegistered = false;
  }
  closeAllClients();
  for (const root of panelRoots.values()) {
    root.unmount();
  }
  panelRoots.clear();
  for (const win of Zotero.getMainWindows()) {
    win.document.getElementById("acpchat-style")?.remove();
  }
}

export function loadAcpChatWindow(win: Window): void {
  injectStyle(win);
}

export function unloadAcpChatWindow(win: Window): void {
  for (const [body, root] of Array.from(panelRoots.entries())) {
    if (body.ownerDocument?.defaultView !== win) continue;
    root.unmount();
    panelRoots.delete(body);
  }
  win.document.getElementById("acpchat-style")?.remove();
}

function injectStyles(): void {
  for (const win of Zotero.getMainWindows()) {
    injectStyle(win);
  }
}

function injectStyle(win: Window): void {
  const doc = win.document;
  let style = doc.getElementById("acpchat-style") as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = "acpchat-style";
    doc.documentElement?.append(style);
  }
  style.textContent = ACP_CHAT_STYLE;
}
function renderPanel(body: HTMLElement, item: Zotero.Item): void {
  panelRoots.get(body)?.unmount();
  panelRoots.delete(body);
  body.classList.add("acpchat-host");
  renderPlainLoading(body, getMainWindowString);

  void renderPanelAsync(body, item).catch((error) => {
    panelRoots.get(body)?.unmount();
    panelRoots.delete(body);
    renderPlainError(body, error, getMainWindowString);
  });
}

async function renderPanelAsync(
  body: HTMLElement,
  item: Zotero.Item,
): Promise<void> {
  const view = await import("./acpChatView");
  const root = view.createAcpChatRoot(body);
  panelRoots.set(body, root);
  root.renderLoading(getMainWindowString);

  const settings = getSettings();
  const store = new FileSessionStore(settings.sessionStorePath);
  let pdf: PdfContext | null = null;
  let initialStatusOverride: ChatStatus | null = null;
  try {
    pdf = await withTimeout(
      resolvePdfContext(item, getMainWindowString),
      PDF_CONTEXT_TIMEOUT_MS,
      getMainWindowString(
        "acpchat-error-pdf-context-timeout",
        "Timed out while looking for the local PDF attachment.",
      ),
    );
  } catch (error) {
    Zotero.logError(error as Error);
    initialStatusOverride = { kind: "error", text: toMessage(error) };
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
      initialLoadedState = await loadLocalAgentState(
        store,
        pdf,
        settings.agentProfiles,
        settings.defaultAgent,
        getMainWindowString,
      );
    } catch (error) {
      Zotero.logError(error as Error);
      initialStatusOverride = {
        kind: "error",
        text: getMainWindowString(
          "acpchat-error-store-timeout",
          "Could not load recent chat state; starting with a fresh local topic.",
        ),
      };
    }
  }
  const initialRecord =
    initialLoadedState?.record ??
    (pdf
      ? makeInitialRecord(pdf, settings.defaultAgent, getMainWindowString)
      : null);
  const initialTopics = initialLoadedState?.topics ?? [];
  const initialConfigOptions = initialLoadedState?.configOptions ?? [];
  const initialStatus: ChatStatus =
    initialStatusOverride ??
    (pdf
      ? {
          kind: "muted",
          text: "",
        }
      : {
          kind: "muted",
          text: getMainWindowString("acpchat-status-no-pdf", "No PDF"),
        });
  const sessionLoads = new Map<
    string,
    Promise<{ sessionId: string; configOptions: SessionConfigOption[] }>
  >();

  const loadSessionForRecord = (
    profile: AgentProfile,
    record: SessionRecord,
  ): Promise<{ sessionId: string; configOptions: SessionConfigOption[] }> => {
    if (!pdf) {
      return Promise.reject(new Error("No PDF context available"));
    }
    const key = `${profile.id}:${record.key}`;
    const existing = sessionLoads.get(key);
    if (existing) return existing;
    const promise = getClient(profile)
      .loadOrCreateSession(
        record.agentId === profile.id ? record.sessionId : undefined,
        pdf.cwd,
      )
      .then(async (session) => {
        await persistRecord(store, {
          ...record,
          agentId: profile.id,
          sessionId: session.sessionId,
          updatedAt: new Date().toISOString(),
        });
        return session;
      })
      .finally(() => {
        sessionLoads.delete(key);
      });
    sessionLoads.set(key, promise);
    return promise;
  };

  const onPrepareAgentSession = async ({
    agentId,
    record,
  }: PrepareAgentSessionRequest) => {
    if (!pdf) {
      throw new Error(getMainWindowString("acpchat-status-no-pdf", "No PDF"));
    }
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
    return loadSessionForRecord(profile, record);
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
    await persistRecord(store, nextRecord);
    await refreshTopicSummaries(setTopics, store, pdf, profile.id);

    const client = getClient(profile);
    let pendingStreamingPersist: ReturnType<typeof setTimeout> | null = null;
    const cancelStreamingPersist = () => {
      if (!pendingStreamingPersist) return;
      clearTimeout(pendingStreamingPersist);
      pendingStreamingPersist = null;
    };
    const scheduleStreamingPersist = () => {
      cancelStreamingPersist();
      pendingStreamingPersist = setTimeout(() => {
        pendingStreamingPersist = null;
        void persistRecord(store, nextRecord);
      }, 500);
    };
    const removeUpdate = client.onUpdate((update) => {
      if (!activeSessionId) return;
      const sessionUpdate = getSessionUpdatePayload(update, activeSessionId);
      if (!sessionUpdate) return;
      if (
        isRecord(sessionUpdate) &&
        sessionUpdate.sessionUpdate === "config_option_update" &&
        Array.isArray(sessionUpdate.configOptions)
      ) {
        setConfigOptions(normalizeConfigOptions(sessionUpdate.configOptions));
        return;
      }
      nextRecord = applyAcpUpdate(
        nextRecord,
        assistantMessage.id,
        sessionUpdate,
      );
      setRecord(nextRecord);
      scheduleStreamingPersist();
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
      const session = await loadSessionForRecord(profile, nextRecord);
      setConfigOptions(session.configOptions);
      activeSessionId = session.sessionId;
      nextRecord = {
        ...nextRecord,
        sessionId: activeSessionId,
        updatedAt: new Date().toISOString(),
      };
      await persistRecord(store, nextRecord);
      setRecord(nextRecord);
      await refreshTopicSummaries(setTopics, store, pdf, profile.id);
      setStatus({
        kind: "busy",
        text: getMainWindowString("acpchat-status-running", "Running"),
      });

      const promptText = renderTemplate(settings.defaultTemplate, {
        title: pdf.title,
        year: pdf.year,
        prompt: text,
      });
      const response = await client.sendPrompt(
        activeSessionId,
        makePromptContent(promptText, pdf, includePdf, attachment),
      );
      cancelStreamingPersist();
      const showStopReason = shouldShowStopReason(response.stopReason);
      nextRecord = markMessage(
        nextRecord,
        assistantMessage.id,
        response.stopReason === "cancelled" ? "cancelled" : "done",
      );
      await persistRecord(store, nextRecord);
      setRecord(nextRecord);
      setStatus({
        kind: showStopReason ? "muted" : "success",
        text: showStopReason
          ? getMainWindowString("acpchat-status-stopped", "Stopped: {reason}", {
              reason: response.stopReason,
            })
          : getMainWindowString("acpchat-status-done", "Done"),
      });
    } catch (error) {
      cancelStreamingPersist();
      nextRecord = markMessage(
        nextRecord,
        assistantMessage.id,
        "error",
        toMessage(error),
      );
      await persistRecord(store, nextRecord);
      setRecord(nextRecord);
      await refreshTopicSummaries(setTopics, store, pdf, profile.id);
      setStatus({ kind: "error", text: toMessage(error) });
    } finally {
      cancelStreamingPersist();
      activeSessionId = null;
      removeUpdate();
    }
  };

  const onCancel = (agentId: string) => {
    const profile = settings.agentProfiles.find(
      (candidate) => candidate.id === agentId,
    );
    if (!profile || !activeSessionId) return false;
    try {
      getClient(profile).cancel(activeSessionId);
      return true;
    } catch (error) {
      Zotero.logError(error as Error);
      return false;
    }
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
    const nextRecord = makeInitialRecord(pdf, agentId, getMainWindowString);
    setConfigOptions([]);
    await refreshTopicSummaries(setTopics, store, pdf, agentId);
    setRecord(nextRecord);
    setStatus({
      kind: "success",
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
    const loaded = await loadLocalAgentState(
      store,
      pdf,
      settings.agentProfiles,
      agentId,
      getMainWindowString,
      preferredTopicKey,
    );
    setRecord(loaded.record);
    setTopics(loaded.topics);
    setConfigOptions(loaded.configOptions);
    setStatus({
      kind: "muted",
      text: "",
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

  const onPickAttachment = async (
    source: AttachmentPickSource,
  ): Promise<AttachmentContext | null> => {
    const parentWindow =
      body.ownerDocument?.defaultView ?? Zotero.getMainWindow();
    const initialDirectory = pdf?.cwd;
    if (source === "library") {
      return await pickLibraryAttachment(parentWindow, getMainWindowString);
    }
    return await pickLocalAttachment(
      parentWindow,
      getMainWindowString,
      initialDirectory,
    );
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
    onPrepareAgentSession,
    onSetConfigOption,
    onNewTopic,
    onPickAttachment,
    onSend,
    pdf,
    renderMarkdown: (text: string) => markdown.render(text),
    settings,
  });
}

async function persistRecord(
  store: FileSessionStore,
  record: SessionRecord,
): Promise<void> {
  try {
    await store.upsert(record);
  } catch (error) {
    Zotero.logError(error as Error);
  }
}

async function refreshTopicSummaries(
  setTopics: (topics: TopicSummary[]) => void,
  store: FileSessionStore,
  pdf: PdfContext,
  agentId: string,
): Promise<void> {
  try {
    setTopics(await listTopicSummaries(store, pdf, agentId));
  } catch (error) {
    Zotero.logError(error as Error);
  }
}

function getSessionUpdatePayload(
  update: unknown,
  sessionId: string,
): unknown | null {
  if (!isRecord(update) || update.sessionId !== sessionId) return null;
  return update.update;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
