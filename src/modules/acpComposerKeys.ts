import type { SendKeyMode } from "./acpChatTypes";

export type ComposerKeyAction = "none" | "send" | "newline";

export interface ComposerKeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export function getComposerKeyAction(
  event: ComposerKeyInput,
  sendKeyMode: SendKeyMode,
): ComposerKeyAction {
  if (event.key !== "Enter") return "none";
  const hasCommandModifier = !!event.ctrlKey || !!event.metaKey;
  if (sendKeyMode === "enter") {
    if (event.shiftKey || hasCommandModifier) return "newline";
    return "send";
  }
  return hasCommandModifier ? "send" : "none";
}
