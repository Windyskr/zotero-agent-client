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

`npm run build` packages the plugin, type-checks `src` and `test`, and runs the
Node-compatible unit tests.

The scaffold build writes the XPI to:

```text
.scaffold/build/zotero-agent-client.xpi
```

For convenience, the current install test package is also copied to:

```text
build/zotero-agent-client-0.1.0.xpi
```

## Verification

Use these checks before publishing or sharing a build:

```sh
npm run verify
```

`npm run test:unit` runs the pure TypeScript unit tests in Node and excludes
`test/startup.test.ts`, which depends on the Zotero plugin harness. `npm test`
uses that Zotero harness and requires a local Zotero test runtime.

## Configuration

Open the Zotero Agent Client preferences pane to configure the reader sidebar.
The default install includes Codex ACP and Claude ACP profiles. To customize the
available agents, set **Agent profiles JSON** to an array like:

```json
[
  {
    "id": "codex",
    "name": "Codex ACP",
    "command": "npx",
    "args": ["-y", "@zed-industries/codex-acp"],
    "env": {}
  },
  {
    "id": "claude",
    "name": "Claude ACP",
    "command": "npx",
    "args": ["-y", "@zed-industries/claude-agent-acp"],
    "env": {}
  }
]
```

Set **Default agent ID** to one of the configured `id` values, such as `codex`.
The launch command is intentionally restricted to `npx`; package arguments are
normalized to include `-y` so Zotero does not stop on an interactive install
prompt.

The **Send template** controls the prompt text sent to the agent. Supported
variables are `{{prompt}}`, `{{title}}`, and `{{year}}`; the default is
`{{prompt}}`. **Session store path** can be left empty to use the plugin's
default cache location inside the Zotero profile.

## Scope

- macOS + Zotero 8 first.
- Local ACP adapters only, such as `codex-acp` and `claude-agent-acp`.
- Adapter launch mode is NPX-only:
  - Codex: `npx -y @zed-industries/codex-acp`
  - Claude: `npx -y @zed-industries/claude-agent-acp`
- No login, registration, cloud service, or hosted backend.

## License

AGPL-3.0-only. See [LICENSE](./LICENSE).
