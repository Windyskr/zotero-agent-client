pref(
  "agentProfiles",
  '[{"id":"codex","name":"Codex ACP","command":"npx","args":["-y","@zed-industries/codex-acp"],"env":{}},{"id":"claude","name":"Claude ACP","command":"npx","args":["-y","@zed-industries/claude-agent-acp"],"env":{}}]',
);
pref("defaultAgent", "codex");
pref("sessionStorePath", "");
pref("defaultTemplate", "{{prompt}}");
