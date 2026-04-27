import { BasicTool } from "zotero-plugin-toolkit";
import type * as ReactTypes from "react";
import type { Root } from "react-dom/client";

type ZoteroWindow = Window & {
  React?: typeof ReactTypes;
  ReactDOM?: ReactDomWithRoot;
  require?: (moduleName: string) => unknown;
};

type ReactDomWithRoot = {
  createRoot?: (container: Element | DocumentFragment) => Root;
};

const basicTool = new BasicTool();

let cachedReact: typeof ReactTypes | null = null;

export function getZoteroReact(win?: Window): typeof ReactTypes {
  if (cachedReact) return cachedReact;
  const react = getWindowModule(getRuntimeWindow(win), "react", "React");
  if (!react) {
    throw new Error("Zotero React runtime is unavailable");
  }
  cachedReact = react as typeof ReactTypes;
  return cachedReact;
}

export function createZoteroReactRoot(container: HTMLElement): Root {
  const win = getRuntimeWindow(container.ownerDocument?.defaultView ?? null);
  const reactDom = getWindowModule(
    win,
    "react-dom",
    "ReactDOM",
  ) as ReactDomWithRoot | null;
  const createRoot = reactDom?.createRoot;
  if (typeof createRoot !== "function") {
    throw new Error(
      `Zotero ReactDOM.createRoot is unavailable: ${describeLookup(
        win,
        "react-dom",
        "ReactDOM",
      )}`,
    );
  }
  return createRoot.call(reactDom, container);
}

function getRuntimeWindow(win?: Window | null): ZoteroWindow {
  return (win ?? Zotero.getMainWindow()) as unknown as ZoteroWindow;
}

function getWindowModule(
  win: ZoteroWindow,
  moduleName: string,
  globalName: string,
): unknown {
  return (
    safeRequire(win, moduleName) ??
    win[globalName as keyof ZoteroWindow] ??
    basicTool.getGlobal(globalName)
  );
}

function safeRequire(win: ZoteroWindow, moduleName: string): unknown {
  try {
    return win.require?.(moduleName);
  } catch (error) {
    Zotero.debug?.(`[Agent Client] Failed to require ${moduleName}: ${error}`);
    return null;
  }
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

function describeValue(value: unknown): string {
  if (!value) return String(value);
  if (typeof value !== "object" && typeof value !== "function") {
    return typeof value;
  }
  const names = Object.getOwnPropertyNames(value as object);
  return `[${names.join(", ") || "no own properties"}]`;
}
