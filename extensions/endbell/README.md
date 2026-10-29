# Pi EndBell 事件提示音

在 Pi 的若干关键时刻播放本地提示音（macOS 用 `afplay`），让你不盯屏幕也知道 agent 现在是什么状态。

| 事件 | 触发点 | 覆盖用的环境变量 |
|---|---|---|
| subagent 开启 | `tool_call`，工具名为 `subagent` | `ENDBELL_SUBAGENT` |
| 工具执行出错 | `tool_execution_end`，`isError=true` | `ENDBELL_ERROR` |
| 需要你选择/输入 | `ui_prompt_start`（`select`/`confirm`/`input`/`editor`） | `ENDBELL_PROMPT` |
| 一轮对话结束 | `agent_settled` | `ENDBELL_DONE` |

手动终止（Ctrl-C / abort）时 `agent_settled` 的 `aborted` 为 `true`，这时**不播**结束铃，避免打断手头的事。

## 安装

**随整仓安装自动生效**，不需要单独配置：

```bash
pi install git:https://github.com/chenweil/playpi.git
```

endbell 已登记在仓库根 `package.json` 的 `pi.extensions` 数组里，装完就跟着 zen、token-rate 一起被 Pi 加载。

本地试运行（不写入 settings）：

```bash
pi -e <path-to-playpi>
```

## 为什么结束铃用 agent_settled 而不是 agent_end

`agent_settled` 从 finally 块发出，同样覆盖**中止**和**失败**场景；而 `agent_end` 之后可能还有重试、压缩重试或排队的消息会再开一跑，不能算「这一轮结束」。所以用 `agent_settled` 才能真正表示「你可以开始说话了」。

## 换铃声

四种声音各有一个环境变量可以单独覆盖，不设就用默认值：

```bash
export ENDBELL_SUBAGENT=/path/to/your.wav
export ENDBELL_ERROR=/path/to/your.wav
export ENDBELL_PROMPT=/path/to/your.wav
export ENDBELL_DONE=/path/to/your.wav
```

默认铃声目前指向维护者本机的绝对路径（`~/Music/bell/` 下的 mixkit 素材），**别人装上不会有声音**——用自己的环境变量覆盖一下即可。播放失败（文件不存在等）会被静默忽略，不影响会话。

只有 macOS 生效（用 `afplay`）。mac 之外的平台需要自己改 `pi.exec` 的播放命令。

## 去重

同一种声音在 800ms 冷却窗口内只响一次，避免低层多 run 承载时连环响成噪音。
