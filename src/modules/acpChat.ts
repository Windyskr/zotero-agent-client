import { config } from "../../package.json";
import MarkdownIt from "markdown-it";

type ChatRole = "user" | "assistant" | "tool" | "system";

interface AgentProfile {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface PromptPreset {
  id: string;
  name: string;
  prompt: string;
}

interface Settings {
  agentProfiles: AgentProfile[];
  defaultAgent: string;
  promptPresets: PromptPreset[];
  defaultPresetId: string;
  sessionStorePath: string;
  defaultTemplate: string;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  status?: "streaming" | "done" | "error" | "cancelled";
}

interface SessionRecord {
  key: string;
  agentId: string;
  sessionId?: string;
  pdfItemID: number;
  pdfPathHash: string;
  messages: ChatMessage[];
  updatedAt: string;
}

interface PdfContext {
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

const PANE_ID = "acpchat-reader";
const PREF_PREFIX = config.prefsPrefix;

const clientPool = new Map<string, AcpClient>();
const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: false,
});
let toolbarHandler: ((event: any) => void) | null = null;

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
  for (const win of Zotero.getMainWindows()) {
    win.document.getElementById("acpchat-style")?.remove();
  }
}

function injectStyles(): void {
  for (const win of Zotero.getMainWindows()) {
    const doc = win.document;
    if (doc.getElementById("acpchat-style")) continue;
    const style = doc.createElement("style");
    style.id = "acpchat-style";
    style.textContent = `
      .acpchat-panel { display: flex; flex-direction: column; gap: 8px; min-height: 360px; padding: 8px; }
      .acpchat-toolbar { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .acpchat-status { color: var(--fill-secondary, #5f6368); font-size: 12px; grid-column: 1 / -1; min-height: 18px; }
      .acpchat-messages { border: 1px solid var(--material-border-quinary, #d0d4da); border-radius: 6px; display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 190px; overflow: auto; padding: 8px; }
      .acpchat-message { border-radius: 6px; line-height: 1.45; overflow-wrap: anywhere; padding: 6px 8px; }
      .acpchat-message-user { background: #edf4ff; }
      .acpchat-message-assistant { background: #f4f6f7; }
      .acpchat-message-tool, .acpchat-message-system { color: var(--fill-secondary, #5f6368); font-size: 12px; }
      .acpchat-message p { margin: 0 0 0.55em; }
      .acpchat-message p:last-child { margin-bottom: 0; }
      .acpchat-message ul, .acpchat-message ol { margin: 0.35em 0 0.55em 1.4em; padding: 0; }
      .acpchat-message li { margin: 0.15em 0; }
      .acpchat-message pre { background: rgba(0, 0, 0, 0.06); border-radius: 5px; margin: 0.5em 0; max-width: 100%; overflow: auto; padding: 7px; }
      .acpchat-message code { background: rgba(0, 0, 0, 0.06); border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; padding: 0 3px; }
      .acpchat-message pre code { background: transparent; padding: 0; }
      .acpchat-message blockquote { border-left: 3px solid var(--material-border-quinary, #d0d4da); color: var(--fill-secondary, #5f6368); margin: 0.5em 0; padding-left: 8px; }
      .acpchat-message table { border-collapse: collapse; display: block; margin: 0.5em 0; max-width: 100%; overflow: auto; }
      .acpchat-message th, .acpchat-message td { border: 1px solid var(--material-border-quinary, #d0d4da); padding: 3px 6px; }
      .acpchat-input { min-height: 72px; resize: vertical; }
      .acpchat-button-row { display: flex; gap: 6px; }
      .acpchat-send { flex: 1; }
      .acpchat-error { color: #b3261e; }
      .acpchat-toolbar-button { align-items: center; display: inline-flex; justify-content: center; min-width: 28px; min-height: 28px; }
    `;
    doc.documentElement?.append(style);
  }
}

