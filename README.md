# playpi

![](https://img.51ai.vip/2026-08-06-03.25-ykw9R4m0.gif)

Pi agent 扩展集合仓库。每个扩展是独立的子包,可单独安装使用,也可整体装一次拿到全部。

## 安装

```bash
# 整体安装(安装根 pi.extensions 里声明的全部扩展)
pi install git:https://github.com/chenweil/playpi.git

# 试运行,不写入 settings (克隆到本地后,从仓库根目录运行)
pi -e <path-to-playpi>
```

安装后 pi 会读取仓库根 `package.json` 的 `pi.extensions` 字段加载所有扩展。

## 扩展列表

| 扩展 | 简介 | 安装后命令 |
|---|---|---|
| [zen](./extensions/zen/) | 禅模式展示层:只显示结果——思考、工具行、非最终回答全部隐藏,出问题(工具失败/截断/中断/报错)时才显示。仅展示层,不影响 /export /share / 会话存储。 | `/zen` |
| [token-rate](./extensions/token-rate/) | 状态行扩展:把当前模型的 output tokens/s 与缓存命中率(CH)发布到状态行。只调 `ctx.ui.setStatus()`,不接管 footer,可与任何自定义 footer 共存。 | 无(自动生效) |
| [minimal-footer](./extensions/minimal-footer/) | 3 行式自定义 footer:分支±、上下文进度条、provider·model·thinking·goal、sessionID,第 3 行展示 token-rate 发布的 CH 与 t/s。**不随捆绑包安装**(会替换内置 footer),需手动软链到 `~/.pi/agent/extensions/`。 | 无(自动生效,替换内置 footer) |

每个扩展子目录里都有独立的 `README.md`,写明详细用法与配置。

## 开发与验证

三道自动关卡,改完依次跑过:

```bash
npm test          # 全部单测:token-rate 口径 + zen 过滤规则 + 扩展加载冒烟
npm run typecheck # 用当前 Pi 的类型定义检查三个扩展
npm run smoke     # 只跑加载冒烟:三个扩展能否加载、session_start 能否跑通
```

单测放在各扩展的 `lib/*.test.ts`,跨扩展的加载冒烟放在 `tests/`。测试会把 `PI_CODING_AGENT_DIR` 指向临时目录,不会读写你真实的 `~/.pi/agent/zen`。

Pi 升级后除了跑这三道关卡,还要手工过一遍:`/zen` 开启时失败的工具行必须可见、成功的工具行必须不可见,以及 `/export` 出来的文件必须是完整原文。详见 `docs/pi-usage-notes.md` 的「Pi 版本兼容复核」。

## 协议

仓库内所有内容均为 MIT License,见各子目录的 `LICENSE` 文件。

## 添加新扩展

约定布局:在 `extensions/<name>/` 下放独立子包,自带 `index.ts`、`lib/`、`LICENSE`、`README.md`、`package.json`(可选)。然后在仓库根 `package.json` 的 `pi.extensions` 数组里追加新扩展的入口路径。

例外:会**替换内置 UI** 的个人偏好扩展(如 `minimal-footer`)不进 `pi.extensions`,否则整仓安装会强制换掉别人的 footer;这类扩展改为在全局扩展目录里软链仓库文件(见该扩展的 README)。
