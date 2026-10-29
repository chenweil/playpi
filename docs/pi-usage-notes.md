# Pi 常用操作笔记

这里记录项目开发中使用 pi 时的踩坑、配置和常用模式。

## 外部参考资源

查 Pi 的行为、API、生态时按这个顺序用，**不要凭记忆猜**。以下链接 2026-10-28 实测均可达。

| 资源 | 地址 | 什么时候用 |
|---|---|---|
| Pi 官方文档 | https://pi.dev/docs/latest | **首选**。安装、模型配置、Session/Context、Skills、Extension、CLI、Settings、环境变量都能查到；扩展 API 有变动以 `Build Extensions` 页为准 |
| Pi 官方 GitHub | https://github.com/earendil-works/pi | 查源码与上游 issue；`packages/coding-agent/docs/` 是官方文档的源文件，改文档前先看它。本仓库记录的 #11152、#11025 都在这里 |
| Pi 官方包市场 | https://pi.dev/packages | 官方收录的 extension / skill / prompt / theme 目录（2026-10 已 5000+ 条）。想复用现成能力先在这里搜，别先自己写 |
| Pi Index | https://piindex.dev | 社区目录，188 条资源、27 个分类，按 subagent、上下文管理、浏览器自动化等专题归类，有中文界面。**独立第三方站点，收录不代表官方背书** |
| Pi 学习蓝皮书 | https://pi.xiaomovps.com | 中文学习路线：安装 → 第一个任务 → Context → Skill/Extension → 长期工作流，另含 Earendil 授权译文。适合新人上手、写扩展前补概念 |

### 用法约定

- **写扩展前**：官方文档的 `Build Extensions` 与 `Build Terminal UI Components` 两页过一遍，比翻源码快。
- **怀疑是上游 bug**：去官方 GitHub 搜 issue，编号写进本文档的「已知上游坑」，别只留在本机。
- **想抄现成的**：先查官方包市场，再查 Pi Index。社区扩展装到本机前先读它的 README 和发布者，不要直接整仓塞进 `pi.extensions`。
- **蓝皮书是第三方教程**（MIT）；与官方文档冲突时以官方文档为准。

## 模型选择与保存

### 踩坑：scoped-models 选择后不保存

**现象**  
用 `scoped-models` 选好了模型，但没有保存，导致每次进入会话都要重新选。

**原因**  
`scoped-models` 只是为当前作用域/会话临时切换模型；如果没执行保存动作，就不会持久化到配置里。

**正确做法**  
- 选完模型后，确认保存到当前作用域配置，而不是只做临时切换。  
- 如果希望某个项目固定使用某个模型，优先改项目级或全局默认模型配置，而不是每次手动 `scoped-models`。  
- 建议把常用模型偏好记在项目的 `.pi` 或对应配置里，避免每次人工选择。

**一句话**  
别只“选完就用”，确认是否已经“保存为当前作用域/项目默认”。

---

## 模型可用性与测试限制

### 问题：OpenCode 免费层报 403

**现象**
调用时返回类似下面的错误：

```text
Error from provider (Console): OpenCode's free tier can only be used from within OpenCode
```

**结论**
这是 provider 的环境/来源限制，不是参数格式错误。该免费层只允许在 OpenCode 官方环境内调用。

**处置**
- 放弃在本地模拟 OpenCode 免费层。
- 测试时改用无来源限制的 provider 验证调用链路。
- 如需继续使用该模型，只在真实 OpenCode 环境内调用。

**后续操作**
在 pi 的全局 provider 配置中移除 OpenCode Zen 的 API 接入，避免误选和无效调用。

**一句话**
403 不是参数错，是 provider 的访问来源限制；测试时优先换 provider，不要硬撞免费层限制。

---

## 常用展示命令

### `/zen`：只看结果

**作用**
开启后只保留最终回答，隐藏思考块、工具执行行和非最终 assistant 消息。

