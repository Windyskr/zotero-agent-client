import { makePromptContent } from "../core/content";
import { renderTemplate } from "../core/templates";
import { makeSessionKey, simpleHash } from "../core/sessionStore";
import type { AcpUpdate, ChatMessage, PdfContext, SessionRecord } from "../core/types";
import { FileSessionStore } from "./fileSessionStore";
import { AcpClientPool } from "./clientPool";
import { resolvePdfContext } from "./pdfResolver";
import { ZoteroPrefs } from "./prefs";

interface RenderProps {
  body: HTMLElement;
  item: any;
}

export class ReaderPanel {
  constructor(
    private readonly prefs: ZoteroPrefs,
    private readonly clientPool: AcpClientPool
  ) {}

  render(props: RenderProps): void {
    props.body.textContent = "";
    const doc = props.body.ownerDocument;
    const panel = doc.createElement("div");
    panel.className = "acpchat-panel";
    panel.textContent = "Loading...";
    props.body.append(panel);

    void this.renderAsync(panel, props.item).catch((error) => {
      panel.textContent = "";
      const message = doc.createElement("div");
      message.className = "acpchat-error";
      message.textContent = error instanceof Error ? error.message : String(error);
      panel.append(message);
    });
  }

  private async renderAsync(panel: HTMLElement, item: any): Promise<void> {
    const doc = panel.ownerDocument;
    const settings = this.prefs.getSettings();
    const store = new FileSessionStore(settings.sessionStorePath);
    const pdf = await resolvePdfContext(item);

    panel.textContent = "";
    const toolbar = doc.createElement("div");
    toolbar.className = "acpchat-toolbar";

    const agentSelect = doc.createElement("select");
    for (const profile of settings.agentProfiles) {
      const option = doc.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      agentSelect.append(option);
    }
    agentSelect.value = settings.defaultAgent;

    const presetSelect = doc.createElement("select");
    for (const preset of settings.promptPresets) {
      const option = doc.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      presetSelect.append(option);
    }
    presetSelect.value = settings.defaultPresetId;

    const status = doc.createElement("div");
    status.className = "acpchat-status";
    status.textContent = pdf ? `${pdf.fileName} attached` : "No local PDF attachment found";

    toolbar.append(agentSelect, presetSelect, status);

    const messages = doc.createElement("div");
    messages.className = "acpchat-messages";

    const input = doc.createElement("textarea");
    input.className = "acpchat-input";
    input.spellcheck = true;

    const buttonRow = doc.createElement("div");
    buttonRow.className = "acpchat-button-row";
    const sendButton = doc.createElement("button");
    sendButton.className = "acpchat-send";
    sendButton.type = "button";
    sendButton.textContent = "Send";
    const cancelButton = doc.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.disabled = true;
    buttonRow.append(sendButton, cancelButton);

    panel.append(toolbar, messages, input, buttonRow);

    let record = pdf ? await this.getOrCreateRecord(store, pdf, agentSelect.value) : null;
    if (record) {
      renderMessages(messages, record.messages);
    }

    const applyPreset = () => {
      const preset = settings.promptPresets.find((candidate) => candidate.id === presetSelect.value);
      const presetPrompt = preset?.prompt ?? "";
      input.value = renderTemplate(settings.defaultTemplate, {
        title: pdf?.title ?? "",
        year: pdf?.year ?? "",
        prompt: renderTemplate(presetPrompt, {
          title: pdf?.title ?? "",
          year: pdf?.year ?? "",
          prompt: ""
        })
      });
    };
    presetSelect.addEventListener("change", applyPreset);
    applyPreset();

    agentSelect.addEventListener("change", async () => {
      if (!pdf) {
        return;
      }
      record = await this.getOrCreateRecord(store, pdf, agentSelect.value);
      renderMessages(messages, record.messages);
    });

    let activeSessionId: string | null = null;
    sendButton.disabled = !pdf;
    sendButton.addEventListener("click", async () => {
      if (!pdf || !record) {
        return;
      }
      const profile = settings.agentProfiles.find((candidate) => candidate.id === agentSelect.value);
      if (!profile) {
        setStatus(status, "Select a valid ACP agent", true);
        return;
      }

      const text = input.value.trim();
      if (!text) {
        setStatus(status, "Prompt is empty", true);
        return;
      }

      sendButton.disabled = true;
      cancelButton.disabled = false;
      setStatus(status, `Starting ${profile.name}...`);

      const userMessage = makeMessage("user", text, "done");
      const assistantMessage = makeMessage("assistant", "", "streaming");
      record = {
        ...record,
        agentId: profile.id,
        messages: [...record.messages, userMessage, assistantMessage],
        updatedAt: new Date().toISOString()
      };
      renderMessages(messages, record.messages);
      await store.upsert(record);

      const client = this.clientPool.get(profile);
      const removeStatus = client.onStatus((message) => setStatus(status, message));
      const removeUpdate = client.onUpdate((update) => {
        if (!activeSessionId || update.sessionId !== activeSessionId || !record) {
          return;
        }
        record = applyAcpUpdate(record, assistantMessage.id, update);
        renderMessages(messages, record.messages);
        void store.upsert(record);
      });

      try {
        const sessionId = await client.loadOrCreateSession(record.sessionId, pdf.cwd);
        activeSessionId = sessionId;
        record = {
          ...record,
          sessionId,
          updatedAt: new Date().toISOString()
        };
        await store.upsert(record);

        setStatus(status, "Waiting for response...");
        const response = await client.sendPrompt(sessionId, makePromptContent(text, pdf));
        record = markMessage(record, assistantMessage.id, response.stopReason === "cancelled" ? "cancelled" : "done");
        await store.upsert(record);
        renderMessages(messages, record.messages);
        setStatus(status, response.stopReason ? `Stopped: ${response.stopReason}` : "Done");
      } catch (error) {
        record = markMessage(record, assistantMessage.id, "error", toMessage(error));
        await store.upsert(record);
        renderMessages(messages, record.messages);
        setStatus(status, toMessage(error), true);
      } finally {
        activeSessionId = null;
        removeStatus();
        removeUpdate();
        sendButton.disabled = false;
        cancelButton.disabled = true;
      }
    });

    cancelButton.addEventListener("click", () => {
      if (!activeSessionId) {
        return;
      }
      const profile = settings.agentProfiles.find((candidate) => candidate.id === agentSelect.value);
      if (profile) {
        this.clientPool.get(profile).cancel(activeSessionId);
        setStatus(status, "Cancelling...");
      }
    });
  }

