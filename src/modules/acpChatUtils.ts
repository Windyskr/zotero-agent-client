import type {
  ChatMessage,
  ChatRole,
  MessageStatus,
  SessionConfigOption,
  SessionConfigOptionValue,
} from "./acpChatTypes";

export const PDF_CONTEXT_TIMEOUT_MS = 8000;
export const STORE_IO_TIMEOUT_MS = 4000;
export const ACP_SPAWN_TIMEOUT_MS = 45000;
export const ACP_REQUEST_TIMEOUT_MS = 30000;
export const ACP_SESSION_TIMEOUT_MS = 60000;
export const ACP_PROMPT_TIMEOUT_MS = 10 * 60 * 1000;

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  if (timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function pathToFileUri(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const windowsDrive = normalized.match(/^([A-Za-z]:)(\/.*)?$/);
  if (windowsDrive) {
    return `file:///${windowsDrive[1]}${encodePathSegments(windowsDrive[2] ?? "")}`;
  }
  if (normalized.startsWith("//")) {
    const [host = "", ...rest] = normalized.slice(2).split("/");
    return `file://${encodeURIComponent(host)}/${rest.map(encodeURIComponent).join("/")}`;
  }
  return `file://${encodePathSegments(normalized)}`;
}

function encodePathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function inferMimeType(path: string): string | undefined {
  const ext = basename(path).split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  const known: Record<string, string> = {
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return known[ext];
}

export function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "/";
}

export async function statFile(path: string): Promise<{ size: number } | null> {
  try {
    const stat = await withTimeout(
      IOUtils.stat(path),
      STORE_IO_TIMEOUT_MS,
      `Timed out reading file metadata: ${path}`,
    );
    return typeof stat.size === "number" ? { size: stat.size } : null;
  } catch {
    return null;
  }
}

export function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeConfigOptions(raw: unknown): SessionConfigOption[] {
  if (!Array.isArray(raw)) return [];
  const normalized: SessionConfigOption[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const option = item;
    if (option.type !== "select") continue;
    const id = typeof option.id === "string" ? option.id : "";
    const name = typeof option.name === "string" ? option.name : "";
    const currentValue =
      typeof option.currentValue === "string" ? option.currentValue : "";
    const values = Array.isArray(option.options)
      ? option.options
          .map((entry) => {
            if (!isRecord(entry)) return null;
            const value = entry;
            if (
              typeof value.value !== "string" ||
              typeof value.name !== "string"
            ) {
              return null;
            }
            return {
              value: value.value,
              name: value.name,
              ...(typeof value.description === "string"
                ? { description: value.description }
                : {}),
            };
          })
          .filter(isSessionConfigOptionValue)
      : [];
    if (!id || !name || !currentValue || !values.length) continue;
    normalized.push({
      id,
      name,
      ...(typeof option.description === "string"
        ? { description: option.description }
        : {}),
      ...(typeof option.category === "string"
        ? { category: option.category }
        : {}),
      type: "select",
      currentValue,
      options: values,
    });
  }
  return normalized;
}

function isSessionConfigOptionValue(
  value: SessionConfigOptionValue | null,
): value is SessionConfigOptionValue {
  return !!value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function makeMessage(
  role: ChatRole,
  text: string,
  status: MessageStatus,
): ChatMessage {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    role,
    text,
    status,
    createdAt: new Date().toISOString(),
  };
}

export function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
