# Pi Token Rate

把当前模型的 **output tokens/s** 和 **缓存命中率(CH)** 发布到 Pi 的状态行。

这是一个纯 **statusline 扩展**：只调用 `ctx.ui.setStatus()` 发布状态，**不接管 footer**。因此它和任何自定义 footer 都能共存 —— 内置 footer 会把状态渲染到第三行；你自己的 footer 扩展可以读取 `footerData.getExtensionStatuses()` 自行消费。

## 显示

内置 footer 下（`cache-hit` 与 `token-rate` 按 key 字母序拼接成第三行）：

```
~/project (main)
↑1.2K ↓856 R2.0K 40.2%/128K (auto)                      gpt-5 • medium
CH98.0% 24 t/s
```

自定义 footer 里可以只取其中一项，或按自己的排版摆放（见下面「消费状态」）。

## 口径

取**最近一条已完成的 assistant message**：

| 指标 | 公式 | 不显示的时机 |
|---|---|---|
| `24 t/s` | `round(usage.output / (elapsedMs / 1000))` | `usage.output` 缺失/≤0；耗时缺失或 < 100ms |
| `CH98.0%` | `cacheRead / (input + cacheRead + cacheWrite)` | 未用到缓存（`cacheRead` 与 `cacheWrite` 都为 0） |

- 耗时优先取 `AssistantMessage.durationMs`（Pi 用单调时钟测的 request-start → response-end），缺失时回退 `message_start` → `message_end` 的 wall-clock 差值。
- 分子只用 `usage.output`。按 Pi 约定 `reasoning` 已包含在 `output` 内，不重复相加。
- **不做流式估算**：只在 `message_end` 计算一次准确值。流式期间保留上一条的完成值（既不空白，也不把估算值和最终值混在一起）。
- 数据无效时**清除**该项，绝不显示 `0 t/s` 之类的占位符。
- **恢复会话时从历史回填**：重启/恢复会话不会收到历史的 `message_end` 事件，因此 `session_start` 会从会话历史里取最近一条 assistant message 回填，状态行不会空白。

## 安装

```bash
# 从 git 仓库安装（本仓库）
pi install git:https://github.com/chenweil/playpi.git

# 或本地试运行
pi install /path/to/playpi
```

## 发布的状态

| key | 文本 | 说明 |
|---|---|---|
| `cache-hit` | `CH98.0%` | 缓存命中率，未命中时不发布 |
| `token-rate` | `24 t/s` | 输出速率，数据无效时不发布 |

两个 key 都用 `undefined` 清除（即 `ctx.ui.setStatus(key, undefined)`）。会话开始时清空，结束时清除。

## 消费状态

在你自己的 footer 扩展里读取：

```ts
ctx.ui.setFooter((tui, theme, footerData) => ({
  render(width: number): string[] {
    const statuses = footerData.getExtensionStatuses?.() ?? new Map();
    const cacheHit = statuses.get("cache-hit");   // "CH98.0%" 或 undefined
    const rate = statuses.get("token-rate");      // "24 t/s" 或 undefined
    const parts = [cacheHit, rate].filter(Boolean);
    return [parts.join(" • ")];
  },
}));
```

注意：`getExtensionStatuses()` 返回的是 `Map<key, text>`，未发布时 `get()` 返回 `undefined`。

## 配置

无需配置。所有指标按固定口径计算，不显示时自动隐藏。

## 兼容性

- 通过 `ctx.ui.setStatus()` 发布，Pi 自动触发重绘，扩展本身不需要（也无权）调用 `requestRender`。
- 非交互模式（`--print` / JSON / RPC）下 `setStatus` 是安全的 no-op，扩展不会报错。
- 已验证 Pi 1.3.0。

## 协议

MIT License，见 [LICENSE](./LICENSE)。
