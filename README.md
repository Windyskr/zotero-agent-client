# Zotero Agent Client

Zotero Agent Client 是一个 Zotero 阅读器侧栏插件。它可以把当前论文的本地
PDF 发送给你电脑上的 ACP Agent，让你在 Zotero 里直接向论文提问、追问和整理
思路。

这个插件不提供云端服务，也不需要注册插件账号。它只负责连接你本机已经可运行
的 ACP Agent，例如 Codex ACP 或 Claude ACP。

## 适合谁使用

- 你经常在 Zotero 里阅读论文，希望直接围绕当前 PDF 提问。
- 你已经在本机配置了可用的 AI/Agent 工具。
- 你希望聊天记录跟随论文保存在本地，而不是上传到插件服务器。

## 使用前准备

1. 安装 Zotero 8 或更新版本。
2. 安装 Node.js，确保系统里可以使用 `npx`。
3. 准备一个可用的 ACP Agent。插件默认提供两个配置：
   - Codex ACP：`npx -y @zed-industries/codex-acp`
   - Claude ACP：`npx -y @zed-industries/claude-agent-acp`

如果 agent 需要登录或授权，请先按照对应 agent 的说明在本机完成配置。插件不会
替你登录第三方服务。

## 安装插件

1. 下载插件的 `.xpi` 文件。
2. 打开 Zotero。
3. 进入 `工具` -> `插件`。
4. 点击右上角齿轮菜单，选择 `Install Add-on From File...`。
5. 选择下载好的 `.xpi` 文件。
6. 按 Zotero 提示重启。

安装完成后，你会在 Zotero 偏好设置里看到 `Zotero Agent Client`。

## 基础配置

打开 Zotero 的插件偏好设置，找到 `Zotero Agent Client`。

### Default agent ID

默认使用的 agent ID。默认值是：

```text
codex
```

这个值必须对应 `Agent profiles JSON` 里的某个 `id`。

### Agent profiles JSON

这里配置可用的 agent。默认配置类似下面这样：

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

说明：

- `id`：内部使用的唯一标识，例如 `codex`。
- `name`：显示在侧栏顶部的名字，例如 `Codex ACP`。
- `command`：目前固定使用 `npx`。
- `args`：agent 的 npx 包参数。
- `env`：额外环境变量。普通用户通常可以保持 `{}`。

### Session store path

聊天记录保存路径。普通用户建议留空，插件会自动把记录保存在 Zotero profile 下
的默认位置。

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
- 黄色闪动：agent 正在运行。
- 绿色：本轮已完成。
- 红色：出现错误。

把鼠标移到小圆点上，可以查看具体状态说明。

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

先确认 `npx` 可用。你可以在终端运行：

```sh
npx -y @zed-industries/codex-acp
```

如果终端中也无法启动，请先修复 Node.js、npm、网络或对应 agent 的登录配置。

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

## 许可证

本项目使用 AGPL-3.0-only 许可证。详见 [LICENSE](./LICENSE)。
