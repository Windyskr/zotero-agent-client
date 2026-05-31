import { config } from "../../package.json";
import { normalizeSessionStorePath } from "./acpSessionStore";
import { getZoteroProfileDir } from "./acpZoteroRuntime";
import { getPref, setPref } from "../utils/prefs";

export async function registerPrefsScripts(_window: Window) {
  ztoolkit.log("Zotero Agent Client preferences loaded", _window);
  initializeSettingsForm(_window);
  bindClearCacheButton(_window);
}

type SettingsForm = {
  defaultAgent: HTMLInputElement;
  sendKeyMode: HTMLSelectElement;
  sessionStorePath: HTMLInputElement;
  agentProfiles: HTMLTextAreaElement;
  saveButton: HTMLButtonElement;
  saveStatus: Element | null;
};

function initializeSettingsForm(prefWindow: Window): void {
  const form = getSettingsForm(prefWindow.document);
  if (!form) return;

  loadSettingsIntoForm(form);
  bindSaveSettings(prefWindow, form);
}

function getSettingsForm(doc: Document): SettingsForm | null {
  const root = `zotero-prefpane-${config.addonRef}`;
  const defaultAgent = doc.getElementById(
    `${root}-defaultAgent`,
  ) as HTMLInputElement | null;
  const sendKeyMode = doc.getElementById(
    `${root}-sendKeyMode`,
  ) as HTMLSelectElement | null;
  const sessionStorePath = doc.getElementById(
    `${root}-sessionStorePath`,
  ) as HTMLInputElement | null;
  const agentProfiles = doc.getElementById(
    `${root}-agentProfiles`,
  ) as HTMLTextAreaElement | null;
  const saveButton = doc.getElementById(
    `${root}-saveSettings`,
  ) as HTMLButtonElement | null;
  const saveStatus = doc.getElementById(`${root}-saveStatus`);
  if (
    !defaultAgent ||
    !sendKeyMode ||
    !sessionStorePath ||
    !agentProfiles ||
    !saveButton
  ) {
    return null;
  }
  return {
    defaultAgent,
    sendKeyMode,
    sessionStorePath,
    agentProfiles,
    saveButton,
    saveStatus,
  };
}

function loadSettingsIntoForm(form: SettingsForm): void {
  form.defaultAgent.value = getPref("defaultAgent") || "";
  form.sendKeyMode.value = getPref("sendKeyMode") || "ctrlEnter";
  form.sessionStorePath.value = getPref("sessionStorePath") || "";
  form.agentProfiles.value = getPref("agentProfiles") || "";
}

function bindSaveSettings(prefWindow: Window, form: SettingsForm): void {
  if (form.saveButton.dataset.acpchatBound === "true") return;

  form.saveButton.dataset.acpchatBound = "true";
  form.saveButton.addEventListener("click", () => {
    void saveSettings(prefWindow.document, form);
  });
}

async function saveSettings(
  doc: Document,
  form: SettingsForm,
): Promise<void> {
  form.saveButton.disabled = true;
  await setStatus(form.saveStatus, doc, "pref-save-running", "Saving...");
  try {
    const sendKeyMode = normalizeSendKeyMode(form.sendKeyMode.value);
    setPref("defaultAgent", form.defaultAgent.value.trim());
    setPref("sendKeyMode", sendKeyMode);
    setPref("sessionStorePath", form.sessionStorePath.value.trim());
    setPref("agentProfiles", form.agentProfiles.value.trim());
    form.sendKeyMode.value = sendKeyMode;
    await setStatus(
      form.saveStatus,
      doc,
      "pref-save-done",
      "Settings saved. Reopen the reader tab for changes to take effect.",
    );
  } catch (error) {
    Zotero.logError(error as Error);
    await setStatus(
      form.saveStatus,
      doc,
      "pref-save-failed",
      "Settings could not be saved. Check the Zotero error log.",
    );
  } finally {
    form.saveButton.disabled = false;
  }
}

function normalizeSendKeyMode(value: string): string {
  return value === "enter" ? "enter" : "ctrlEnter";
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
          removed ? "pref-clear-cache-done" : "pref-clear-cache-empty",
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
    });
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
  const normalizedConfiguredPath =
    typeof configuredPath === "string"
      ? normalizeSessionStorePath(configuredPath)
      : "";
  if (normalizedConfiguredPath) {
    targets.set(normalizedConfiguredPath, {
      path: normalizedConfiguredPath,
      recursive: false,
    });
  }
  const defaultCacheDir = PathUtils.join(
    getZoteroProfileDir(),
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
  const l10n = doc.l10n;
  if (typeof l10n?.formatValue === "function") {
    return (await l10n.formatValue(id)) || fallback;
  }
  return fallback;
}
