export const ACP_CHAT_STYLE = `
      .acpchat-panel,
      .acpchat-panel * {
        box-sizing: border-box;
      }
      .acpchat-host {
        contain: inline-size;
        display: flex;
        flex-direction: column;
        block-size: 100%;
        inline-size: 100%;
        max-block-size: 100%;
        max-width: 100%;
        min-height: 0;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
      }
      .acpchat-host > * {
        flex: 1 1 auto;
        inline-size: 100%;
        max-width: 100%;
        min-height: 0;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
      }
      .acpchat-panel {
        --acpchat-accent: #2563eb;
        --acpchat-accent-soft: #eaf2ff;
        --acpchat-accent-border: #b9d2ff;
        --acpchat-canvas: #f4f6f8;
        --acpchat-composer-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
        --acpchat-focus: rgba(37, 99, 235, 0.18);
        --acpchat-hover: rgba(15, 23, 42, 0.06);
        --acpchat-panel-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
        --acpchat-surface: var(--material-background, #ffffff);
        --acpchat-surface-elevated: #ffffff;
        --acpchat-surface-muted: var(--material-mix-quinary, #f6f7f8);
        --acpchat-border: var(--material-border-quinary, #d8dce2);
        --acpchat-text: var(--fill-primary, #202124);
        --acpchat-muted: var(--fill-secondary, #6b7280);
        --acpchat-danger: #b3261e;
        background: var(--acpchat-surface);
        border: 1px solid var(--acpchat-border);
        border-radius: 8px;
        box-shadow: var(--acpchat-panel-shadow);
        block-size: max(100%, 320px);
        color: var(--acpchat-text);
        contain: inline-size;
        display: flex;
        flex-direction: column;
        font: 12px/1.42 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        gap: 0;
        inline-size: 100%;
        max-width: 100%;
        min-block-size: 320px;
        min-width: 0;
        overflow: hidden;
        padding: 0;
        position: relative;
        resize: vertical;
        width: 100%;
      }
      .acpchat-panel::after {
        border-bottom: 2px solid var(--acpchat-muted);
        border-right: 2px solid var(--acpchat-muted);
        bottom: 5px;
        content: "";
        height: 8px;
        opacity: 0.42;
        pointer-events: none;
        position: absolute;
        right: 5px;
        width: 8px;
        z-index: 6;
      }
      .acpchat-panel:hover::after {
        opacity: 0.72;
      }
      .acpchat-panel button,
      .acpchat-panel select,
      .acpchat-panel textarea {
        font: inherit !important;
      }
      .acpchat-topbar,
      .acpchat-messages,
      .acpchat-composer,
      .acpchat-composer-card,
      .acpchat-loading-card,
      .acpchat-fatal {
        background: transparent;
        border: 0;
        border-radius: 0;
        inline-size: 100%;
        max-width: 100%;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
      }
      .acpchat-topbar {
        background: var(--acpchat-surface-elevated);
        border-bottom: 1px solid var(--acpchat-border);
        box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
        display: flex;
        flex: 0 0 auto;
        flex-direction: column;
        min-width: 0;
        padding: 8px 9px;
        overflow: visible;
        z-index: 4;
      }
      .acpchat-topbar-main {
        align-items: center;
        display: grid;
        gap: 7px;
        grid-template-columns: minmax(0, 1fr) auto auto;
        min-width: 0;
      }
      .acpchat-error-copy {
        background: var(--acpchat-surface-elevated);
        border: 1px solid var(--acpchat-border);
        border-radius: 999px;
        color: var(--acpchat-muted);
        cursor: pointer;
        flex: 0 0 auto;
        font-size: 10px;
        font-weight: 650;
        line-height: 1.2;
        min-height: 20px;
        padding: 2px 7px;
      }
      .acpchat-error-copy:hover {
        background: var(--acpchat-hover);
        color: var(--acpchat-text);
      }
      .acpchat-agent-select {
        width: 100%;
      }
      .acpchat-agent-status {
        align-items: center;
        display: grid;
        gap: 7px;
        grid-template-columns: minmax(0, 1fr) auto;
        min-width: 0;
      }
      .acpchat-status-dot {
        background: var(--acpchat-muted);
        border: 1px solid var(--acpchat-surface-elevated);
        border-radius: 999px;
        box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
        color: var(--acpchat-muted);
        display: inline-block;
        height: 8px;
        inline-size: 8px;
        justify-self: end;
        min-width: 8px;
        width: 8px;
      }
      .acpchat-status-wrap {
        align-items: center;
        display: inline-flex;
        justify-self: end;
        min-height: 24px;
        outline: none;
        position: relative;
      }
      .acpchat-status-wrap:focus-visible .acpchat-status-dot {
        box-shadow: 0 0 0 3px var(--acpchat-focus);
      }
      .acpchat-status-popover {
        background: var(--acpchat-surface-elevated);
        border: 1px solid var(--acpchat-border);
        border-radius: 7px;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
        color: var(--acpchat-text);
        display: flex;
        flex-direction: column;
        font-size: 10.5px;
        gap: 7px;
        line-height: 1.35;
        max-width: min(360px, calc(100vw - 24px));
        min-width: 240px;
        opacity: 0;
        padding: 8px;
        pointer-events: none;
        position: absolute;
        right: 0;
        top: calc(100% + 8px);
        transform: translateY(-2px);
        transition:
          opacity 120ms ease,
          transform 120ms ease;
        visibility: hidden;
        z-index: 20;
      }
      .acpchat-status-wrap:hover .acpchat-status-popover,
      .acpchat-status-wrap:focus-within .acpchat-status-popover {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
        visibility: visible;
      }
      .acpchat-status-popover::before {
        background: transparent;
        content: "";
        height: 8px;
        left: 0;
        position: absolute;
        right: 0;
        top: -8px;
      }
      .acpchat-status-popover-head {
        align-items: center;
        display: flex;
        gap: 8px;
        justify-content: space-between;
        min-width: 0;
      }
      .acpchat-status-popover-title {
        font-size: 11px;
        font-weight: 700;
        min-width: 0;
      }
      .acpchat-status-meta {
        display: grid;
        gap: 3px 8px;
        grid-template-columns: auto minmax(0, 1fr);
        min-width: 0;
      }
      .acpchat-status-meta span:nth-child(odd),
      .acpchat-status-log-label {
        color: var(--acpchat-muted);
        font-size: 10px;
        font-weight: 650;
      }
      .acpchat-status-meta span:nth-child(even) {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        min-width: 0;
        overflow: hidden;
        overflow-wrap: anywhere;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .acpchat-status-log {
        background: var(--acpchat-surface-muted);
        border: 1px solid var(--acpchat-border);
        border-radius: 6px;
        color: var(--acpchat-text);
        display: flex;
        flex-direction: column;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 10px;
        gap: 4px;
        line-height: 1.35;
        margin: 0;
        max-height: 180px;
        overflow: auto;
        padding: 7px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .acpchat-status-log-entry {
        display: block;
        min-width: 0;
      }
      .acpchat-status-popover.is-error {
        border-color: rgba(179, 38, 30, 0.32);
      }
      .acpchat-status-popover.is-error .acpchat-status-log {
        background: rgba(179, 38, 30, 0.06);
        border-color: rgba(179, 38, 30, 0.18);
        color: var(--acpchat-danger);
      }
      .acpchat-status-dot.is-success {
        background: #22a06b;
        color: #22a06b;
      }
      .acpchat-status-dot.is-busy {
        animation: acpchat-pulse 1.2s ease-in-out infinite;
        background: #22a06b;
        color: #22a06b;
      }
      .acpchat-status-dot.is-error {
        background: var(--acpchat-danger);
        color: var(--acpchat-danger);
      }
      .acpchat-status-dot.is-muted {
        background: var(--acpchat-muted);
        color: var(--acpchat-muted);
      }
      .acpchat-topbar-action,
      .acpchat-topbar-plus {
        align-items: center;
        background: var(--acpchat-surface-elevated);
        border: 1px solid var(--acpchat-border);
        border-radius: 6px;
        color: var(--acpchat-muted);
        display: inline-flex;
        font-size: 10px;
        font-weight: 650;
        justify-content: center;
        line-height: 1;
        min-height: 26px;
        min-width: 0;
        padding: 2px 8px;
      }
      .acpchat-topbar-action:not(:disabled):hover,
      .acpchat-topbar-plus:not(:disabled):hover {
        background: var(--acpchat-hover);
        color: var(--acpchat-text);
      }
      .acpchat-topbar-action:disabled,
      .acpchat-topbar-plus:disabled,
      .acpchat-attach-button:disabled {
        opacity: 0.48;
      }
      .acpchat-topbar-action.is-active {
        background: var(--acpchat-accent-soft);
        border-color: var(--acpchat-accent-border);
        color: var(--acpchat-accent);
      }
      .acpchat-topbar-plus {
        font-size: 17px;
        padding: 0;
        width: 28px;
      }
      .acpchat-topic-list {
        background: transparent;
        border: 0;
        border-radius: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        padding: 4px;
      }
      .acpchat-topic-list-items {
        display: flex;
        flex-direction: column;
        gap: 1px;
        max-height: min(38vh, 260px);
        overflow-y: auto;
      }
      .acpchat-history-backdrop {
        background: transparent;
        border: 0;
        bottom: 0;
        left: 0;
        position: absolute;
        right: 0;
        top: 46px;
        z-index: 3;
      }
      .acpchat-history-drawer {
        background: var(--acpchat-surface-elevated);
        border: 1px solid var(--acpchat-border);
        border-radius: 8px;
        box-shadow: 0 16px 34px rgba(15, 23, 42, 0.18);
        left: 9px;
        opacity: 0;
        overflow: hidden;
        pointer-events: none;
        position: absolute;
        right: 9px;
        top: 47px;
        transform: translateY(-6px);
        transition: opacity 0.14s ease, transform 0.14s ease;
        z-index: 4;
      }
      .acpchat-history-drawer.is-open {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }
      .acpchat-topic-item {
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 6px;
        color: var(--acpchat-text);
        display: grid;
        gap: 6px;
        grid-template-columns: minmax(0, 1fr) auto;
        min-width: 0;
        padding: 6px 8px;
        text-align: left;
      }
      .acpchat-topic-item:hover {
        background: var(--acpchat-hover);
      }
      .acpchat-topic-item.is-active {
        background: var(--acpchat-accent-soft);
        color: var(--acpchat-accent);
        font-weight: 650;
      }
      .acpchat-topic-item:disabled {
        opacity: 0.5;
      }
      .acpchat-topic-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .acpchat-topic-time {
        color: var(--acpchat-muted);
        font-size: 10px;
        line-height: 1.2;
      }
      .acpchat-topic-empty {
        color: var(--acpchat-muted);
        font-size: 11px;
        line-height: 1.35;
        padding: 14px 10px;
        text-align: center;
      }
      .acpchat-message-role,
      .acpchat-empty-title {
        color: var(--acpchat-muted);
        font-size: 10px;
        font-weight: 650;
        line-height: 1.2;
      }
      .acpchat-select,
      .acpchat-input {
        background: var(--acpchat-surface-elevated);
        border: 1px solid var(--acpchat-border);
        border-radius: 6px;
        color: var(--acpchat-text);
        min-width: 0;
        width: 100%;
      }
      .acpchat-select {
        height: 26px;
        line-height: 24px;
        padding: 1px 6px;
      }
      .acpchat-messages {
        -moz-user-select: text;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.45), transparent 90px),
          var(--acpchat-canvas);
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        gap: 12px;
        inline-size: 100%;
        max-height: none;
        max-width: 100%;
        min-height: 0;
        min-width: 0;
        overflow: auto;
        overflow-x: clip;
        overflow-x: hidden;
        overflow-y: auto;
        padding: 14px 10px 12px;
        scrollbar-width: thin;
        user-select: text;
        width: 100%;
        z-index: 1;
      }
      .acpchat-turn {
        display: flex;
        flex-direction: column;
        gap: 7px;
        min-width: 0;
      }
      .acpchat-empty {
        background: var(--acpchat-surface-elevated);
        border: 1px solid var(--acpchat-border);
        border-radius: 8px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        margin: auto 0;
        padding: 16px 14px;
        text-align: center;
      }
      .acpchat-empty::before {
        background:
          linear-gradient(var(--acpchat-accent), var(--acpchat-accent)) 50% 56% /
            14px 2px no-repeat,
          var(--acpchat-accent-soft);
        border: 1px solid var(--acpchat-accent-border);
        border-radius: 999px;
        content: "";
        display: block;
        height: 32px;
        margin: 0 auto 9px;
        width: 32px;
      }
      .acpchat-empty-error {
        border-color: rgba(179, 38, 30, 0.28);
        text-align: left;
      }
      .acpchat-empty-error::before {
        background: #fdeceb;
        border-color: rgba(179, 38, 30, 0.24);
        content: "!";
        color: var(--acpchat-danger);
        font-size: 18px;
        font-weight: 800;
        line-height: 30px;
        text-align: center;
      }
      .acpchat-empty-title {
        color: var(--acpchat-text);
      }
      .acpchat-empty-error .acpchat-empty-title {
        color: var(--acpchat-danger);
      }
      .acpchat-empty-detail {
        color: var(--acpchat-muted);
        font-size: 11px;
        line-height: 1.4;
        margin-top: 3px;
      }
      .acpchat-inline-error {
        background: #fff7f6;
        border: 1px solid rgba(179, 38, 30, 0.24);
        border-radius: 8px;
        color: var(--acpchat-text);
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 2px;
        min-width: 0;
        padding: 9px 10px;
      }
      .acpchat-inline-error-title {
        color: var(--acpchat-danger);
        font-size: 11px;
        font-weight: 700;
        line-height: 1.3;
      }
      .acpchat-inline-error-log {
        -moz-user-select: text;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(179, 38, 30, 0.16);
        border-radius: 6px;
        color: var(--acpchat-danger);
        font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        margin: 0;
        max-block-size: 150px;
        min-width: 0;
        overflow: auto;
        padding: 6px 7px;
        user-select: text;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .acpchat-message {
        contain: inline-size;
        display: flex;
        flex-direction: column;
        gap: 4px;
        line-height: 1.45;
        max-width: 100%;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
        overflow-wrap: anywhere;
        width: 100%;
      }
      .acpchat-message-user {
        align-self: stretch;
        max-width: 100%;
        width: 100%;
      }
      .acpchat-message-assistant,
      .acpchat-message-tool,
      .acpchat-message-system {
        align-self: flex-start;
        width: 100%;
      }
      .acpchat-message-tool,
      .acpchat-message-system {
        max-width: 100%;
      }
      .acpchat-message-meta {
        align-items: center;
        color: var(--acpchat-muted);
        display: flex;
        flex-wrap: nowrap;
        font-size: calc(var(--acpchat-message-font-size, 12.5px) * 0.8);
        gap: 5px;
        line-height: 1.25;
        min-width: 0;
        width: 100%;
      }
      .acpchat-message-role {
        flex: 0 0 auto;
      }
      .acpchat-message-processed {
        color: var(--acpchat-muted);
        flex: 0 0 auto;
        font-size: calc(var(--acpchat-message-font-size, 12.5px) * 0.76);
        font-weight: 600;
        margin-left: auto;
        text-align: right;
        white-space: nowrap;
      }
      .acpchat-message-copy {
        -moz-user-select: none;
        background: transparent;
        border: 1px solid var(--acpchat-border);
        border-radius: 999px;
        color: var(--acpchat-muted);
        cursor: pointer;
        font: inherit;
        line-height: 1.2;
        margin-left: 5px;
        padding: 1px 5px;
        user-select: none;
      }
      .acpchat-message-copy:hover {
        background: var(--acpchat-surface-muted);
        color: var(--acpchat-text);
      }
      .acpchat-message-copy:focus-visible {
        box-shadow: 0 0 0 2px var(--acpchat-focus);
        outline: none;
      }
      .acpchat-message-user .acpchat-message-meta {
        justify-content: flex-end;
      }
      .acpchat-message-body {
        -moz-user-select: text;
        background: var(--acpchat-surface-elevated);
        border: 1px solid transparent;
        border-radius: 8px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
        font-size: var(--acpchat-message-font-size, 12.5px);
        max-width: 100%;
        min-width: 0;
        overflow-wrap: anywhere;
        padding: 8px 10px;
        user-select: text;
        white-space: normal;
        word-break: break-word;
      }
      .acpchat-message-body * {
        -moz-user-select: text;
        max-width: 100%;
        overflow-wrap: anywhere;
        user-select: text;
        white-space: normal;
        word-break: break-word;
      }
      .acpchat-message-user .acpchat-message-body {
        align-self: flex-end;
        background: var(--acpchat-accent);
        border-color: var(--acpchat-accent);
        border-bottom-right-radius: 3px;
        color: #ffffff;
        max-width: 86%;
      }
      .acpchat-message-assistant .acpchat-message-body {
        background: var(--acpchat-surface-elevated);
        border-bottom-left-radius: 3px;
        border-color: var(--acpchat-border);
      }
      .acpchat-message-tool .acpchat-message-body,
      .acpchat-message-system .acpchat-message-body {
        background: transparent;
        border-color: transparent;
        color: var(--acpchat-muted);
        font-size: calc(var(--acpchat-message-font-size, 12.5px) * 0.88);
        padding: 2px 0;
      }
      .acpchat-turn-tools {
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid var(--acpchat-border);
        border-radius: 7px;
        color: var(--acpchat-muted);
        font-size: calc(var(--acpchat-message-font-size, 12.5px) * 0.8);
        min-width: 0;
      }
      .acpchat-turn-tools-summary-only {
        background: transparent;
        border-color: transparent;
      }
      .acpchat-turn-tools-summary-only .acpchat-turn-tools-summary-row {
        padding: 0 2px;
      }
      .acpchat-turn-tools-summary-only .acpchat-turn-tools-state {
        color: var(--acpchat-muted);
        font-size: 9.5px;
        font-weight: 600;
      }
      .acpchat-turn-tools-summary {
        align-items: center;
        cursor: pointer;
        display: flex;
        gap: 6px;
        justify-content: space-between;
        list-style: none;
        min-width: 0;
        padding: 6px 8px;
      }
      .acpchat-turn-tools-summary-row {
        align-items: center;
        display: flex;
        min-width: 0;
        padding: 6px 8px;
      }
      .acpchat-turn-tools-summary-only .acpchat-turn-tools-summary-row {
        justify-content: flex-start;
      }
      .acpchat-turn-tools-summary::-webkit-details-marker {
        display: none;
      }
      .acpchat-turn-tools-state {
        color: var(--acpchat-muted);
        font-size: 10px;
        font-weight: 650;
        min-width: 0;
      }
      .acpchat-turn-tools-state.is-active {
        color: #8a5a00;
      }
      .acpchat-turn-tools-chevron {
        color: var(--acpchat-muted);
        flex: 0 0 auto;
        font-size: 11px;
        font-weight: 700;
        transform: translateY(-0.5px);
      }
      .acpchat-turn-tools[open] .acpchat-turn-tools-chevron {
        transform: rotate(90deg);
      }
      .acpchat-turn-tools-list {
        border-top: 1px dashed var(--acpchat-border);
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 5px 8px 8px;
      }
      .acpchat-tool-item {
        background: var(--acpchat-surface);
        border: 1px solid var(--acpchat-border);
        border-radius: 6px;
        min-width: 0;
        padding: 5px 6px;
      }
      .acpchat-tool-item-meta {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .acpchat-tool-item-body {
        -moz-user-select: text;
        color: var(--acpchat-muted);
        margin-top: 2px;
        overflow-wrap: anywhere;
        user-select: text;
        white-space: normal;
        word-break: break-word;
      }
      .acpchat-turn-tools:not([open]) .acpchat-turn-tools-summary {
        border-bottom: 1px solid var(--acpchat-border);
      }
      .acpchat-message-status-error .acpchat-message-body {
        border-color: rgba(179, 38, 30, 0.25);
      }
      .acpchat-message-state {
        background: var(--acpchat-surface-muted);
        border-radius: 999px;
        padding: 1px 5px;
      }
      .acpchat-message-status-error .acpchat-message-state {
        background: #fdeceb;
        color: var(--acpchat-danger);
      }
      .acpchat-message-status-failed .acpchat-message-state {
        background: var(--acpchat-surface-muted);
        color: var(--acpchat-muted);
      }
      .acpchat-message-status-streaming .acpchat-message-state {
        background: #fff4dc;
        color: #8a5a00;
      }
      .acpchat-message-body p {
        margin: 0 0 0.5em;
        overflow-wrap: anywhere;
      }
      .acpchat-message-body p:last-child {
        margin-bottom: 0;
      }
      .acpchat-message-body ul,
      .acpchat-message-body ol {
        margin: 0.35em 0 0.5em 1.25em;
        padding: 0;
      }
      .acpchat-message-body li {
        margin: 0.1em 0;
      }
      .acpchat-message-body pre {
        background: rgba(0, 0, 0, 0.06);
        border-radius: 6px;
        margin: 0.5em 0;
        max-width: 100%;
        overflow: auto;
        padding: 6px;
        white-space: pre-wrap !important;
      }
      .acpchat-message-body code {
        background: rgba(0, 0, 0, 0.06);
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.92em;
        padding: 0 3px;
      }
      .acpchat-message-body pre code {
        background: transparent;
        padding: 0;
        white-space: pre-wrap !important;
      }
      .acpchat-message-body blockquote {
        border-left: 3px solid var(--acpchat-border);
        color: var(--acpchat-muted);
        margin: 0.5em 0;
        padding-left: 7px;
      }
      .acpchat-message-body eq {
        display: inline-block;
        max-inline-size: 100%;
        overflow-x: auto;
        vertical-align: -0.15em;
      }
      .acpchat-message-body eqn {
        display: block;
        inline-size: 100%;
        margin: 0.55em 0;
        overflow-x: auto;
        text-align: center;
      }
      .acpchat-message-body section {
        margin: 0.55em 0;
      }
      .acpchat-message-body .katex math {
        max-inline-size: 100%;
      }
      .acpchat-message-body table {
        border-collapse: collapse;
        display: block;
        margin: 0.5em 0;
        max-width: 100%;
        overflow: auto;
      }
      .acpchat-message-body th,
      .acpchat-message-body td {
        border: 1px solid var(--acpchat-border);
        padding: 3px 5px;
      }
      .acpchat-composer {
        background: var(--acpchat-surface-elevated);
        border-top: 1px solid var(--acpchat-border);
        contain: inline-size;
        display: flex;
        flex: 0 0 auto;
        flex-direction: column;
        gap: 7px;
        inline-size: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: visible;
        padding: 9px;
        position: relative;
        width: 100%;
        z-index: 8;
      }
      .acpchat-composer-card {
        background: var(--acpchat-surface-elevated);
        border: 1px solid var(--acpchat-border);
        border-radius: 8px;
        box-shadow: var(--acpchat-composer-shadow);
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
        overflow: visible;
        padding: 0 0 7px;
        transition: border-color 0.14s ease, box-shadow 0.14s ease;
        width: 100%;
      }
      .acpchat-composer-card:focus-within {
        border-color: var(--acpchat-accent-border);
        box-shadow:
          0 0 0 3px var(--acpchat-focus),
          var(--acpchat-composer-shadow);
      }
      .acpchat-attachments {
        display: flex;
        inline-size: 100%;
        min-width: 0;
        overflow-x: clip;
        overflow-x: hidden;
        width: 100%;
      }
      .acpchat-attachment-pill {
        align-items: center;
        background: var(--acpchat-canvas);
        border: 1px solid var(--acpchat-border);
        border-radius: 999px;
        display: inline-flex;
        gap: 6px;
        inline-size: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        padding: 3px 8px;
        width: 100%;
      }
      .acpchat-attachment-type {
        color: var(--acpchat-accent);
        flex: 0 0 auto;
        font-size: 9px;
        font-weight: 700;
      }
      .acpchat-attachment-name {
        color: var(--acpchat-muted);
        flex: 1 1 auto;
        font-size: 10px;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .acpchat-attachment-remove {
        align-items: center;
        background: transparent;
        border: 0;
        color: var(--acpchat-muted);
        display: inline-flex;
        flex: 0 0 auto;
        font-size: 12px;
        height: 16px;
        justify-content: center;
        line-height: 1;
        margin-left: 2px;
        min-width: 16px;
        padding: 0;
        width: 16px;
      }
      .acpchat-attachment-remove:disabled {
        opacity: 0.42;
      }
      .acpchat-input {
        display: block;
        inline-size: 100%;
        line-height: 1.4;
        max-height: 148px;
        max-width: 100%;
        min-height: 78px;
        min-width: 0;
        overflow: hidden auto;
        overflow-x: clip;
        overflow-x: hidden;
        overflow-wrap: anywhere;
        padding: 8px 9px;
        resize: vertical;
        width: 100%;
        white-space: pre-wrap !important;
        word-break: break-word;
      }
      .acpchat-composer-card .acpchat-input {
        background: transparent;
        border: 0;
        border-radius: 8px 8px 0 0;
        min-height: 76px;
        outline: 0;
        padding: 9px 10px 4px;
        resize: none;
      }
      .acpchat-input:focus,
      .acpchat-select:focus {
        border-color: rgba(37, 99, 235, 0.42);
        outline: 2px solid var(--acpchat-focus);
      }
      .acpchat-composer-card .acpchat-input:focus {
        border-color: transparent;
        outline: 0;
      }
      .acpchat-panel button:focus-visible,
      .acpchat-topic-item:focus-visible,
      .acpchat-attach-option:focus-visible {
        outline: 2px solid rgba(37, 99, 235, 0.22);
        outline-offset: 2px;
      }
      .acpchat-input:disabled {
        opacity: 0.64;
      }
      .acpchat-actions-row {
        align-items: center;
        display: grid;
        gap: 6px;
        grid-template-columns: auto minmax(0, 1fr) auto;
        inline-size: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: visible;
        padding: 0 7px;
        width: 100%;
      }
      .acpchat-config-selects {
        align-items: center;
        display: flex;
        gap: 4px;
        justify-content: flex-end;
        min-width: 0;
        overflow: hidden;
      }
      .acpchat-attach-wrap {
        min-width: 0;
        position: relative;
        z-index: 12;
      }
      .acpchat-attach-button {
        align-items: center;
        background: var(--acpchat-surface-muted);
        border: 1px solid var(--acpchat-border);
        border-radius: 999px;
        color: var(--acpchat-text);
        display: inline-flex;
        font-size: 18px;
        height: 30px;
        justify-content: center;
        min-width: 0;
        width: 30px;
      }
      .acpchat-attach-button.is-active {
        background: var(--acpchat-accent-soft);
        border-color: var(--acpchat-accent-border);
        color: var(--acpchat-accent);
      }
      .acpchat-attach-button:not(:disabled):hover {
        background: var(--acpchat-hover);
      }
      .acpchat-attach-menu {
        background: var(--acpchat-surface-elevated);
        border: 1px solid var(--acpchat-border);
        border-radius: 8px;
        bottom: calc(100% + 8px);
        box-shadow: 0 16px 34px rgba(15, 23, 42, 0.18);
        display: flex;
        flex-direction: column;
        gap: 2px;
        left: 0;
        min-width: 180px;
        overflow: hidden;
        padding: 4px;
        position: absolute;
        max-width: 220px;
        width: 220px;
        z-index: 40;
      }
      .acpchat-attach-menu-head {
        align-items: center;
        border-bottom: 1px solid var(--acpchat-border);
        display: flex;
        justify-content: space-between;
        margin: -1px -1px 3px;
        min-width: 0;
        padding: 4px 5px 6px 7px;
      }
      .acpchat-attach-menu-title {
        color: var(--acpchat-muted);
        font-size: 10px;
        font-weight: 700;
        min-width: 0;
      }
      .acpchat-attach-menu-close {
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 999px;
        color: var(--acpchat-muted);
        display: inline-flex;
        font-size: 14px;
        height: 20px;
        justify-content: center;
        line-height: 1;
        padding: 0;
        width: 20px;
      }
      .acpchat-attach-menu-close:hover {
        background: var(--acpchat-hover);
        color: var(--acpchat-text);
      }
      .acpchat-attach-option {
        align-items: start;
        background: transparent;
        border: 0;
        border-radius: 6px;
        color: var(--acpchat-text);
        cursor: pointer;
        display: grid;
        gap: 8px;
        grid-template-columns: 18px minmax(0, 1fr);
        min-height: 48px;
        min-width: 0;
        padding: 8px;
        text-align: left;
        width: 100%;
      }
      .acpchat-attach-option:hover {
        background: var(--acpchat-hover);
      }
      .acpchat-attach-option.is-active {
        background: var(--acpchat-accent-soft);
      }
      .acpchat-attach-option-check {
        align-items: center;
        color: var(--acpchat-accent);
        display: inline-flex;
        font-size: 14px;
        font-weight: 700;
        height: 20px;
        justify-content: center;
        line-height: 20px;
        width: 18px;
      }
      .acpchat-attach-option-content {
        display: flex;
        flex-direction: column;
        gap: 3px;
        line-height: 1.25;
        min-width: 0;
      }
      .acpchat-attach-option-title {
        color: var(--acpchat-text);
        display: block;
        font-size: 12px;
        font-weight: 650;
        line-height: 1.25;
        min-width: 0;
      }
      .acpchat-attach-option-label {
        color: var(--acpchat-muted);
        display: block;
        font-size: 11px;
        line-height: 1.25;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .acpchat-select-compact {
        background: var(--acpchat-surface-muted);
        border-color: var(--acpchat-border);
        border-radius: 999px;
        color: var(--acpchat-muted);
        flex: 0 1 auto;
        font-size: 10px !important;
        font-weight: 650;
        height: 22px;
        line-height: 20px;
        max-width: calc(18ch + 18px);
        min-height: 22px;
        min-width: 0;
        padding: 0 4px;
        text-overflow: ellipsis;
        width: calc(var(--acpchat-select-text-width, 6ch) + 18px);
      }
      .acpchat-send {
        border-radius: 999px;
        flex: 0 0 auto;
        font-weight: 650;
        min-height: 30px;
        padding: 2px 14px;
        background: var(--acpchat-accent);
        border: 1px solid var(--acpchat-accent);
        color: #ffffff;
      }
      .acpchat-send:not(:disabled):hover {
        background: #1d4ed8;
        border-color: #1d4ed8;
      }
      .acpchat-send.is-pausing {
        background: #fff4dc;
        border-color: #f1d18a;
        color: #8a5a00;
      }
      .acpchat-send:disabled {
        opacity: 0.5;
      }
      .acpchat-loading-card,
      .acpchat-fatal {
        align-items: flex-start;
        block-size: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 10px;
      }
      .acpchat-loading-title,
      .acpchat-fatal-title {
        font-size: 12px;
        font-weight: 650;
      }
      .acpchat-loading-detail,
      .acpchat-fatal-detail {
        color: var(--acpchat-muted);
        font-size: 11px;
        line-height: 1.4;
        margin-top: 3px;
      }
      .acpchat-fatal {
        border-color: rgba(179, 38, 30, 0.24);
      }
      .acpchat-fatal-title,
      .acpchat-error {
        color: var(--acpchat-danger);
      }
      .acpchat-toolbar-button {
        align-items: center;
        display: inline-flex;
        font-weight: 700;
        justify-content: center;
        min-height: 28px;
        min-width: 28px;
      }
      @keyframes acpchat-pulse {
        0%, 100% { opacity: 0.42; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.12); }
      }
      @media (max-width: 260px) {
        .acpchat-topbar-main {
          grid-template-columns: 1fr;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .acpchat-history-drawer {
          transition: none;
        }
        .acpchat-status-dot.is-busy {
          animation: none;
        }
      }
      @media (prefers-color-scheme: dark) {
        .acpchat-panel {
          --acpchat-accent: #7aa2ff;
          --acpchat-accent-soft: rgba(122, 162, 255, 0.16);
          --acpchat-accent-border: rgba(122, 162, 255, 0.32);
          --acpchat-canvas: #17191d;
          --acpchat-composer-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
          --acpchat-focus: rgba(122, 162, 255, 0.18);
          --acpchat-hover: rgba(255, 255, 255, 0.07);
          --acpchat-panel-shadow: 0 14px 34px rgba(0, 0, 0, 0.35);
          --acpchat-surface: #1f2125;
          --acpchat-surface-elevated: #22252a;
          --acpchat-surface-muted: #2a2d32;
          --acpchat-border: rgba(255, 255, 255, 0.14);
          --acpchat-text: #f2f4f8;
          --acpchat-muted: #a7adb7;
          --acpchat-danger: #ffb4ab;
        }
        .acpchat-messages {
          background:
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.035),
              transparent 90px
            ),
            var(--acpchat-canvas);
        }
        .acpchat-message-body {
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
        }
        .acpchat-message-user .acpchat-message-body {
          color: #0b1220;
        }
        .acpchat-turn-tools {
          background: rgba(34, 37, 42, 0.72);
        }
        .acpchat-send:not(:disabled):hover {
          background: #9ab6ff;
          border-color: #9ab6ff;
        }
        .acpchat-status-dot {
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14);
        }
        .acpchat-status-dot.is-success {
          background: #91d7a8;
          color: #91d7a8;
        }
        .acpchat-status-dot.is-busy {
          background: #91d7a8;
          color: #91d7a8;
        }
        .acpchat-message-status-streaming .acpchat-message-state {
          background: rgba(214, 162, 67, 0.16);
          color: #f4c26b;
        }
        .acpchat-status-dot.is-error {
          background: var(--acpchat-danger);
          color: var(--acpchat-danger);
        }
        .acpchat-message-status-error .acpchat-message-state {
          background: rgba(255, 180, 171, 0.14);
          color: var(--acpchat-danger);
        }
        .acpchat-message-status-failed .acpchat-message-state {
          background: var(--acpchat-surface-muted);
          color: var(--acpchat-muted);
        }
        .acpchat-error-copy {
          background: var(--acpchat-surface-muted);
        }
        .acpchat-error-copy:hover {
          background: var(--acpchat-hover);
        }
        .acpchat-status-popover {
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.36);
        }
        .acpchat-status-popover.is-error {
          border-color: rgba(255, 180, 171, 0.28);
        }
        .acpchat-status-popover.is-error .acpchat-status-log {
          background: rgba(255, 180, 171, 0.08);
          border-color: rgba(255, 180, 171, 0.22);
          color: var(--acpchat-danger);
        }
      }
    `;
