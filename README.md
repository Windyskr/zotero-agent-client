# Zotero Agent Client

Zotero Agent Client 是一个 Zotero 阅读器侧栏插件。它可以把当前论文的本地
PDF 发送给你电脑上的 ACP Agent，让你在 Zotero 里直接向论文提问、追问和整理
思路。

这个插件不提供云端服务，也不需要注册插件账号。它只负责连接你本机已经可运行
的 ACP Agent。新用户推荐使用 Claude Code ACP；Codex ACP 也可以作为可选
agent 配置。

## 适合谁使用

- 你经常在 Zotero 里阅读论文，希望直接围绕当前 PDF 提问。
- 你已经在本机配置了可用的 AI/Agent(Claude Code 或 Codex) 工具。

## 使用方法

1. 安装 Zotero 8 或更新版本
2. 从 Release 页面下载插件最新版本 `.xpi` 文件，打开 Zotero，进入 `工具` -> `插件`，通过 `Install Add-on From File...` 安装插件。
3. 准备一个可用的 ACP Agent，并确保它的启动命令能被 Zotero 找到。
   也可以[让本地 agent 帮你完成配置](#让本地-agent-自动完成-acp-的配置)
4. 插件默认提供两个配置，并默认使用 Claude Code ACP：
   - Claude Code ACP：`claude-agent-acp`（推荐）
   - Codex ACP：`codex-acp`

如果 agent 需要登录或授权，请先按照对应 agent 的说明在本机完成配置。插件不会
替你登录第三方服务。

### 让本地 Agent 自动完成 ACP 的配置

插件内置的默认配置是跨平台命令名，不会在安装时按 Windows/macOS/Linux 写死不同
路径。这样适合已经配置好 `PATH` 的用户；如果 Zotero 看不到终端里的命令，可以让
本地 agent 帮你安装、验证并写入当前系统的完整命令路径。

可以把下面这段话交给你正在使用的本地 agent：
（如果你要使用 Codex ACP，把下面的 `claude-agent-acp` 替换成 `codex-acp`）

```text
请帮我配置 Zotero Agent Client 使用 Claude Code ACP。

要求：
1. 检测当前操作系统、shell、Node.js/npm 是否可用。
2. 确认 Claude Code CLI 已经可用，不要安装 @anthropic-ai/claude-code：
   claude --version
3. 安装或更新 Claude ACP wrapper：
   npm install -g @agentclientprotocol/claude-agent-acp
4. 验证以下命令可以在普通终端中运行：
   claude-agent-acp --help
5. 找到 claude-agent-acp 的真实可执行路径。Windows 上优先使用 .cmd 完整路径，例如 Volta 的 C:/Users/<user>/AppData/Local/Volta/bin/claude-agent-acp.cmd；macOS/Linux 可以使用 PATH 中的 claude-agent-acp 或真实绝对路径。
6. 找到我正在使用的 Zotero profile。不要新建 profile。
7. 关闭 Zotero 后，更新该 profile 中 Zotero Agent Client 的配置：
   defaultAgent = claude
   agentProfiles = [
     {
       "id": "claude",
       "name": "Claude Code ACP",
       "command": "<第 4 步找到的 claude-agent-acp 命令或完整路径>",
       "args": [],
       "env": {}
     },
     {
       "id": "codex",
       "name": "Codex ACP",
       "command": "codex-acp",
       "args": [],
       "env": {}
     }
   ]
8. 如果 profile 里存在 user.js 并且其中也写了 extensions.zotero.agentclient.agentProfiles 或 defaultAgent，也要同步更新，否则 Zotero 启动时会覆盖 prefs.js。
9. 重新启动 Zotero，打开 Zotero Agent Client，确认默认 Agent 显示为 Claude Code ACP，并复制状态灯详情检查 command 是否正确。
10. 如果启动失败，读取插件状态详情和本地日志，继续修复直到 claude-agent-acp 能启动。
```

### 手动安装

<details>
<summary>
插件只负责启动 ACP 进程用来连接 Claude Code 或者 Codex ，不会对 Claude Code 或者 Codex 的配置进行修改。
</summary>

### 推荐：安装 Claude Code ACP

推荐使用 Claude Code ACP。这里假设你已经安装并登录了 Claude Code CLI
（`claude` 命令）；插件只需要额外安装 ACP wrapper：

```sh
npm install -g @agentclientprotocol/claude-agent-acp
```

安装后确认 Claude Code 和 ACP wrapper 都可用：

```sh
claude --version
claude-agent-acp --help
```

如果 Claude Code 需要登录或授权，请先在终端里完成：

```sh
claude
```

Windows 上，如果终端里能运行 `claude-agent-acp`，但 Zotero 仍然提示找不到命令，说明
Zotero 桌面进程没有继承你的终端 `PATH`。这时可以在 `Agent profiles JSON` 里把
`command` 改成完整路径，例如：

```json
{
  "id": "claude",
  "name": "Claude Code ACP",
  "command": "C:/Users/<user>/AppData/Local/Volta/bin/claude-agent-acp.cmd",
  "args": [],
  "env": {}
}
```

### 安装 Codex ACP

如果你想使用 Codex ACP，可以用 npm 安装：

```sh
npm install -g @zed-industries/codex-acp
```

安装后确认命令可用：

```sh
codex-acp --help
```

Windows 上同样建议在 Zotero 配置里使用完整路径，例如：

```json
{
  "id": "codex",
  "name": "Codex ACP",
  "command": "C:/Users/<user>/AppData/Local/Volta/bin/codex-acp.cmd",
  "args": [],
  "env": {}
}
```

如果你想继续通过 npm 临时运行 agent，可以在 `Agent profiles JSON` 中显式配置
`npx`，例如：

```json
{
  "id": "codex",
  "name": "Codex ACP",
  "command": "npx",
  "args": ["-y", "@zed-industries/codex-acp"],
  "env": {}
}
```

</details>

## 基础配置

打开 Zotero 的插件偏好设置，找到 `Zotero Agent Client`。

### Default agent ID

默认使用的 agent ID。默认值是：

```text
claude
```

这个值必须对应 `Agent profiles JSON` 里的某个 `id`。

### Agent profiles JSON

这里配置可用的 agent。默认配置类似下面这样：

```json
[
  {
    "id": "claude",
    "name": "Claude Code ACP",
    "command": "claude-agent-acp",
    "args": [],
    "env": {}
  },
  {
    "id": "codex",
    "name": "Codex ACP",
    "command": "codex-acp",
    "args": [],
    "env": {}
  }
]
```

说明：

- `id`：内部使用的唯一标识，例如 `claude`。
- `name`：显示在侧栏顶部的名字，例如 `Claude Code ACP`。
- `command`：agent 启动命令，可以是 PATH 中的命令，也可以是可执行文件路径。
- `args`：传给 agent 命令的参数。
- `env`：额外环境变量。插件只会传递这里显式配置的值。

## 开始使用

1. 在 Zotero 中打开一篇带有本地 PDF 附件的文献。
2. 进入阅读器。
3. 打开右侧的 `Agent Client` 侧栏。
4. 顶部选择要使用的 agent，例如 `Codex ACP`。
5. 在底部输入框输入问题。
6. 点击 `发送`，或使用快捷键 `Cmd/Ctrl + Enter`。

侧栏输入框里的内容会原样作为你的问题发送给 agent。当前 PDF 和你选择的附件会作
为上下文资源附加，不会用隐藏模板改写你的问题。

你可以问：

- 这篇论文的核心贡献是什么？
- 方法部分有哪些关键假设？
- 作者的实验设计有什么弱点？
- 请把 related work 整理成三点。
- 如果我要复现实验，第一步应该做什么？

## 顶部状态点

侧栏顶部 agent 名称右侧有一个小圆点，用来表示当前状态。

- 灰色：空闲或普通状态。
- 绿色：已连接、正在运行或本轮已完成。
- 红色：出现错误。

把鼠标移到小圆点上，可以查看版本、连接状态和最近日志。

## 附件菜单

输入框左下角的 `+` 按钮可以添加上下文文件。

可选来源：

- `本地文件`：从电脑选择一个文件。
- `文献库文件`：从 Zotero 其他文献中选择本地附件。

如果当前论文 PDF 已被包含，你会在输入框上方看到 PDF 附件标签。你也可以临时
移除它，只让 agent 回答普通问题或只处理额外附件。

## 历史记录

点击顶部 `历史记录` 可以查看当前论文和当前 agent 下的历史话题。选择某个话题
后，可以继续之前的对话。

点击 `新话题` 会为当前论文开启一个新的本地会话。

## 清除本地缓存

如果侧栏状态异常，或你想清空本地聊天记录：

1. 打开 Zotero 偏好设置。
2. 找到 `Zotero Agent Client`。
3. 点击 `Clear Agent Client cache`。
4. 重新打开阅读器标签页。

## 常见问题

### 侧栏提示没有 PDF

请确认当前 Zotero 条目有本地 PDF 附件，并且你是在 Zotero 阅读器中打开这篇
PDF。

### agent 启动失败

先确认 agent 命令在普通终端中可用。默认 Claude Code ACP 配置可以运行：

```sh
claude-agent-acp
```

如果终端中也无法启动，请先安装或修复对应 agent。
如果你配置了自定义 `command`，请在普通终端中用同一组 `command` 和 `args` 先确认
它能启动。

### 一直显示运行中

可以点击发送按钮位置的 `暂停`。如果仍然异常，关闭并重新打开 Zotero 阅读器。

### 需要联网吗

插件本身没有云端服务，但你的 ACP Agent 可能需要联网访问对应模型服务。

### 聊天记录保存在哪里

默认保存在 Zotero profile 内的插件缓存目录。如果你在偏好设置里填写了
`Session store path`，则保存到你指定的位置。

## 隐私说明

- 插件不会把内容发送到自己的服务器。
- 插件会把当前 PDF 和你选择的附件传给本机 ACP Agent。
- ACP Agent 后续如何处理内容，取决于你使用的 agent 和模型服务。
- 聊天记录保存在本地。

## 本地开发启动

开发时建议让 scaffold 启动 Zotero，并显式指定 Zotero 程序路径和当前测试
profile。这样会使用现有配置文件，并把 `.scaffold/build/addon` 安装成临时插件：

```powershell
$env:ZOTERO_PLUGIN_ZOTERO_BIN_PATH = "C:\Program Files\Zotero\zotero.exe"
$env:ZOTERO_PLUGIN_PROFILE_PATH = "C:\Users\<user>\AppData\Roaming\Zotero\Zotero\Profiles\piko4o23.default"
$env:ZOTERO_PLUGIN_DATA_DIR = "C:\Users\<user>\AppData\Roaming\Zotero\Zotero"
npm start
```

如果只需要手动启动同一个 Zotero profile，而不安装/热重载临时插件，可以运行：

```powershell
Start-Process -FilePath "C:\Program Files\Zotero\zotero.exe" -ArgumentList @(
  "--purgecaches",
  "no-remote",
  "-profile",
  "C:\Users\<user>\AppData\Roaming\Zotero\Zotero\Profiles\piko4o23.default",
  "--jsdebugger",
  "-start-debugger-server",
  "65188"
)
```

## 许可证

本项目使用 AGPL-3.0-only 许可证。详见 [LICENSE](./LICENSE)。
