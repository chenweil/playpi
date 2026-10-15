/**
 * Pi Token Rate —— 把当前模型的 output tokens/s 与缓存命中率发布到 footer 状态行。
 *
 * 这是纯 **statusline 扩展**：只通过 ctx.ui.setStatus(key, text) 发布两个状态，
 * 不调用 setFooter，因此不会和其它自定义 footer 冲突。内置 footer 会把状态
 * 按 key 字母序渲染到第三行；自定义 footer（如 minimal-footer）可以自行读取
 * footerData.getExtensionStatuses() 消费它们。
 *
 * 口径（取「最近一条已完成 assistant message」）：
 *   - tokens/s = round(usage.output / (elapsedMs / 1000))
 *     elapsedMs 优先取 AssistantMessage.durationMs（单调时钟），缺失时回退 wall-clock；
 *     reasoning 已含在 usage.output 里，不重复相加。
 *   - CH(缓存命中率) = cacheRead / (input + cacheRead + cacheWrite)，与内置 footer 一致。
 *   - 流式阶段不做字符估算，只在 message_end 计算一次准确值。
 *   - 耗时 < 100ms、无 usage、未命中缓存时不显示（也不显示占位符）。
 *
 * 恢复会话时扩展收不到历史的 message_end 事件，因此 session_start 会从会话历史
 * 回填最近一条 assistant message 的指标，避免状态行空白。
 */
import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  MetricsStore,
  STATUS_KEY_CACHE_HIT,
  STATUS_KEY_TOKEN_RATE,
  findLastAssistantMessage,
  type AssistantMessageLike,
} from "./lib/token-rate.ts";

export default function (pi: ExtensionAPI) {
  const store = new MetricsStore();

  /** 把当前两个指标发布为状态行文本；空值用 undefined 清除该项。 */
  function publish(ctx: ExtensionContext): void {
    // setStatus 内部已触发重绘，这里不需要（也无权）直接 requestRender。
    ctx.ui.setStatus(STATUS_KEY_CACHE_HIT, store.cacheHitText || undefined);
    ctx.ui.setStatus(STATUS_KEY_TOKEN_RATE, store.rateText || undefined);
  }

  pi.on("session_start", (_event, ctx) => {
    // 新会话先清空，再尝试从历史回填（恢复旧会话时状态行不空白）。
    store.clear();
    try {
      const last = findLastAssistantMessage(ctx.sessionManager.getEntries());
      if (last) {
        store.recordEnd(last);
      }
    } catch {
      // 会话管理器不可用时静默跳过，不影响其它扩展的状态行内容。
    }
    publish(ctx);
  });

  pi.on("message_start", (event) => {
    if (!isAssistantMessage(event.message)) {
      return;
    }
    // 只在 durationMs 缺失时才用得到这个 wall-clock 基准。
    store.recordStart();
  });

  pi.on("message_end", (event, ctx) => {
    if (!isAssistantMessage(event.message)) {
      return;
    }
    // message_end 立即刷新，不做节流（没有流式更新，单次更新即可）。
    if (store.recordEnd(event.message as AssistantMessageLike)) {
      publish(ctx);
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    store.clear();
    // 会话结束清掉状态，避免残留到下一个会话。
    publish(ctx);
  });
}

/** 判断事件里的 message 是否是 assistant message。 */
function isAssistantMessage(message: unknown): boolean {
  return (
    message != null &&
    typeof message === "object" &&
    (message as { role?: unknown }).role === "assistant"
  );
}