function registerReaderToolbarEntry(): void {
  if (toolbarHandler) return;
  toolbarHandler = (event: any) => {
    const { doc, reader, append } = event;
    const button = doc.createElement("button");
    button.className = "toolbar-button acpchat-toolbar-button";
    button.type = "button";
    button.title = "Agent Client";
    button.textContent = "AI";
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
  const itemDetails = doc.querySelector('item-details[tabType="reader"]') as any;
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
  const section = body.closest("item-pane-custom-section") as HTMLElement | null;
  const itemDetails = body.closest("item-details") as any;
  const paneID = section?.dataset?.pane;
  if (!paneID || typeof itemDetails?.changePaneOrder !== "function") return;
  void itemDetails.changePaneOrder(paneID, 0, { render: false });
}

function renderPanel(body: HTMLElement, item: any): void {
  body.textContent = "";
  const doc = body.ownerDocument!;
  const panel = doc.createElement("div");
  panel.className = "acpchat-panel";
  panel.textContent = "Loading...";
  body.append(panel);
  void renderPanelAsync(panel, item).catch((error) => {
    panel.textContent = "";
    const message = doc.createElement("div");
    message.className = "acpchat-error";
    message.textContent = toMessage(error);
    panel.append(message);
  });
}

async function renderPanelAsync(panel: HTMLElement, item: any): Promise<void> {
  const doc = panel.ownerDocument!;
  const settings = getSettings();
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

  let record = pdf ? await getOrCreateRecord(store, pdf, agentSelect.value) : null;
  if (record) renderMessages(messages, record.messages);

  const applyPreset = () => {
    const preset = settings.promptPresets.find((candidate) => candidate.id === presetSelect.value);
    input.value = renderTemplate(settings.defaultTemplate, {
      title: pdf?.title ?? "",
      year: pdf?.year ?? "",
      prompt: renderTemplate(preset?.prompt ?? "", {
        title: pdf?.title ?? "",
        year: pdf?.year ?? "",
        prompt: "",
      }),
    });
  };
  presetSelect.addEventListener("change", applyPreset);
  applyPreset();

  let activeSessionId: string | null = null;
  sendButton.disabled = !pdf;

  sendButton.addEventListener("click", async () => {
    if (!pdf || !record) return;
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
    const userMessage = makeMessage("user", text, "done");
    const assistantMessage = makeMessage("assistant", "", "streaming");
    record = {
      ...record,
      agentId: profile.id,
      messages: [...record.messages, userMessage, assistantMessage],
      updatedAt: new Date().toISOString(),
    };
    renderMessages(messages, record.messages);
    await store.upsert(record);

    const client = getClient(profile);
    const removeUpdate = client.onUpdate((update) => {
      if (!record || !activeSessionId || update.sessionId !== activeSessionId) return;
      record = applyAcpUpdate(record, assistantMessage.id, update.update);
      renderMessages(messages, record.messages);
      void store.upsert(record);
    });

    try {
      setStatus(status, `Starting ${profile.name}...`);
      activeSessionId = await client.loadOrCreateSession(record.sessionId, pdf.cwd);
      record = { ...record, sessionId: activeSessionId, updatedAt: new Date().toISOString() };
      await store.upsert(record);
      const response = await client.sendPrompt(activeSessionId, makePromptContent(text, pdf));
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
      removeUpdate();
      sendButton.disabled = false;
      cancelButton.disabled = true;
    }
  });

  cancelButton.addEventListener("click", () => {
    const profile = settings.agentProfiles.find((candidate) => candidate.id === agentSelect.value);
    if (profile && activeSessionId) {
      getClient(profile).cancel(activeSessionId);
      setStatus(status, "Cancelling...");
    }
  });
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
  const title = String(sourceItem?.getField?.("title", false, true) || pdfItem.attachmentFilename || "Untitled PDF");
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
    const attachments = Zotero.Items.get(item.getAttachments(false)) as unknown as any[];
    return attachments.find((candidate: any) => isPdf(candidate)) ?? null;
  }
  return null;
}

