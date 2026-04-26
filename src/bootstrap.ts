import { App } from "./app";

let app: App | null = null;

function install(): void {
  Zotero.debug("ACP Sidebar Chat: installed");
}

async function startup(data: { id: string; version: string; rootURI: string }): Promise<void> {
  app = new App();
  await app.startup(data);
}

function onMainWindowLoad({ window: win }: { window: any }): void {
  app?.addToWindow(win);
}

function onMainWindowUnload({ window: win }: { window: any }): void {
  app?.removeFromWindow(win);
}

function shutdown(): void {
  app?.shutdown();
  app = null;
}

function uninstall(): void {
  Zotero.debug("ACP Sidebar Chat: uninstalled");
}

Object.assign(globalThis, {
  install,
  startup,
  onMainWindowLoad,
  onMainWindowUnload,
  shutdown,
  uninstall
});
