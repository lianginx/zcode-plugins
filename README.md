# liang-plugins

个人 [ZCode](https://z.ai) 插件仓库（marketplace）。

- **code-review** — 只读审查子智能体 `review` + `/review` 命令，范围支持未提交改动（默认）、指定 commit、分支差异、GitHub PR；多角度审查（bug、历史上下文、注释契约），每条问题上报前逐条复核过滤误报。
- **code-simplifier** — 精简子智能体 `simplify` + `/simplify` 命令，对最近改动的代码（默认未提交改动，可指定 commit、分支或文件）做保功能重构：降低嵌套、消除冗余、统一项目规范；只改怎么做不改做什么，改完自检编译与测试。
- **title** — `/title`，10 字内标题总结本次会话。
- **only-chat** — `/only-chat`，只回答，禁止写入/编辑/删除；只读命令与联网查询不受限。
- **any-search** — 把 AnySearch MCP 服务器打包成插件（http + `Authorization` 请求头），随插件启停加载。
- **context7** — 把 Context7 远程 MCP 服务器打包成插件（http + `Authorization` 请求头），从源码仓库拉取最新版本文档与代码示例；API Key 在插件详情填，留空匿名使用。
- **imessage** — 两个技能，基于 [imsg](https://github.com/openclaw/imsg) CLI 读写本机 Messages.app（列会话/读搜历史/监听/发送/附件）。`imessage`：交互收发，发送前强制向用户复述收件人与内容；`imessage-notify`：定时任务无人值守向固定预授权收件人汇报任务结果，收件人与内容来源双锁定。仅 macOS，需 `brew install steipete/tap/imsg` 与完全磁盘访问、自动化权限。
- **workspace-guard** — 工作区围栏（白名单快速通道）：`PreToolUse` 钩子监控全部工具调用，**搭配「完全访问」权限模式**使用——底座全放行，插件即权限模式本身。`PreToolUse` 钩子免确认放行：工作区内读写（文件工具与 `Bash`，含 `..`/软链消解）、参数不含路径特征的 `mcp__*` 工具（结构判定不认名字，新装网络类 MCP 自动免确认）、内置 WebFetch/WebSearch、会话内工具（待办、`Agent`/`Skill`/定时任务管理等——只操纵对话状态，子智能体与定时任务的真实工具调用会在各自会话里再过一遍钩子）；统一弹人工确认（无弃权、fail-closed）：区外读写、含路径特征的 MCP 参数、未列入放行清单的未知工具、异常输入。弹窗点「始终允许本项目」后，插件会代查 ZCode 规则表（`local_setting` 的 permission/ruleset）——同样的命令原文或 `前缀:*`、整工具规则此后静默放行。静态扫描与结构判定可被刻意伪装绕过，是工作区围栏不是沙箱。

## 安装与生效

1. 设置 → 插件 → 创建 → 添加插件市场，填 `~/Desktop/github/zcode-plugins`。
2. 在「个人」分段安装需要的插件（新装默认启用），开新会话验证。

插件是**复制**到 `~/.zcode/cli/plugins/cache/` 加载的，改仓库源文件不会立即生效，改完到市场源面板**刷新该市场**并重装。

钩子类插件（workspace-guard）额外注意：桌面版对钩子有**信任审查**这道门，安装后若设置中出现钩子审核提示需点「信任」；且钩子在**会话开始时快照**，装完必须开新会话才生效。

发版要同时改 `marketplace.json` 条目和 `plugin.json` 的 `version`——「检查更新」拿前者比后者。
