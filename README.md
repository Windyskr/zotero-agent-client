# Zotero ACP Sidebar Chat

An open-source Zotero 8 plugin that adds a reader-side chat panel for local
ACP-compatible agents such as `codex-acp` and `claude-agent-acp`.

## Scope

- macOS only for v1.
- Zotero 8.x only.
- No login, registration, cloud sync, or hosted backend.
- Users install ACP adapters themselves and configure the executable path in
  the plugin preferences.

## Development

```sh
npm install
npm test
npm run build
```

The build output is written to `dist/`. Install the plugin by loading or
packaging that folder as a Zotero XPI.

## Runtime Defaults

- Codex ACP command: `codex-acp`
- Claude ACP command: `claude-agent-acp`
- Session storage: `Zotero profile/acpchat/sessions.json`
