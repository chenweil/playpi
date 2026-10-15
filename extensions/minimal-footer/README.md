# Pi Minimal Footer

3 行式自定义 footer，替换内置 footer，尽量把常用信息压在一屏内。

```
~/project (git:main±)
session:01abc
CH98.0% • 24 t/s • ~/project
```

## 布局

| 行 | 内容 |
|---|---|
| 1 | `git:branch±`（有未提交改动时带 `±`）· `[##########] 40% • 200K`（上下文用量条 · 窗口大小）· `provider • model (thinking) • goal` |
| 2 | `session:<sessionID>` |
| 3 | `CH…% • … t/s • 路径` |

超宽时按列压缩：优先保住中间的上下文条与左边的分支，先压模型名中间，最后才截断。

## 第 3 行的来源

CH（缓存命中率）与 t/s（输出速率）**由 [token-rate](../token-rate/) 扩展发布**，本扩展只负责读取排版：

- 通过 `footerData.getExtensionStatuses()` 读 `cache-hit` 与 `token-rate` 两个 key；
- 本扩展**不再自己计算**，避免两份口径不一致；
- 未安装 token-rate、或还没有已完成的回答时，第 3 行退化为只显示路径；
- 值为空串/`undefined` 时不产生多余的 ` • ` 分隔符。

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
| [token-rate](../token-rate/)（playpi 包） | 提供第 3 行的 `cache-hit` / `token-rate` 状态；缺失时该行只显示路径 |
| `git` 命令 | 第 1 行的分支与 `±` 脏标记；非 git 目录自动隐藏标记 |
| `@earendil-works/pi-tui` | `visibleWidth()` / `truncateToWidth()` 排版工具 |

## 兼容性

- 会话被替换/重载（`/new`、`/fork`、`/reload` 等）后，捕获的 `pi` 会失效，此时 `pi.exec` 会**同步**抛出 stale ctx 错误（`.catch()` 接不住），第 1 行的 git 探测已整体兜底，不会中断渲染。
- 非交互模式（`--print` / JSON / RPC）下不渲染 footer，扩展本身不会报错。
- 已验证 Pi 1.1.0。

## 协议

MIT License，见 [LICENSE](./LICENSE)。
