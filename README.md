# playpi

![](https://img.51ai.vip/2026-08-06-03.25-ykw9R4m0.gif)

Pi agent 扩展集合仓库。每个扩展是独立的子包,可单独安装使用,也可整体装一次拿到全部。

## 安装

```bash
# 整体安装(包含仓库内所有扩展)
pi install git:https://github.com/chenweil/playpi.git

# 试运行,不写入 settings (克隆到本地后,从仓库根目录运行)
pi -e <path-to-playpi>
```

安装后 pi 会读取仓库根 `package.json` 的 `pi.extensions` 字段加载所有扩展。

## 扩展列表

| 扩展 | 简介 | 安装后命令 |
|---|---|---|
| [zen](./extensions/zen/) | 禅模式展示层:隐藏折叠思考块与内置工具壳,工作指示器换为小鱼动画。仅展示层,不影响 /export /share / 会话存储。 | `/zen` |

每个扩展子目录里都有独立的 `README.md`,写明详细用法与配置。

## 协议

仓库内所有内容均为 MIT License,见各子目录的 `LICENSE` 文件。

## 添加新扩展

约定布局:在 `extensions/<name>/` 下放独立子包,自带 `index.ts`、`lib/`、`LICENSE`、`README.md`、`package.json`(可选)。然后在仓库根 `package.json` 的 `pi.extensions` 数组里追加新扩展的入口路径。
