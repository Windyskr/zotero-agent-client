import { extractJsonMessagesFromBuffer } from "./acpJsonStream";
import type { AcpProcess, AcpProcessLaunchPlan } from "./acpProcessLauncher";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface JsonRpcOutgoingMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

const MAX_STDERR_SNIPPET_LENGTH = 4_000;

export class AcpStdioTransport {
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private notificationListeners = new Map<
    string,
    Set<(params: unknown) => void>
  >();
  private closeListeners = new Set<(error: Error) => void>();
  private recentStderr = "";
  private closed = false;

  constructor(
    private process: AcpProcess,
    private launchPlan: AcpProcessLaunchPlan,
  ) {
    void this.readStdout();
    void this.readStderr();
    void this.watchExit();
  }

  onNotification(
    method: string,
    listener: (params: unknown) => void,
  ): () => void {
    const listeners = this.notificationListeners.get(method) ?? new Set();
    listeners.add(listener);
    this.notificationListeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.notificationListeners.delete(method);
    };
  }

  onClose(listener: (error: Error) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  request<Result>(
    method: string,
    params: unknown,
    timeoutMs = 30000,
  ): Promise<Result> {
    const id = this.nextId++;
    return new Promise<Result>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as Result),
        reject,
        timeout,
      });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.process.stdin.close();
      this.process.kill();
    } catch {
      // The subprocess may already be gone while Zotero is unloading.
    }
    this.notificationListeners.clear();
    this.closeListeners.clear();
    this.recentStderr = "";
    this.rejectPending(new Error("ACP process was closed"));
  }

  private write(message: JsonRpcOutgoingMessage): void {
    if (this.closed) throw new Error("ACP process is not running");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private async readStdout(): Promise<void> {
    let buffer = "";
    let chunk = "";
    try {
      while (!this.closed && (chunk = await this.process.stdout.readString())) {
        buffer += chunk;
        const { ignoredPrefixes, messages, rest } =
          extractJsonMessagesFromBuffer(buffer);
        buffer = rest;
        for (const ignored of ignoredPrefixes) {
          debug(`[acpchat] ignoring non-JSON stdout: ${ignored}`);
        }
        for (const raw of messages) {
          try {
            this.handleMessage(JSON.parse(raw));
          } catch (error) {
            debug(`[acpchat] dropped unparsable ACP message: ${String(error)}`);
          }
        }
        if (buffer.length > 1_048_576) {
          debug(
            "[acpchat] stdout buffer exceeded 1MB while waiting for complete JSON message; trimming.",
          );
          buffer = "";
        }
      }
    } catch (error) {
      if (!this.closed) {
        debug(`[acpchat] failed while reading ACP stdout: ${String(error)}`);
        this.rejectPending(toError(error));
      }
    }
  }

  private async readStderr(): Promise<void> {
    if (typeof this.process.stderr?.readString !== "function") return;
    let chunk = "";
    try {
      while (!this.closed && (chunk = await this.process.stderr.readString())) {
        const message = chunk.trim();
        if (message) {
          this.recentStderr = appendRecentStderr(this.recentStderr, message);
          debug(
            `[acpchat] ${this.launchPlan.diagnosticCommand} stderr: ${message.slice(0, 2000)}`,
          );
        }
      }
    } catch (error) {
      debug(`[acpchat] failed while reading ACP stderr: ${String(error)}`);
    }
  }

  private async watchExit(): Promise<void> {
    let result: { exitCode: number };
    try {
      result = await this.process.wait();
    } catch (error) {
      if (!this.closed) {
        this.closeUnexpectedly(toError(error));
      }
      return;
    }
    if (this.closed) return;
    const error = formatAcpExitError({
      exitCode: result.exitCode,
      recentStderr: this.recentStderr,
      resolvedCommand: this.launchPlan.diagnosticCommand,
    });
    this.closeUnexpectedly(error);
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message)) return;
    if (
      typeof message.id === "number" &&
      (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))
    ) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        const errorMessage = isRecord(message.error)
          ? message.error.message
          : "";
        pending.reject(
          new Error(
            typeof errorMessage === "string" && errorMessage
              ? errorMessage
              : "ACP request failed",
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (typeof message.method === "string") {
      this.notifyListeners(message.method, message.params);
      if (typeof message.id === "number") {
        this.write({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: "Unsupported client method" },
        });
      }
    }
  }

  private notifyListeners(method: string, params: unknown): void {
    const listeners = this.notificationListeners.get(method);
    if (!listeners) return;
    for (const listener of Array.from(listeners)) {
      try {
        listener(params);
      } catch (error) {
        logListenerError(error);
      }
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private closeUnexpectedly(error: Error): void {
    this.closed = true;
    this.notificationListeners.clear();
    this.recentStderr = "";
    this.rejectPending(error);
    for (const listener of Array.from(this.closeListeners)) {
      try {
        listener(error);
      } catch (listenerError) {
        logListenerError(listenerError);
      }
    }
    this.closeListeners.clear();
  }
}

export function appendRecentStderr(current: string, chunk: string): string {
  const next = current ? `${current}\n${chunk}` : chunk;
  return next.length <= MAX_STDERR_SNIPPET_LENGTH
    ? next
    : next.slice(-MAX_STDERR_SNIPPET_LENGTH);
}

export function formatAcpExitError(options: {
  exitCode: number;
  recentStderr?: string;
  resolvedCommand?: string;
}): Error {
  const { exitCode, recentStderr = "", resolvedCommand = "" } = options;
  const details: string[] = [];
  const stderr = recentStderr.trim();
  if (exitCode === 0) {
    details.push("ACP process exited before completing pending requests");
  } else {
    details.push(`ACP exited with ${exitCode}`);
  }
  if (stderr) {
    details.push(`stderr: ${stderr}`);
  } else {
    details.push("The process exited before responding to initialize.");
  }
  if (shouldAddWindows126Hint(exitCode, resolvedCommand, stderr)) {
    details.push(
      "This looks like an npx or Windows command-wrapper failure. Verify the configured agent command works in a normal terminal, and restart Zotero after changing PATH or installing Node.js/npm.",
    );
  }
  return new Error(details.join(" "));
}

export function shouldAddWindows126Hint(
  exitCode: number,
  resolvedCommand: string,
  stderr: string,
): boolean {
  if (exitCode !== 126) return false;
  const command = resolvedCommand.trim().toLowerCase();
  const output = stderr.trim().toLowerCase();
  return (
    command.endsWith("npx") ||
    command.endsWith("npx.cmd") ||
    command.endsWith("npx.exe") ||
    command.endsWith("npx.bat") ||
    output.includes("not recognized") ||
    output.includes("permission denied") ||
    output.includes("is not recognized as an internal or external command") ||
    output.includes("cannot execute")
  );
}

function logListenerError(error: unknown): void {
  try {
    if (
      typeof Zotero !== "undefined" &&
      typeof Zotero.logError === "function"
    ) {
      Zotero.logError(error as Error);
    }
  } catch {
    // Listener isolation should work in tests and during Zotero shutdown.
  }
}

function debug(message: string): void {
  try {
    if (typeof Zotero !== "undefined" && typeof Zotero.debug === "function") {
      Zotero.debug(message);
    }
  } catch {
    // Tests run outside Zotero.
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
