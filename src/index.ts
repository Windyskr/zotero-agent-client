import { App } from "./app";

let app: App | null = null;

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

Object.assign(globalThis, {
  startup,
  onMainWindowLoad,
  onMainWindowUnload,
  shutdown
});
