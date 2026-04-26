export type JsonObject = Record<string, unknown>;

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

export interface PluginSettings {
  agentProfiles: AgentProfile[];
  defaultAgent: string;
  promptPresets: PromptPreset[];
  defaultPresetId: string;
  sessionStorePath: string;
  defaultTemplate: string;
}

export type ChatRole = "user" | "assistant" | "tool" | "system";

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

export interface SessionStoreDocument {
  version: 1;
  records: SessionRecord[];
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

export interface TextContentBlock {
  type: "text";
  text: string;
}

export interface ResourceLinkBlock {
  type: "resource_link";
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
}

export type ContentBlock = TextContentBlock | ResourceLinkBlock;

export interface AcpUpdate {
  sessionId: string;
  update: JsonObject;
}

export interface AcpInitializeResponse {
  protocolVersion: number;
  agentCapabilities?: {
    loadSession?: boolean;
    sessionCapabilities?: JsonObject;
    promptCapabilities?: JsonObject;
    [key: string]: unknown;
  };
  agentInfo?: JsonObject;
  authMethods?: unknown[];
}

export interface AcpPromptResponse {
  stopReason?: string;
}
