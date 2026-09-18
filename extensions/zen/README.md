# Pi Zen

![](https://img.51ai.vip/2026-08-06-03.25-ykw9R4m0.gif)

Pi 终端 UI 的"禅模式"展示层扩展。开启后,对话记录只保留**结果**,中间过程全部不显示:

| 对话记录里的行 | Zen 开启时 |
|---|---|
| 用户消息 | 显示 |
| 思考块(thinking) | 不显示(不受 Pi 的 `hideThinkingBlock` / `Ctrl+T` 影响) |
| 工具行(调用行 + 输出文本) | 不显示(任何工具,不只内置的 7 个) |
| 图片类工具结果 | 显示(去掉调用壳) |
| 带工具调用的 assistant 消息(中间步骤) | 不显示(文字与思考都不渲染) |
| 最后一条不带工具调用的 assistant 消息(结果) | 显示(只去掉思考块) |
| 工具失败的行 | **显示**(按 Pi 原样渲染) |
| 响应被截断 / 被中断 / 报错 | **显示**(Pi 自带提示) |

另外,默认工作等待指示器被替换为一条小鱼在水波间游动。

**不影响**:`/export`、`/share`、会话存储、模型上下文、工具的执行本身。仅做展示层过滤,不拦截、不改写、不重排任何语义输入或工具执行。

## 安装

```bash
# 从 git 仓库(本仓库)安装
pi install git:https://github.com/chenweil/playpi.git

# 或克隆后用本地路径试运行
pi -e <path-to-playpi>
```

> Pi 会读取仓库根 `package.json` 的 `pi.extensions` 字段加载扩展,入口是 `./extensions/zen/index.ts`。

## 使用

启动 Pi,在对话窗口输入:

```
/zen
```

切换 Zen 的开关状态。状态会持久化到 `~/.pi/agent/zen`(`on` / `off`),下次启动自动恢复。

### 手动控制持久化状态

```bash
# 写入 ~/.pi/agent/zen
echo on > ~/.pi/agent/zen   # 启用
echo off > ~/.pi/agent/zen  # 停用
```

### 与旧版 Calm 的兼容

如果之前用 Calm 扩展(`~/.pi/agent/calm`),首次启用 Zen 时会自动把旧状态迁移到 `zen` 文件,旧文件保留不动。

## 验证

本扩展验证通过的 Pi 版本:`0.85.1`。

两个适配器各自探测它 patch 的公开 API,缺失时只关闭那一项并给出诊断,不影响其余功能。

工具行不再按工具名/来源区分:Zen 开启时所有工具行都隐藏,只有 `isError` 的那一行交回 Pi 原样渲染(这也是 Pi 上报工具失败与中断/报错步骤的地方)。Pi 0.85 把内置工具渲染器拆到 `core/tools/renderers` 后,`InteractiveMode.getRegisteredToolDefinition()` 交给 `ToolExecutionComponent` 的是 `withBuiltInRenderers()` 生成的合并副本——旧版靠对象身份判定内置工具的写法会在这条路径上静默失效,因此该判定已整体去掉。

### 已知取舍

- Zen 开启时 `Ctrl+T`(显示/隐藏思考块)无法显示思考块。要看思考过程先 `/zen` 关闭。
- 其它扩展如果依赖工具行可见性(例如在工具行上叠加自己的展示),那些展示在 Zen 开启时也会一起消失;工具执行本身不受影响。

如果未来 Pi 移除了它依赖的 API,Zen 会只关闭对应那一项,其余功能继续可用,并在终端给出明确诊断。

## 协议

MIT. 见 `LICENSE`。原作者 Kun Chen,改编自 Firstmate 项目的 Zen 实现。
