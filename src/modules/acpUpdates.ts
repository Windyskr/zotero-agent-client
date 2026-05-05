import type { ChatMessage, MessageStatus, SessionRecord } from "./acpChatTypes";

export function shouldShowStopReason(stopReason: unknown): boolean {
  if (typeof stopReason !== "string") return false;
  const normalized = stopReason.trim().toLowerCase();
  return !!normalized && normalized !== "end_turn";
}

export function applyAcpUpdate(
  record: SessionRecord,
  assistantMessageId: string,
  update: unknown,
  updatedAt = new Date().toISOString(),
): SessionRecord {
  if (!isRecord(update)) return record;

  if (update.sessionUpdate === "agent_message_chunk") {
    const content = isRecord(update.content) ? update.content : null;
    if (content?.type !== "text" || typeof content.text !== "string") {
      return record;
    }
    if (!record.messages.some((message) => message.id === assistantMessageId)) {
      return record;
    }
    return {
      ...record,
      messages: record.messages.map((message) =>
        message.id === assistantMessageId
          ? { ...message, text: message.text + content.text }
          : message,
      ),
      updatedAt,
    };
  }

  if (
    update.sessionUpdate === "tool_call" ||
    update.sessionUpdate === "tool_call_update"
  ) {
    return upsertToolCallMessage(record, update, updatedAt);
  }

  return record;
}

export function markMessage(
  record: SessionRecord,
  id: string,
  status: MessageStatus,
  fallback = "",
  updatedAt = new Date().toISOString(),
): SessionRecord {
  return {
    ...record,
    messages: record.messages.map((message) =>
      message.id === id
        ? { ...message, status, text: message.text || fallback }
        : message,
    ),
    updatedAt,
  };
}

export function mapToolStatusToMessageStatus(status: unknown): MessageStatus {
  const normalized =
    typeof status === "string" ? status.trim().toLowerCase() : "";
  if (normalized === "in_progress" || normalized === "pending") {
    return "streaming";
  }
  if (normalized === "failed" || normalized === "error") {
    return "error";
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }
  return "done";
}

function upsertToolCallMessage(
  record: SessionRecord,
  update: Record<string, unknown>,
  updatedAt: string,
): SessionRecord {
  const toolCallId =
    typeof update.toolCallId === "string" ? update.toolCallId.trim() : "";
  if (!toolCallId) return record;

  const messageId = `tool-${toolCallId}`;
  const existing = record.messages.find((message) => message.id === messageId);
  const title = resolveToolCallTitle(update, existing?.text);
  const statusLabel = formatToolStatusLabel(update.status);
  const text = statusLabel ? `${title} (${statusLabel})` : title;
  const status = mapToolStatusToMessageStatus(update.status);

  if (existing) {
    return {
      ...record,
      messages: record.messages.map((message) =>
        message.id === messageId ? { ...message, text, status } : message,
      ),
      updatedAt,
    };
  }

  return {
    ...record,
    messages: [
      ...record.messages,
      {
        id: messageId,
        role: "tool",
        text,
        status,
        createdAt: updatedAt,
      },
    ],
    updatedAt,
  };
}

function resolveToolCallTitle(
  update: Record<string, unknown>,
  fallbackText = "",
): string {
  if (typeof update.title === "string" && update.title.trim()) {
    return update.title.trim();
  }
  const rawInput = isRecord(update.rawInput) ? update.rawInput : null;
  if (Array.isArray(rawInput?.command) && rawInput.command.length) {
    return String(rawInput.command.join(" ")).trim();
  }
  const rawOutput = isRecord(update.rawOutput) ? update.rawOutput : null;
  if (Array.isArray(rawOutput?.command) && rawOutput.command.length) {
    return String(rawOutput.command.join(" ")).trim();
  }
  const cleanedFallback = fallbackText.replace(/\s+\([^)]*\)\s*$/, "").trim();
  return cleanedFallback || "Tool call";
}

function formatToolStatusLabel(status: unknown): string {
  if (typeof status !== "string" || !status.trim()) return "";
  const normalized = status.trim();
  if (normalized === "in_progress") return "in progress";
  return normalized.replace(/_/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
