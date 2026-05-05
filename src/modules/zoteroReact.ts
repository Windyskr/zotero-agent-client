import { BasicTool } from "zotero-plugin-toolkit";
import type * as ReactTypes from "react";
import type { Root } from "react-dom/client";

type ZoteroWindow = Window & {
  React?: typeof ReactTypes;
  ReactDOM?: ReactDomWithRoot;
  require?: (moduleName: string) => unknown;
};

export type ReactDomWithRoot = {
  createRoot?: (container: Element | DocumentFragment) => Root;
};

const basicTool = new BasicTool();

let cachedReact: typeof ReactTypes | null = null;

export function getZoteroReact(win?: Window): typeof ReactTypes {
  if (cachedReact) return cachedReact;
  const runtimeWindow = getRuntimeWindow(win);
  const react = resolveZoteroWindowModule(runtimeWindow, "react", "React");
  if (!isReactRuntimeModule(react)) {
    throw new Error(
      `Zotero React runtime is unavailable: ${describeLookup(
        runtimeWindow,
        "react",
        "React",
      )}`,
    );
  }
  cachedReact = react;
  return cachedReact;
}

export function createZoteroReactRoot(container: HTMLElement): Root {
  const win = getRuntimeWindow(container.ownerDocument?.defaultView ?? null);
  const reactDom = resolveZoteroWindowModule(win, "react-dom", "ReactDOM");
  if (!isReactDomRootModule(reactDom)) {
    throw new Error(
      `Zotero ReactDOM.createRoot is unavailable: ${describeLookup(
        win,
        "react-dom",
        "ReactDOM",
      )}`,
    );
  }
  return reactDom.createRoot(container);
}

function getRuntimeWindow(win?: Window | null): ZoteroWindow {
  return (win ?? Zotero.getMainWindow()) as unknown as ZoteroWindow;
}

export function resolveZoteroWindowModule(
  win: Window,
  moduleName: string,
  globalName: string,
  getGlobal: (globalName: string) => unknown = (name) =>
    basicTool.getGlobal(name),
): unknown {
  const zoteroWindow = win as ZoteroWindow;
  return (
    safeRequire(zoteroWindow, moduleName) ??
    zoteroWindow[globalName as keyof ZoteroWindow] ??
    getGlobal(globalName)
  );
}

function safeRequire(win: ZoteroWindow, moduleName: string): unknown {
  try {
    return win.require?.(moduleName);
  } catch (error) {
    debugZotero(`[Agent Client] Failed to require ${moduleName}: ${error}`);
    return null;
  }
}

export function isReactRuntimeModule(
  value: unknown,
): value is typeof ReactTypes {
  return (
    hasFunctionProperty(value, "createElement") &&
    hasFunctionProperty(value, "useEffect") &&
    hasFunctionProperty(value, "useState")
  );
}

export function isReactDomRootModule(
  value: unknown,
): value is Required<ReactDomWithRoot> {
  return hasFunctionProperty(value, "createRoot");
}

function hasFunctionProperty(value: unknown, property: string): boolean {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }
  return typeof (value as Record<string, unknown>)[property] === "function";
}

function describeLookup(
  win: ZoteroWindow,
  moduleName: string,
  globalName: string,
): string {
  const required = safeRequire(win, moduleName);
  const globalValue =
    win[globalName as keyof ZoteroWindow] ?? basicTool.getGlobal(globalName);
  return [
    `window.require=${typeof win.require === "function"}`,
    `require("${moduleName}")=${describeValue(required)}`,
    `${globalName}=${describeValue(globalValue)}`,
  ].join("; ");
}

function debugZotero(message: string): void {
  if (typeof Zotero === "undefined") return;
  Zotero.debug?.(message);
}

function describeValue(value: unknown): string {
  if (!value) return String(value);
  if (typeof value !== "object" && typeof value !== "function") {
    return typeof value;
  }
  const names = Object.getOwnPropertyNames(value as object);
  return `[${names.join(", ") || "no own properties"}]`;
}
