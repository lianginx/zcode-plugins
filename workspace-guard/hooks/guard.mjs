// workspace-guard ZCode PreToolUse 钩子：一个「工作区优先」的权限模式。
//
// 推荐搭配【完全访问】权限模式使用：底座完全不拦，本插件即权限模式本身，
// 放行与确认全部由这里决定。在其他权限模式下也能用，弃权项会再经过底座
// 审批，只会更保守，不会冲突。
//
// 决策策略：
//   "allow" -> 确定安全，直接执行、免弹窗：
//     1) 文件工具（Read/Write/Edit/MultiEdit/NotebookEdit/Glob/Grep）的
//        路径解析后在区内（消解 ~、相对路径、.. 与符号链接）；
//     2) Bash 命令里所有路径 token 都在区内（或没有路径）；
//     3) mcp__* 工具的参数值里不含任何路径特征——参数层面碰不到文件，
//        不关联工作目录（结构判定不认名字，新装网络类 MCP 自动免确认）；
//     4) 内置网络工具 WebFetch / WebSearch；
//     5) 会话内工具（TodoWrite/Agent/Skill/TaskOutput/Cron* 等）——只操纵
//        对话状态与任务编排，不直接碰文件系统；子智能体与定时任务的真实
//        工具调用会在各自会话里被本钩子再过一遍；
//     6) 无路径参数的文件工具（操作对象即工作区根）。
//   "ask" -> 需要用户过目，弹确认：
//     1) 路径解析后在区外（文件工具 / Bash token / MCP file_path）；
//     2) MCP 参数含路径特征但形态判不准（如 /vercel/next.js 式标识符）；
//     3) 输入异常、判定出错——闸门自身故障宁可多弹窗，不静默放行。
//   无弃权 -> 判不了的一律 ask（fail-closed）：无法归类的内置工具
//     （未列入放行清单的新工具）、输入异常、判定出错。本插件即权限模式本身，
//     沉默等于放行，所以守卫只在有把握时 allow，其余全部交用户过目。
//
// 如实声明的边界：
//   - "无路径参数 != 绝对安全"：结构判定只回答"碰不碰工作目录"，不回答
//     "有无副作用"（浏览器导航、数据库写入类 MCP 会放行）。
//   - Bash 静态扫描会被变量拼接、命令替换、程序内部开文件绕过——它是
//     权限模式的工作区围栏，不是完整沙箱。

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 输出决策并以 0 退出。钩子输出是严格 schema，多写字段即校验失败。
function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

const allow = (reason) => decide("allow", reason);
const ask = (reason) => decide("ask", reason);

// 返回消解了 `..` 与符号链接的规范化绝对路径。对尚不存在的路径
// （如 Write 新建的文件），回溯到最近的已存在祖先做 realpath 再接回剩余段。
function canonical(absPath) {
  const missing = []; // 自下而上收集的、还不存在的路径段
  let cur = absPath;
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...missing.reverse());
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return absPath; // 已到文件系统根仍不可解析
      missing.push(path.basename(cur));
      cur = parent;
    }
  }
}

const isInside = (root, abs) => abs === root || abs.startsWith(root + path.sep);

// 展开开头的 ~ 到家目录。
const expandTilde = (t) =>
  t === "~" || t.startsWith("~/") ? path.join(os.homedir(), t.slice(1)) : t;