**边界**
- 只改展示层，不改会话数据。
- `/export`、`/share`、会话存储、模型上下文、工具执行本身都不受影响。
- 工具失败行仍会保留并原样渲染，方便定位错误。

**注意**
- Zen 开启时，`Ctrl+T` 无法再显示思考块；要先 `/zen` 关闭。
- 状态会持久化到 `~/.pi/agent/zen`，值为 `on` / `off`。
- 旧版 Calm 扩展的状态文件在首次启用 Zen 时会自动迁移到 `zen`，旧文件保留不动。

### `/export` 与 `/share`

**作用**
- `/export`：导出当前会话/结果。
- `/share`：分享当前会话/结果。

**边界**
- Zen 开启时，`/export` 与 `/share` 拿到的仍然是完整内容，不需要任何额外操作：Pi 1.3.0 的这两个命令直接从会话数据导出 JSONL/HTML，渲染链路不经过 Zen patch 的 TUI 组件，结构上就不会被 Zen 的展示层过滤影响。
- 这两条命令只关心最终导出内容，不关心你平时是否开着 Zen。

---

## 扩展安装与调试

### 整体安装

```bash
pi install git:https://github.com/chenweil/playpi.git
```

安装后 pi 会读取仓库根 `package.json` 的 `pi.extensions` 字段加载所有扩展。

### 本地试运行

```bash
pi -e <path-to-playpi>
```

这会把仓库克隆到本地并从根目录运行，但不会写入 settings。

### 新增扩展约定

在 `extensions/<name>/` 下放独立子包，建议包含：
- `index.ts`
- `lib/`
- `LICENSE`
- `README.md`
- `package.json`（可选）

然后在仓库根 `package.json` 的 `pi.extensions` 数组里追加新扩展入口路径。

### 调试建议

- 先确认扩展入口能被 pi 发现：检查 `pi.extensions` 路径是否正确。
- 再看扩展是否实际执行：关注终端输出和错误诊断，尤其是 `registerCommand`、适配器安装失败等提示。
- 如果依赖 Pi 的某个内部组件/API，尽量通过公开 seam 安装适配器，而不是强依赖私有实现；未来 Pi 版本升级时，适配器可以单独降级，而不是整个扩展失效。

---

## Provider 配置踩坑

### 来源限制型免费层

**现象**
调用某个 provider 时返回 403，提示只能在特定环境内使用。

**判断**
这通常不是参数格式问题，而是 provider 对调用来源做了限制。

**处理方式**
- 本地开发/测试时，换一个无来源限制的 provider 做功能验证。
- 保留受限 provider 到上线环境，而不是用来做日常随意测试。
- 如果要“模仿”某个 provider，重点只仿调用格式和返回结构，不要硬撞它的免费层鉴权。

### API Key 与环境变量

**建议**
- 不同环境使用不同的 provider 配置，不要共用一套 key。
- 不要把 key 硬编码到扩展或脚本里，优先走环境变量或 pi 的配置机制。
- 遇到 401/403 时，先确认 key 来源、环境变量名、以及是否被覆盖。

---

## 项目级配置与环境差异

### 基本原则

- 项目级配置优先于全局配置，避免不同项目互相污染模型和 provider 设置。
- 不要把测试环境的配置写进会被提交到仓库的文件里；只提交配置模板。

### 常见差异点

- **模型偏好**：dev 用便宜/快速模型，prod 用稳定模型。
- **provider**：本地测试可走公开/无限制 provider，线上再切到目标 provider。
- **扩展开关**：某些扩展只适合在特定环境开启。

### 可复用的检查清单

- [ ] 当前项目是否有独立的 `.pi` 或项目级配置？
- [ ] 模型选择是否已保存，而不是临时切换？
- [ ] provider key 是否通过环境变量注入？
- [ ] `/zen` 等展示层设置是否持久化到预期位置？
- [ ] 扩展入口是否已经被 pi 正确发现？

---

