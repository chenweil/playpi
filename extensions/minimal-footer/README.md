# Pi Minimal Footer

3 行式自定义 footer，替换内置 footer，尽量把常用信息压在一屏内。

```
~/project  git:main±
session:01abc
[#####.....] 40% • 200K  CH98.0% • 24 t/s  anthropic • claude-sonnet-4-5 (high)
```

## 布局

| 行 | 内容 |
|---|---|
| 1 | 当前目录路径 (`~/project`,项目名高亮) · `git:branch±`（有未提交改动时带 `±`） |
| 2 | `session:<sessionID>` |
| 3 | `[##########] 40% • 200K`（上下文用量条 · 窗口大小）· `CH…% • … t/s` · `provider • model (thinking) • goal` |

模型名在第 3 行**末尾**。超宽时按列压缩：优先保住左边的上下文条与中间的 CH / t/s，先压模型名中间，最后才截断。

## 第 3 行的来源

CH（缓存命中率）与 t/s（输出速率）**由 [token-rate](../token-rate/) 扩展发布**，本扩展只负责读取排版：

- 通过 `footerData.getExtensionStatuses()` 读 `cache-hit` 与 `token-rate` 两个 key；
- 本扩展**不再自己计算**，避免两份口径不一致；
- 未安装 token-rate、或还没有已完成的回答时，第 3 行中列留空；
- 值为空串/`undefined` 时不产生多余的 ` • ` 分隔符。

## Pi 升级时怎么坏

本扩展读的是 Pi 的 `footerData`（`ReadonlyFooterDataProvider`）。它是内部接缝，但**不会一处坏、整块死**——三个方法各自探测，缺哪个只丢对应那一项：

| 缺失的接缝 | 表现 | 影响其他部分 |
|---|---|---|
| `getGitBranch()` | 第 1 行 git 后缀消失 | 否 |
| `getExtensionStatuses()` | CH / t/s / goal 消失 | 否 |
| `onBranchChange()` | 丢掉分支变化重渲染订阅（`refreshDirty` 兵底） | 否 |

所以上游改形状时， footer 主体仍会渲染，凭肉眼就能看出少了哪项，而不是一片空白。这和 [zen](../zen/) 的「探测 + 单点降级」是同一个模式。

## 安装

本扩展会**替换内置 footer**，属于个人偏好，因此**不随 playpi 捆绑包安装**——它不在仓库根 `package.json` 的 `pi.extensions` 里，`pi install` 整仓不会带上它。

正确用法是在全局扩展目录里放一个指向本仓库的软链，让仓库成为唯一事实源：

```bash
ln -sfn <path-to-playpi>/extensions/minimal-footer/index.ts ~/.pi/agent/extensions/minimal-footer.ts
```

pi 启动时会扫描全局扩展目录下的 `*.ts` / `*.js`，**软链同样会被识别**。改动后重启 pi 生效。

> 注意：**不要**把它同时加进仓库根 `package.json` 的 `pi.extensions`。那样同一份代码会被加载两次，两个 `ctx.ui.setFooter()` 相互覆盖，且 git 状态探测会跑两遍。

## 依赖

| 依赖 | 说明 |
|---|---|
| [token-rate](../token-rate/)（playpi 包） | 提供第 3 行中列的 `cache-hit` / `token-rate` 状态；缺失时该列留空 |
| `git` 命令 | 第 1 行的分支与 `±` 脏标记；非 git 目录自动隐藏标记 |
| `@earendil-works/pi-tui` | `visibleWidth()` / `truncateToWidth()` 排版工具 |

## 兼容性

- 会话被替换/重载（`/new`、`/fork`、`/reload` 等）后，捕获的 `pi` 会失效，此时 `pi.exec` 会**同步**抛出 stale ctx 错误（`.catch()` 接不住），第 1 行的 git 探测已整体兜底，不会中断渲染。
- 非交互模式（`--print` / JSON / RPC）下不渲染 footer，扩展本身不会报错。
- 已验证 Pi 1.3.0。

### 已知问题

- 会话被替换/重载(`/new`、`/resume`、`/fork`、`/reload`)的瞬间,内置 footer 会短暂闪现再换回自定义 footer(上游 issue #11025,已关闭未修)。持续约 20~70ms,取决于扩展加载数量,不影响功能。

## 协议

MIT License，见 [LICENSE](./LICENSE)。
