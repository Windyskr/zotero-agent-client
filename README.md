# Zotero Agent Client

Template-based Zotero plugin for chatting with local ACP agents from the Zotero
reader sidebar.

This repository is based on
[`windingwind/zotero-plugin-template`](https://github.com/windingwind/zotero-plugin-template)
and uses `zotero-plugin-scaffold` for packaging.

## Build

```sh
npm install
npm run build
```

The scaffold build writes the XPI to:

```text
.scaffold/build/zotero-agent-client.xpi
```

For convenience, the current install test package is also copied to:

```text
build/zotero-agent-client-0.1.0.xpi
```

## Scope

- macOS + Zotero 8 first.
- Local ACP adapters only, such as `codex-acp` and `claude-agent-acp`.
- Adapter launch mode is NPX-only:
  - Codex: `npx -y @zed-industries/codex-acp`
  - Claude: `npx -y @zed-industries/claude-agent-acp`
- No login, registration, cloud service, or hosted backend.
