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

export interface StoreDocument {
  version: 1;
  records: SessionRecord[];
}

export type MessageStatus = NonNullable<ChatMessage["status"]>;
export type StatusKind = "busy" | "success" | "error" | "muted";