// 从 Bash 命令串里挑出疑似绝对 / 家目录 / 上跳路径的 token。
function pathTokens(cmd) {
  const found = [];
  for (let tok of cmd.split(/[\s;&|()]+/)) {
    tok = tok.replace(/^(?:\d*[<>]|&>)+/, ""); // 剥重定向前缀 >x >>x 2>x &>x
    if (!tok || tok.includes("://")) continue; // 空串与 URL 不是本地路径
    const cands = [tok]; // 整体之外，--flag=/path 与 VAR=/path 的等号右侧也算候选
    const eq = tok.indexOf("=");
    if (eq > 0) cands.push(tok.slice(eq + 1));
    for (const c of cands) {
      const p = c.replace(/^["'`$]+/, "").replace(/["'`.,;:)}\]]+$/g, "");
      const pathish =
        p.startsWith("/") ||
        p.startsWith("~/") ||
        p === "~" ||
        p === ".." ||
        p === "../" ||
        p.startsWith("../");
      if (!pathish) continue;
      if (p === "/dev" || p.startsWith("/dev/")) continue; // 空设备重定向太常见
      found.push(p);
    }
  }
  return found;
}

// 参数值里是否含路径特征（递归扫嵌套对象/数组）。字符串里先剥掉 URL，
// 避免 https:// 之类的斜杠误判；命中条件：串首或分隔符后出现
// / ~/ ~ .. / ..  这类开头。
function hasPathLike(v) {
  if (typeof v === "string") {
    const s = v.replace(/[a-z][a-z0-9+.-]*:\/\/\S*/gi, " ");
    return /(^|[\s"'`(=:,])(\/|~\/|~(?=$|[\s"'`)]|\.)|\.\.(\/|$))/.test(s);
  }
  if (Array.isArray(v)) return v.some(hasPathLike);
  if (v && typeof v === "object") return Object.values(v).some(hasPathLike);
  return false;
}

// 已知的、以路径为核心参数的内置文件工具。
const PATH_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Glob",
  "Grep",
]);

// 内置网络工具：不关联工作目录，直接放行。
const NETWORK_TOOLS = new Set(["WebFetch", "WebSearch"]);

// 会话内工具：只操纵对话状态 / 任务编排，不直接碰文件系统，直接放行。
//   - Agent/SendMessage：子智能体自己会话里的每次工具调用同样被本钩子管，
//     真实文件访问在叶子调用处拦截，入口无需重复拦；
//   - Cron*：只是管理定时任务定义，到点执行时那次会话同样被钩子管；
//   - TaskOutput/TaskStop：读写的是 ZCode 受管临时目录里的任务输出；
//   - AskUserQuestion/ExitPlanMode：弹给用户批的动作，拦它等于自己拦自己。
const SESSION_TOOLS = new Set([
  "TodoWrite", "TodoRead",
  "AskUserQuestion",
  "EnterPlanMode", "ExitPlanMode",
  "Skill",
  "Agent", "SendMessage",
  "TaskOutput", "TaskStop",
  "ReadSessionContext",
  "CronCreate", "CronUpdate", "CronDelete", "CronList",
]);

// —— 桥接底座「始终允许本项目」规则 ——
// 钩子的 PreToolUse 决策跑在客户端权限规则之前，弹窗里点的「始终允许」
// 存进了 ZCode 的 sqlite（local_setting: namespace=permission, key=ruleset），
// 钩子层看不到它，于是这里代查这张表：命中 allow 规则即放行。
// 规则格式：{toolName, ruleContent?}；缺 ruleContent = 整工具放行；
// ruleContent 为 "前缀:*" = 前缀匹配，否则整串精确匹配（Bash 存整条命令原文）。
function loadAllowRules(cwd) {
  try {
    const db = path.join(os.homedir(), ".zcode", "cli", "db", "db.sqlite");
    const projectId =
      "proj_" +
      cwd.replaceAll("/", "-").toLowerCase().replace(/^-+/, "").replace(/[^a-z0-9._-]/g, "-");
    const sql =
      `select value from local_setting where namespace='permission' and key='ruleset' and scope_id='${projectId}';`;
    const out = execFileSync("sqlite3", [db, sql], { encoding: "utf8", timeout: 1500 });
    const rules = [];
    for (const line of out.split("\n")) {
      if (!line.trim()) continue;
      const allowList = JSON.parse(line)?.allow;
      if (Array.isArray(allowList)) rules.push(...allowList);
    }
    return rules;
  } catch {
    return []; // 读不到规则不致命：多弹一次确认，宁保守不误放
  }
}

// subjects：本次调用的候选匹配串（Bash=命令原文；文件工具=原始值+解析后绝对路径）。
function matchesAllow(rules, toolName, subjects) {
  for (const r of rules) {
    if (r.toolName !== toolName) continue;
    const c = r.ruleContent;
    if (!c) return true; // 整工具放行
    for (const s of subjects) {
      if (typeof s !== "string") continue;
      if (c === s) return true;
      if (c.endsWith(":*")) {
        const p = c.slice(0, -2);
        if (s === p || s.startsWith(p + " ") || s.startsWith(p + "\n")) return true;
      } else if (c.endsWith("*") && s.startsWith(c.slice(0, -1))) return true;
    }
  }
  return false;
}

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

// 本插件即权限模式，因此输入判不出的分支 fail-closed 转 ask，不静默放行。
let input = null;
try {
  input = JSON.parse(raw);
} catch {
  ask("workspace-guard：钩子输入不是合法 JSON，请人工确认");
}
if (!input || typeof input !== "object" || typeof input.cwd !== "string") {
  ask("workspace-guard：缺少 cwd 等工作区上下文，无法判定，请人工确认");
}

const toolInput = input.tool_input;
if (toolInput != null && typeof toolInput !== "object") {
  ask("workspace-guard：tool_input 结构异常，请人工确认");
}

// 弹窗前查一次底座规则：在弹窗里点过「始终允许本项目」的会存进
// ZCode 规则表，命中即放行。规则只在可能 ask 时才加载（懒加载）。
let cachedRules = null;
const askRuleAware = (reason, subjects) => {
  cachedRules ??= loadAllowRules(input.cwd);
  if (cachedRules.length && matchesAllow(cachedRules, input.tool_name, subjects))
    allow("命中本项目「始终允许」规则");
  ask(reason);
};

// 区内 allow、区外 ask 的统一入口；判定出错转 ask（fail-closed）。
const judgePath = (target) => {
  try {
    const root = canonical(path.resolve(input.cwd));
    const abs = canonical(path.resolve(input.cwd, expandTilde(target)));
    if (isInside(root, abs)) allow(`路径在工作区内：${abs}`);
    askRuleAware(`路径在工作区外，需用户确认：${abs}`, [target, abs]);
  } catch (err) {
    ask(`workspace-guard：路径判定出错（${err?.message}），请人工确认`);
  }
};

// Bash：所有路径 token 都在区内（或没有）才 allow；任一区外或判不动转 ask。
if (input.tool_name === "Bash") {
  const cmd = toolInput?.command;
  if (typeof cmd !== "string") ask("workspace-guard：Bash 缺少 command 参数，请人工确认");
  let root;
  try {
    root = canonical(path.resolve(input.cwd));
  } catch {
    ask("workspace-guard：工作区根解析失败，请人工确认");
  }
  const escaped = [];
  for (const tok of pathTokens(cmd)) {
    try {
      if (!isInside(root, canonical(path.resolve(input.cwd, expandTilde(tok)))))
        escaped.push(tok);
    } catch {
      ask(`workspace-guard：无法判定路径 ${tok}，请人工确认`);
    }
  }
  if (escaped.length)
    askRuleAware(
      `Bash 命令包含工作区外路径，需用户确认：${escaped.slice(0, 3).join("、")}`,
      [cmd],
    );
  allow("Bash 命令无工作区外路径");
}

// 已知文件工具：file_path / notebook_path / path 取其一；都没有 = 操作工作区根。
if (PATH_TOOLS.has(input.tool_name)) {
  const target =
    toolInput?.file_path ?? toolInput?.notebook_path ?? toolInput?.path ?? null;
  if (target === null) allow("无路径参数，操作对象即工作区根");
  if (typeof target !== "string") {
    ask(`workspace-guard：路径参数不是字符串（${typeof target}），请人工确认`);
  }
  judgePath(target);
}

// 会话内工具先行放行，不进入后续路径判定。
if (SESSION_TOOLS.has(input.tool_name)) allow("会话内工具，不直接碰文件系统");

// 其他工具，按顺序三道闸：
// 1) 字符串 file_path/notebook_path 参数 -> 路径判定；
// 2) mcp__* -> 参数结构判定：无路径特征放行；含路径特征（含路径的库标识符、
//    cwd 参数等）形态判不准，转人工确认；
// 3) 内置网络工具放行。其余工具无法归类、判不了 -> 一律 ask。
const passive = toolInput?.file_path ?? toolInput?.notebook_path;
if (typeof passive === "string") judgePath(passive);
else if (String(input.tool_name).startsWith("mcp__")) {
  if (hasPathLike(toolInput ?? {}))
    askRuleAware("MCP 参数含路径特征，形态无法确证，请人工确认", []);
  allow("MCP 工具参数不含路径特征，不关联工作目录");
} else if (NETWORK_TOOLS.has(input.tool_name)) allow("内置网络工具，不关联工作目录");
else
  askRuleAware(
    `workspace-guard：无法归类工具 ${input.tool_name ?? "?"}，请人工确认`,
    [],
  );
