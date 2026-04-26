import { DEFAULT_SETTINGS, PREF_PREFIX } from "../core/defaults";
import type { AgentProfile, PluginSettings, PromptPreset } from "../core/types";

export class ZoteroPrefs {
  getSettings(): PluginSettings {
    return {
      agentProfiles: this.getJson<AgentProfile[]>("agentProfiles", DEFAULT_SETTINGS.agentProfiles),
      defaultAgent: this.getString("defaultAgent", DEFAULT_SETTINGS.defaultAgent),
      promptPresets: this.getJson<PromptPreset[]>("promptPresets", DEFAULT_SETTINGS.promptPresets),
      defaultPresetId: this.getString("defaultPresetId", DEFAULT_SETTINGS.defaultPresetId),
      sessionStorePath: this.getString("sessionStorePath", DEFAULT_SETTINGS.sessionStorePath),
      defaultTemplate: this.getString("defaultTemplate", DEFAULT_SETTINGS.defaultTemplate)
    };
  }

  setSettings(settings: PluginSettings): void {
    this.setJson("agentProfiles", settings.agentProfiles);
    this.setString("defaultAgent", settings.defaultAgent);
    this.setJson("promptPresets", settings.promptPresets);
    this.setString("defaultPresetId", settings.defaultPresetId);
    this.setString("sessionStorePath", settings.sessionStorePath);
    this.setString("defaultTemplate", settings.defaultTemplate);
  }

  resetDefaults(): void {
    this.setSettings(DEFAULT_SETTINGS);
  }

  private getString(name: string, fallback: string): string {
    const value = Zotero.Prefs.get(`${PREF_PREFIX}${name}`, true);
    return typeof value === "string" ? value : fallback;
  }

  private setString(name: string, value: string): void {
    Zotero.Prefs.set(`${PREF_PREFIX}${name}`, value, true);
  }

  private getJson<T>(name: string, fallback: T): T {
    const value = this.getString(name, JSON.stringify(fallback));
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      Zotero.logError(error);
      return fallback;
    }
  }

  private setJson(name: string, value: unknown): void {
    this.setString(name, JSON.stringify(value));
  }
}
