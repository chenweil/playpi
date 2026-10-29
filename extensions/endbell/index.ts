/**
 * Pi EndBell —— 事件提示音
 *
 * 为 Pi 的若干关键时刻播放本地提示音（macOS 用 afplay）：
 *   - subagent 开启        tool_call，工具名为 subagent
 *   - 工具执行出错         tool_execution_end，isError=true
 *   - 需要用户选择/输入    ui_prompt_start（select/confirm/input/editor）
 *   - 对话结束             agent_settled（手动终止 Ctrl-C 不播，正常/失败都会响）
 *
 * 选事件说明：
 *   - agent_settled 从 finally 块发出，同时覆盖中止和失败；agent_end 之后可能还有
 *     重试、压缩重试或排队的新消息会再开一跑，不能代表「这一轮对话结束」；其
 *     `aborted` 标志在手动终止（Ctrl-C）时为 true，此时跳过结束铃。
 *   - 需要用户输入时没有专用 console 事件，用 ui_prompt_start 覆盖 Pi 等待用户
 *     阻塞式 UI 询问（select/confirm/input/editor）的场景。
 *
 * 声音可用环境变量覆盖（不设就用下面的默认值）：
 *   ENDBELL_SUBAGENT  ENDBELL_ERROR  ENDBELL_PROMPT  ENDBELL_DONE
 */
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_SOUNDS = {
  subagent: "/Users/chenweilong/Music/bell/short/mixkit-game-balloon-or-bubble-pop-3069.wav",
  error: "/Users/chenweilong/Music/bell/short/mixkit-alert-quick-chime-766.wav",
  prompt: "/Users/chenweilong/Music/bell/short/Notification Sound Effect (3).mp3",
  done: "/Users/chenweilong/Music/bell/mixkit-toy-drums-and-bell-ding-560.wav",
};

/** 每种声音的最小播放间隔（毫秒），避免同一瞬间连环响成噪音。 */
const COOLDOWN_MS = 800;

export default function (pi: ExtensionAPI) {
  const lastPlayedAt = new Map<string, number>();

  async function play(category: keyof typeof DEFAULT_SOUNDS): Promise<void> {
    const now = Date.now();
    // 同一种声音在冷却窗口内只响一次。
    if (now - (lastPlayedAt.get(category) ?? 0) < COOLDOWN_MS) {
      return;
    }
    lastPlayedAt.set(category, now);

    const envKey =
      { subagent: "ENDBELL_SUBAGENT", error: "ENDBELL_ERROR", prompt: "ENDBELL_PROMPT", done: "ENDBELL_DONE" }[
        category
      ]!;
    const sound = process.env[envKey] || DEFAULT_SOUNDS[category];
    await pi.exec("afplay", [sound]).catch(() => {
      // 播不了（比如文件不存在）也不影响会话，静默忽略。
    });
  }

  // 开启 subagent：subagent 工具被调用时响一声。
  pi.on("tool_call", async (event) => {
    if (event.toolName === "subagent") {
      await play("subagent");
    }
  });

  // 工具执行出错：isError=true 时响错误声。
  pi.on("tool_execution_end", async (event) => {
    if (event.isError) {
      await play("error");
    }
  });

  // 需要用户选择/输入：阻塞式 UI prompt 开始时响提示声。
  pi.on("ui_prompt_start", async (event) => {
    if (event.kind !== "custom") {
      await play("prompt");
    }
  });

  // 对话真正落定（正常或失败都会到这一步）时响结束铃；
  // 手动终止（Ctrl-C / abort）回调 `aborted=true`，这时不播，避免打断手头的事。
  pi.on("agent_settled", async (event) => {
    if (event.aborted) {
      return;
    }
    await play("done");
  });
}