## 会话管理与导出后的二次使用

### `/export`
用于把当前会话或结果导出成文件。

### `/share`
用于分享当前会话或结果。

### 注意

- Zen 只过滤终端里的展示层，不改会话数据；`/export`、`/share` 导出的始终是完整原文。
- 导出后的文件如果要二次使用，先确认是否包含完整工具执行链，而不是只有最终结果。
- 如果要在不同环境复用导出结果，注意其中可能包含环境相关的路径、key 或上下文。

---

## Pi 版本兼容复核

### 当前基线

- 本地 `node_modules` 里装的是 Pi `1.3.0`，但已发布的 `pi` CLI 已是 `1.4.0` —— **本地全绿不等于新版本可用**，CI 才是真正的防线。
- 仓库的 zen / token-rate / minimal-footer 已在 Pi 1.3.0 的全屏 TUI 下实测通过；endbell 随包发布较晚，尚未做同等的全屏 TUI 手工复核。
- 每次 CI 运行会在日志与 Summary 里打印 `Pi 校验基线: x.y.z`。对比两次运行的这一行，就能判断回归是「Pi 发版导致的」还是「自己改坏的」。
- `peerDependencies` 统一写成 `>=0.85.0 <2.0.0`：Pi 不会校验 peer 版本范围，但过窄的范围会让外部安装者拿到错误信息。

### 上游两个已知坑

- **空 `setHiddenThinkingLabel("")` 不会隐藏思考块**（上游 issue #11152，10-19 提交，已关闭未修）：Pi 1.3.0 对空标签仍会多画两行空白。Zen 靠的是「从展示副本里删掉 thinking block」，空标签只当「组件归 Zen 管」的标记，别改成只设标签。
- **会话替换时内置 footer 会闪现**（上游 issue #11025，已关闭未修）：`/new`、`/resume`、`/fork`、`/reload` 的瞬间内置 footer 会短暂出现再换回自定义 footer，约 20~70ms，不影响功能。

### 复核方式

三道自动关卡 + 一次手工过一遍：

```bash
npm test          # 全部单测（token-rate 口径 + zen 过滤规则 + 扩展加载冒烟）
npm run typecheck # 用当前 Pi 的类型定义检查所有扩展
npm run smoke     # 只跑加载冒烟：各扩展能否加载、session_start 能否跑通
```

`npm test` 与 `npm run smoke` 都会把 `PI_CODING_AGENT_DIR` 指向临时目录，不会读写你真实的 `~/.pi/agent/zen`。

这三道关卡已挂到 GitHub Actions（`.github/workflows/ci.yml`），在 push、PR、以及每天 01:00 UTC（北京时间 09:00）定时跑。CI 里显式装 `@earendil-works/pi-coding-agent@latest`：本仓的 Pi 是 peerDependency，npm 7+ 会自动装它，显式写出来只是为了把「校验哪一版」摆到明面上。仓库的 `package-lock.json` 保持不入库（对 peerDep 仓来说它只锁 typescript，而 typescript 已在 `devDependencies` 里显式声明）。

Pi 升级后手工过一遍：

1. 启动 pi，footer 三行是否齐全（分支± / 上下文进度条 / provider·model·thinking / sessionID / CH+t/s）。
2. `/zen` 开启后跑一个**会失败**的命令：失败行必须可见 —— 这是 zen 的核心承诺，也是最容易被改坏的一条。
3. `/zen` 开启后跑一个**会成功**的命令：工具行必须不可见，最终回答可见。
4. `/export` 一个文件，确认里面是完整原文（含工具调用与工具输出），不是 Zen 过滤后的展示结果。

类型检查是后加的护栏：Pi 1.3.0 的 `ExtensionAPI` 上没有 `cwd`（只有 `ctx.cwd`），而 Pi 从 0.84 起就没有这个属性，靠类型检查才发现 minimal-footer 里的 `pi.cwd` 一直是 `undefined`。