function isPdf(item: any): boolean {
  return item.isPDFAttachment?.() || item.attachmentContentType === "application/pdf";
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
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "zotero-agent-client", title: "Zotero Agent Client", version: "0.1.0" },
    });
    return this.initializeResult;
  }

  async loadOrCreateSession(recordedSessionId: string | undefined, cwd: string): Promise<string> {
    const init = await this.connect();
    if (recordedSessionId && init.agentCapabilities?.loadSession) {
      await this.request("session/load", { sessionId: recordedSessionId, cwd, mcpServers: [] }, 120000);
      return recordedSessionId;
    }
    const result = await this.request("session/new", { cwd, mcpServers: [] });
    if (!result.sessionId) throw new Error("ACP agent did not return a sessionId");
    return result.sessionId;
  }

  sendPrompt(sessionId: string, prompt: any[]): Promise<any> {
    return this.request("session/prompt", { sessionId, prompt }, 10 * 60 * 1000);
  }

  cancel(sessionId: string): void {
    this.write({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
  }

  close(): void {
    try {
      this.process?.stdin?.close();
      this.process?.kill?.();
    } catch {}
    this.process = null;
  }

  private request(method: string, params: any, timeoutMs = 30000): Promise<any> {
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
      for (const pending of this.pending.values()) pending.reject(new Error(`ACP exited with ${result.exitCode}`));
      this.pending.clear();
    }
  }

  private handleMessage(message: any): void {
    if (typeof message.id === "number" && (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message || "ACP request failed")) : pending.resolve(message.result);
      return;
    }
    if (message.method === "session/update") {
      for (const listener of this.updateListeners) listener(message.params);
      return;
    }
    if (typeof message.id === "number") {
      this.write({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Unsupported client method" } });
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
    store.records = store.records.filter((candidate) => candidate.key !== record.key);
    store.records.push(record);
    await this.write(store);
  }

  private async path(): Promise<string> {
    return this.configuredPath.trim() || PathUtils.join((Zotero as any).Profile.dir, "agentclient", "sessions.json");
  }

  private async read(): Promise<StoreDocument> {
    try {
      return JSON.parse(await IOUtils.readUTF8(await this.path())) as StoreDocument;
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

async function getOrCreateRecord(store: FileSessionStore, pdf: PdfContext, agentId: string): Promise<SessionRecord> {
  const key = `${pdf.libraryID}:${pdf.sourceItemID}:${pdf.itemID}`;
  return (await store.get(key)) ?? {
    key,
    agentId,
    pdfItemID: pdf.itemID,
    pdfPathHash: simpleHash(pdf.filePath),
    messages: [makeMessage("system", `Attached PDF: ${pdf.fileName}`, "done")],
    updatedAt: new Date().toISOString(),
  };
}

function applyAcpUpdate(record: SessionRecord, id: string, update: any): SessionRecord {
  if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
    return {
      ...record,
      messages: record.messages.map((message) => message.id === id ? { ...message, text: message.text + update.content.text } : message),
      updatedAt: new Date().toISOString(),
    };
  }
  if (update.sessionUpdate === "tool_call") {
    return {
      ...record,
      messages: [...record.messages, makeMessage("tool", `${update.title ?? "Tool call"} (${update.status ?? "pending"})`, "done")],
      updatedAt: new Date().toISOString(),
    };
  }
  return record;
}

function markMessage(record: SessionRecord, id: string, status: NonNullable<ChatMessage["status"]>, fallback = ""): SessionRecord {
  return {
    ...record,
    messages: record.messages.map((message) => message.id === id ? { ...message, status, text: message.text || fallback } : message),
    updatedAt: new Date().toISOString(),
  };
}

function renderMessages(container: HTMLElement, messages: ChatMessage[]): void {
  container.textContent = "";
  const doc = container.ownerDocument!;
  for (const message of messages) {
    const node = doc.createElement("div");
    node.className = `acpchat-message acpchat-message-${message.role}`;
    const text = message.text || (message.status === "streaming" ? "..." : "");
    if (message.role === "assistant" || message.role === "tool") {
      node.innerHTML = markdown.render(text);
      hardenRenderedLinks(node);
    } else {
      node.textContent = text;
    }
    container.append(node);
  }
  container.scrollTop = container.scrollHeight;
}

function hardenRenderedLinks(container: HTMLElement): void {
  for (const link of Array.from(container.querySelectorAll("a")) as HTMLAnchorElement[]) {
    link.setAttribute("rel", "noreferrer");
    link.setAttribute("target", "_blank");
  }
}

function setStatus(status: HTMLElement, text: string, isError = false): void {
  status.textContent = text;
  status.classList.toggle("acpchat-error", isError);
}

function makeMessage(role: ChatRole, text: string, status: NonNullable<ChatMessage["status"]>): ChatMessage {
  return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, role, text, status, createdAt: new Date().toISOString() };
}

function renderTemplate(template: string, vars: { title: string; year: string; prompt: string }): string {
  return template.replace(/\{\{\s*(title|year|prompt)\s*\}\}/g, (_match, key: "title" | "year" | "prompt") => vars[key] ?? "");
}

function pathToFileUri(path: string): string {
  return `file://${path.replace(/\\/g, "/").split("/").map((part) => encodeURIComponent(part)).join("/")}`;
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
  } catch {}

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
