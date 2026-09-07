# liang-plugins

个人 [ZCode](https://z.ai) 插件仓库（marketplace）。

- **code-review** — 只读审查子智能体 `review` + `/review` 命令，范围支持未提交改动（默认）、指定 commit、分支差异、GitHub PR；多角度审查（bug、历史上下文、注释契约），每条问题上报前逐条复核过滤误报。
- **code-simplifier** — 精简子智能体 `simplify` + `/simplify` 命令，对最近改动的代码（默认未提交改动，可指定 commit、分支或文件）做保功能重构：降低嵌套、消除冗余、统一项目规范；只改怎么做不改做什么，改完自检编译与测试。
- **title** — `/title`，10 字内标题总结本次会话。
- **only-chat** — `/only-chat`，只回答，禁止写入/编辑/删除；只读命令与联网查询不受限。
- **any-search** — 把 AnySearch MCP 服务器打包成插件（http + `Authorization` 请求头），随插件启停加载。

## 安装与生效

1. 设置 → 插件 → 创建 → 添加插件市场，填 `~/Desktop/github/zcode-plugins`。
2. 在「个人」分段安装需要的插件（新装默认启用），开新会话验证。

插件是**复制**到 `~/.zcode/cli/plugins/cache/` 加载的，改仓库源文件不会立即生效，改完到市场源面板**刷新该市场**并重装。

发版要同时改 `marketplace.json` 条目和 `plugin.json` 的 `version`——「检查更新」拿前者比后者。
