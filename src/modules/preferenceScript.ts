import { config } from "../../package.json";

export async function registerPrefsScripts(_window: Window) {
  ztoolkit.log("Zotero Agent Client preferences loaded", _window);
  bindClearCacheButton(_window);
}

function bindClearCacheButton(prefWindow: Window): void {
  const doc = prefWindow.document;
  const button = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-clearCache`,
  ) as HTMLButtonElement | null;
  const status = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-clearCacheStatus`,
  );
  if (!button || button.dataset.acpchatBound === "true") return;

  button.dataset.acpchatBound = "true";
  button.addEventListener("click", () => {
    void (async () => {
      button.disabled = true;
      await setStatus(
        status,
        doc,
        "pref-clear-cache-running",
        "Clearing cache...",
      );
      try {
        const removed = await clearSessionCache();
        await setStatus(
          status,
          doc,
          "pref-clear-cache-done",
          removed
            ? "Cache cleared. Reopen the reader tab if the panel is still stale."
            : "No cache files found.",
        );
      } catch (error) {
        Zotero.logError(error as Error);
        await setStatus(
          status,
          doc,
          "pref-clear-cache-failed",
          "Some cache files could not be cleared. Check the Zotero error log.",
        );
      } finally {
        button.disabled = false;
      }
    })();
  });
}

async function clearSessionCache(): Promise<boolean> {
  let removed = false;
  for (const target of getCacheTargets()) {
    if (!(await IOUtils.exists(target.path))) continue;
    await IOUtils.remove(target.path, {
      ignoreAbsent: true,
      recursive: target.recursive,
    } as any);
    removed = true;
  }
  return removed;
}

function getCacheTargets(): Array<{ path: string; recursive: boolean }> {
  const targets = new Map<string, { path: string; recursive: boolean }>();
  const configuredPath = Zotero.Prefs.get(
    `${config.prefsPrefix}.sessionStorePath`,
    true,
  );
  if (typeof configuredPath === "string" && configuredPath.trim()) {
    targets.set(configuredPath.trim(), {
      path: configuredPath.trim(),
      recursive: false,
    });
  }
  const defaultCacheDir = PathUtils.join(
    (Zotero as any).Profile.dir,
    config.addonRef,
  );
  const defaultStorePath = PathUtils.join(defaultCacheDir, "sessions.json");
  targets.set(defaultStorePath, {
    path: defaultStorePath,
    recursive: false,
  });
  targets.set(defaultCacheDir, {
    path: defaultCacheDir,
    recursive: true,
  });
  return Array.from(targets.values());
}

async function setStatus(
  element: Element | null,
  doc: Document,
  id: string,
  fallback: string,
): Promise<void> {
  if (!element) return;
  element.textContent = await getPrefPaneString(doc, id, fallback);
}

async function getPrefPaneString(
  doc: Document,
  id: string,
  fallback: string,
): Promise<string> {
  const l10n = (doc as any).l10n;
  if (typeof l10n?.formatValue === "function") {
    return (await l10n.formatValue(id)) || fallback;
  }
  return fallback;
}
