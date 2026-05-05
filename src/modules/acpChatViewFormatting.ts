import type { CSSProperties } from "react";
import type {
  ChatRole,
  MessageStatus,
  SessionConfigOption,
} from "./acpChatTypes";

type Localize = (
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
) => string;

export type CompactSelectStyle = CSSProperties & {
  "--acpchat-select-text-width": string;
};

export function compactSelectStyle(
  option: SessionConfigOption,
): CompactSelectStyle {
  const label =
    option.options.find((candidate) => candidate.value === option.currentValue)
      ?.name ?? option.currentValue;
  const textWidth = Array.from(label).reduce(
    (width, character) => width + (character.charCodeAt(0) > 255 ? 2 : 1),
    0,
  );
  const clampedWidth = Math.min(Math.max(textWidth, 3), 18);
  return { "--acpchat-select-text-width": `${clampedWidth}ch` };
}

export function getRoleLabel(role: ChatRole, l10n: Localize): string {
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

export function getMessageStatusLabel(
  status: MessageStatus,
  l10n: Localize,
): string {
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

export function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function attachmentTypeLabel(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) return "FILE";
  const ext = trimmed.slice(dotIndex + 1).toUpperCase();
  if (!ext || ext.length > 6) return "FILE";
  return ext;
}

export function pickConfigOption(
  options: SessionConfigOption[],
  targetCategory: string,
): SessionConfigOption | null {
  const normalizedTarget = targetCategory.toLowerCase();
  const byCategory = options.find(
    (option) =>
      option.type === "select" &&
      option.category?.toLowerCase() === normalizedTarget,
  );
  if (byCategory) return byCategory;
  return (
    options.find(
      (option) =>
        option.type === "select" &&
        option.id.toLowerCase() === normalizedTarget,
    ) ?? null
  );
}
