import { DEFAULT_SETTINGS } from "./core/defaults";
import type { PluginSettings } from "./core/types";
import { ZoteroPrefs } from "./runtime/prefs";

const prefs = new ZoteroPrefs();

function init(): void {
  const settings = prefs.getSettings();
  const defaultAgent = byId<HTMLSelectElement>("default-agent");
  const agentProfiles = byId<HTMLTextAreaElement>("agent-profiles");
  const promptPresets = byId<HTMLTextAreaElement>("prompt-presets");
  const defaultPresetId = byId<HTMLInputElement>("default-preset-id");
  const defaultTemplate = byId<HTMLTextAreaElement>("default-template");
  const sessionStorePath = byId<HTMLInputElement>("session-store-path");
  const status = byId<HTMLElement>("status");

  const writeToForm = (value: PluginSettings) => {
    defaultAgent.textContent = "";
    for (const profile of value.agentProfiles) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      defaultAgent.append(option);
    }
    defaultAgent.value = value.defaultAgent;
    agentProfiles.value = JSON.stringify(value.agentProfiles, null, 2);
    promptPresets.value = JSON.stringify(value.promptPresets, null, 2);
    defaultPresetId.value = value.defaultPresetId;
    defaultTemplate.value = value.defaultTemplate;
    sessionStorePath.value = value.sessionStorePath;
  };

  writeToForm(settings);

  byId<HTMLButtonElement>("save").addEventListener("click", () => {
    try {
      const nextSettings: PluginSettings = {
        agentProfiles: JSON.parse(agentProfiles.value),
        defaultAgent: defaultAgent.value,
        promptPresets: JSON.parse(promptPresets.value),
        defaultPresetId: defaultPresetId.value.trim(),
        defaultTemplate: defaultTemplate.value,
        sessionStorePath: sessionStorePath.value.trim()
      };
      prefs.setSettings(nextSettings);
      status.textContent = "Saved";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  });

  byId<HTMLButtonElement>("reset").addEventListener("click", () => {
    prefs.setSettings(DEFAULT_SETTINGS);
    writeToForm(DEFAULT_SETTINGS);
    status.textContent = "Defaults restored";
  });
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing preference element: ${id}`);
  }
  return node as T;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
