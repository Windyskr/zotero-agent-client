import type { ChatMessage, ChatRole } from "./acpChatTypes";

export interface ChatTurn {
  id: string;
  userMessage: ChatMessage | null;
  responseMessages: ChatMessage[];
}

export function groupMessagesIntoTurns(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let currentTurn: ChatTurn | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      currentTurn = {
        id: `turn-${message.id}`,
        userMessage: message,
        responseMessages: [],
      };
      turns.push(currentTurn);
      continue;
    }

    if (!currentTurn) {
      currentTurn = {
        id: `turn-${message.id}`,
        userMessage: null,
        responseMessages: [message],
      };
      turns.push(currentTurn);
      continue;
    }

    currentTurn.responseMessages.push(message);
  }

  return turns;
}

export function getTurnElapsedSeconds(
  turn: ChatTurn,
  nowMs: number,
  isActive: boolean,
): number {
  const start = toTimestamp(
    turn.userMessage?.createdAt ??
      turn.responseMessages[0]?.createdAt ??
      new Date(nowMs).toISOString(),
    nowMs,
  );
  const end = isActive
    ? nowMs
    : Math.max(
        ...turn.responseMessages.map((message) =>
          toTimestamp(message.createdAt, start),
        ),
        start,
      );
  return Math.max(1, Math.floor((end - start) / 1000));
}

export function formatElapsedDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${seconds}s`;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${minutes}m ${remainder}s`;
}

export function isMetaRole(role: ChatRole): boolean {
  return role === "tool" || role === "system";
}

export function isAttachedPdfSystemMessage(message: ChatMessage): boolean {
  if (message.role !== "system") return false;
  return /(?:Attached PDF|已附加 PDF)[:：]/.test(message.text);
}

export function isScrollNearBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  thresholdPx: number,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= thresholdPx;
}

function toTimestamp(iso: string, fallbackMs: number): number {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? fallbackMs : value;
}
