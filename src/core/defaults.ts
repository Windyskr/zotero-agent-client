import type { AgentProfile, PluginSettings, PromptPreset } from "./types";

export const PREF_PREFIX = "extensions.zotero.acpchat.";

export const DEFAULT_AGENT_PROFILES: AgentProfile[] = [
  {
    id: "codex",
    name: "Codex ACP",
    command: "codex-acp",
    args: [],
    env: {}
  },
  {
    id: "claude",
    name: "Claude ACP",
    command: "claude-agent-acp",
    args: [],
    env: {}
  }
];

export const DEFAULT_PROMPT_PRESETS: PromptPreset[] = [
  {
    id: "summary",
    name: "Summarize paper",
    prompt:
      "Please summarize this paper for a research workflow. Focus on the problem, method, findings, limitations, and follow-up ideas.\n\nPaper: {{title}} {{year}}"
  },
  {
    id: "critique",
    name: "Critical reading",
    prompt:
      "Please critique this paper. Identify key assumptions, methodological risks, missing baselines, and useful future experiments.\n\nPaper: {{title}} {{year}}"
  },
  {
    id: "methods",
    name: "Methods extraction",
    prompt:
      "Extract the method details from this paper in a structured way: dataset, model, variables, procedure, metrics, and reproducibility notes.\n\nPaper: {{title}} {{year}}"
  }
];

export const DEFAULT_SETTINGS: PluginSettings = {
  agentProfiles: DEFAULT_AGENT_PROFILES,
  defaultAgent: "codex",
  promptPresets: DEFAULT_PROMPT_PRESETS,
  defaultPresetId: "summary",
  sessionStorePath: "",
  defaultTemplate: "{{prompt}}"
};
