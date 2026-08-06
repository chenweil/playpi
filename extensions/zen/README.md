# Pi Zen

![](https://img.51ai.vip/2026-08-06-03.25-ykw9R4m0.gif)

Pi 终端 UI 的"禅模式"展示层扩展。开启后:

- 折叠的思考块(thinking block)在对话记录中占用 0 行,而非 1 行空白
- 隐藏 Pi 的 7 个内置工具(`read` / `bash` / `edit` / `write` / `grep` / `find` / `ls`)的调用壳,保留工具输出
- 默认工作等待指示器被替换为一条小鱼在水波间游动
- **不影响**:`/export`、`/share`、会话存储、模型上下文、SDK、自定义工具的渲染

仅做展示层过滤,不拦截、不改写、不重排任何语义输入或工具执行。

## 安装

```bash
# 从 git 仓库(本仓库)安装
pi install git:https://github.com/chenweil/playpi.git

# 或克隆后用本地路径试运行
pi -e /Users/chenweilong/playground/playpi

# 本仓库约定: Zen 在 extensions/zen/ 下,需要显式指向该子目录
# (Pi 会自动发现 extensions/ 下的 .ts 扩展,但本仓库布局是 extensions/zen/,所以)
pi install /Users/chenweilong/playground/playpi
```

> Pi 启动时会自动从 `extensions/` 下的 `.ts` / `.js` 文件发现扩展。仓库根目录没有扩展,扩展都在 `extensions/zen/`,把仓库根作为包根即可。

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

本扩展验证通过的 Pi 版本:`0.82.0`。如果未来 Pi 移除了它依赖的 API(展示适配器),Zen 会只关闭对应那一项,其余功能继续可用,并在终端给出明确诊断。

## 协议

MIT. 见 `LICENSE`。原作者 Kun Chen,改编自 Firstmate 项目的 Zen 实现。
