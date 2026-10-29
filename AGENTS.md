# AGENTS.md

Pi agent 扩展集合仓库。每个扩展是独立的子包，可单独安装使用，也可整体装一次拿到全部。

## 这是什么

- **目标宿主**：[Pi](https://github.com/earendil-works/pi) coding agent。扩展以 TypeScript 编写，通过根 `package.json` 的 `pi.extensions` 字段被 Pi 发现并加载。
- **全部 MIT License**，每个扩展子目录各带一份 `LICENSE`。
- **只做展示层/状态层**：现有扩展都不接管模型、不改会话数据、不替换 Pi 的工具面。改扩展时不要越过这条线，除非任务明确要求。

## 目录约定

```
extensions/<name>/
├── index.ts        # 扩展入口
├── lib/            # 逻辑与单测（*.test.ts 放这里）
├── LICENSE
├── README.md       # 独立用法与配置
└── package.json    # 可选
```

新增扩展后，**两处都要改**：

1. 根 `package.json` 的 `pi.extensions` 数组追加入口路径
2. 根 `package.json` 的 `files` 数组追加该扩展的发布文件（注意 `lib/*.test.ts` 要用 `!` 排除）

### 例外：会替换内置 UI 的扩展

`minimal-footer` 这类**替换 Pi 内置 footer** 的个人偏好扩展**不进 `pi.extensions`**——整仓安装会强制换掉别人的 footer。它也不进 `files`。这类扩展改为在全局扩展目录里软链仓库文件：

```bash
ln -s /path/to/playpi/extensions/minimal-footer/index.ts ~/.pi/agent/extensions/minimal-footer.ts
```

判断标准：这个扩展会不会顶掉 Pi 自己的 UI？会 → 软链；不会 → 进 `pi.extensions`。

## 三道自动关卡

改完依次跑过，全绿才算完：

```bash
npm test          # 全部单测：token-rate 口径 + zen 过滤规则 + 扩展加载冒烟
npm run typecheck # 用当前 Pi 的类型定义检查所有扩展
npm run smoke     # 只跑加载冒烟：扩展能否加载、session_start 能否跑通
```

这三道已在 GitHub Actions 上跑（`.github/workflows/ci.yml`，push / PR / 每日 01:00 UTC）。本地 `node_modules` 里的 Pi 版本可能落后于已发布的 `pi` CLI，**本地全绿不等于新版本可用**，以 CI 的「Pi 校验基线」为准。

`npm test` 与 `npm run smoke` 会把 `PI_CODING_AGENT_DIR` 指向临时目录，**不会读写真实的 `~/.pi/agent/zen`**。

`typecheck` 不是可选项：Pi 1.3.0 的 `ExtensionAPI` 上**没有** `cwd`（只有 `ctx.cwd`），Pi 从 0.84 起就没这个属性——`pi.cwd` 一直是 `undefined` 就是靠类型检查才发现的。

## Pi 升级后的手工复核

自动关卡过了不等于能用。Pi 升级后还要手工过一遍：

1. 启动 pi，footer 三行是否齐全（分支± / 上下文进度条 / provider·model·thinking / sessionID / CH+t/s）
2. `/zen` 开启后跑一个**会失败**的命令：失败行必须可见 —— 这是 zen 的核心承诺，最容易被改坏的一条
3. `/zen` 开启后跑一个**会成功**的命令：工具行必须不可见，最终回答可见
4. `/export` 一个文件，确认里面是**完整原文**（含工具调用与工具输出），不是 Zen 过滤后的展示结果

详见 `docs/pi-usage-notes.md` 的「Pi 版本兼容复核」。

## 已知上游坑（不要重复踩）

- **空 `setHiddenThinkingLabel("")` 不会隐藏思考块**（上游 issue #11152，已关闭未修）。Pi 1.3.0 对空标签仍会多画两行空白。Zen 靠的是「从展示副本里删掉 thinking block」，空标签只当「组件归 Zen 管」的标记——**别改成只设标签**。
- **会话替换时内置 footer 会闪现**（上游 issue #11025，已关闭未修）。`/new`、`/resume`、`/fork`、`/reload` 瞬间内置 footer 会短暂出现再换回，约 20~70ms，不影响功能。
- `peerDependencies` 统一写成 `>=0.85.0 <2.0.0`。Pi 不校验 peer 版本范围，但过窄的范围会让外部安装者拿到错误信息。

## 外部参考

查 Pi 的行为、API、生态时按这个顺序，不要凭记忆猜：**官方文档 → 官方 GitHub（源码与上游 issue）→ 官方包市场 → 社区目录**。

- 官方文档：https://pi.dev/docs/latest
- 官方 GitHub：https://github.com/earendil-works/pi
- 官方包市场：https://pi.dev/packages
- 社区目录 Pi Index：https://piindex.dev
- 中文蓝皮书：https://pi.xiaomovps.com

各站点用途与用法约定见 `docs/pi-usage-notes.md` 的「外部参考资源」。

## 开发约定

- 依赖 Pi 内部组件时，**尽量通过公开 seam 安装适配器**，不要强依赖私有实现。这样 Pi 升级时适配器可以单独降级，而不是整个扩展失效。
- 调试顺序：先确认入口能被 Pi 发现（`pi.extensions` 路径是否正确），再看扩展是否真的执行（关注终端输出和错误诊断，尤其是 `registerCommand`、适配器安装失败等提示）。
- 项目级配置优先于全局配置，不要把测试环境配置写进会被提交的文件里；只提交配置模板。
- 不要把 provider key 硬编码进扩展或脚本，走环境变量或 Pi 的配置机制。

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
