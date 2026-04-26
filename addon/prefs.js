pref("agentProfiles", "[{\"id\":\"codex\",\"name\":\"Codex ACP\",\"command\":\"codex-acp\",\"args\":[],\"env\":{}},{\"id\":\"claude\",\"name\":\"Claude ACP\",\"command\":\"claude-agent-acp\",\"args\":[],\"env\":{}}]");
pref("defaultAgent", "codex");
pref("promptPresets", "[{\"id\":\"summary\",\"name\":\"Summarize paper\",\"prompt\":\"Please summarize this paper for a research workflow. Focus on the problem, method, findings, limitations, and follow-up ideas.\\n\\nPaper: {{title}} {{year}}\"},{\"id\":\"critique\",\"name\":\"Critical reading\",\"prompt\":\"Please critique this paper. Identify assumptions, methodological risks, missing baselines, and future experiments.\\n\\nPaper: {{title}} {{year}}\"},{\"id\":\"methods\",\"name\":\"Methods extraction\",\"prompt\":\"Extract method details: dataset, model, variables, procedure, metrics, and reproducibility notes.\\n\\nPaper: {{title}} {{year}}\"}]");
pref("defaultPresetId", "summary");
pref("sessionStorePath", "");
pref("defaultTemplate", "{{prompt}}");