  private async getOrCreateRecord(store: FileSessionStore, pdf: PdfContext, agentId: string): Promise<SessionRecord> {
    const key = makeSessionKey(pdf.libraryID, pdf.sourceItemID, pdf.itemID);
    const existing = await store.get(key);
    if (existing) {
      return existing;
    }

    return {
      key,
      agentId,
      pdfItemID: pdf.itemID,
      pdfPathHash: simpleHash(pdf.filePath),
      messages: [
        makeMessage("system", `Attached PDF: ${pdf.fileName}`, "done")
      ],
      updatedAt: new Date().toISOString()
    };
  }
}

function applyAcpUpdate(record: SessionRecord, assistantMessageId: string, payload: AcpUpdate): SessionRecord {
  const update = payload.update;
  const sessionUpdate = String(update.sessionUpdate ?? "");

  if (sessionUpdate === "agent_message_chunk" || sessionUpdate === "user_message_chunk") {
    const content = update.content as { type?: string; text?: string } | undefined;
    if (content?.type === "text" && content.text) {
      return appendToMessage(record, assistantMessageId, content.text);
    }
  }

  if (sessionUpdate === "tool_call") {
    const title = typeof update.title === "string" ? update.title : "Tool call";
    const status = typeof update.status === "string" ? update.status : "pending";
    return {
      ...record,
      messages: [...record.messages, makeMessage("tool", `${title} (${status})`, "done")],
      updatedAt: new Date().toISOString()
    };
  }

  if (sessionUpdate === "plan" && Array.isArray(update.entries)) {
    const text = update.entries
      .map((entry: any) => `- ${entry.content ?? ""} [${entry.status ?? "pending"}]`)
      .join("\n");
    if (text) {
      return {
        ...record,
        messages: [...record.messages, makeMessage("tool", text, "done")],
        updatedAt: new Date().toISOString()
      };
    }
  }

  return record;
}

function appendToMessage(record: SessionRecord, id: string, text: string): SessionRecord {
  return {
    ...record,
    messages: record.messages.map((message) => (
      message.id === id ? { ...message, text: message.text + text } : message
    )),
    updatedAt: new Date().toISOString()
  };
}

function markMessage(record: SessionRecord, id: string, status: NonNullable<ChatMessage["status"]>, fallbackText?: string): SessionRecord {
  return {
    ...record,
    messages: record.messages.map((message) => (
      message.id === id
        ? { ...message, status, text: message.text || fallbackText || message.text }
        : message
    )),
    updatedAt: new Date().toISOString()
  };
}

function renderMessages(container: HTMLElement, messages: ChatMessage[]): void {
  const doc = container.ownerDocument;
  container.textContent = "";
  for (const message of messages) {
    const node = doc.createElement("div");
    node.className = `acpchat-message acpchat-message-${message.role}`;
    node.textContent = message.text || (message.status === "streaming" ? "..." : "");
    container.append(node);
  }
  container.scrollTop = container.scrollHeight;
}

function setStatus(status: HTMLElement, text: string, isError = false): void {
  status.textContent = text;
  status.classList.toggle("acpchat-error", isError);
}

function makeMessage(role: ChatMessage["role"], text: string, status: NonNullable<ChatMessage["status"]>): ChatMessage {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    role,
    text,
    status,
    createdAt: new Date().toISOString()
  };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
