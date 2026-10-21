/**
 * Token-rate 与缓存命中率的计算 —— 取「最近一条已完成 assistant message」。
 *
 * 这里只放纯函数和一个小状态容器，不依赖任何 Pi 运行时对象，方便单测。
 *
 * tokens/s: round(usage.output / (elapsedMs / 1000))
 *   elapsedMs 优先取 AssistantMessage.durationMs（Pi 用单调时钟测的
 *   request-start → response-end），缺失时回退 message_start/message_end 的
 *   wall-clock 差值。分子只用 usage.output —— 按 Pi 约定 reasoning 已含在 output 里。
 *
 * CH(缓存命中率): cacheRead / (input + cacheRead + cacheWrite) * 100
 *   口径与 Pi 内置 footer 一致。
 *
 * 展示策略：只在 message_end 计算一次准确值；流式阶段不做字符估算，避免把估算值
 * 和最终值混在一起误导用户。
 */

/** 发布到 footer 状态行的两个 key。内置 footer 按 key 字母序拼接它们。 */
export const STATUS_KEY_CACHE_HIT = "cache-hit";
export const STATUS_KEY_TOKEN_RATE = "token-rate";

/** tokens/s 的最小耗时门槛（毫秒）。低于此值视为噪声，不显示。 */
export const MIN_ELAPSED_MS = 100;

/** 计算所需的最小 message 形状（结构化，避免依赖 Pi 内部类型）。 */
export interface AssistantMessageLike {
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  durationMs?: number;
}

/**
 * 由 output tokens 和耗时毫秒数计算 tokens/s。
 *
 * 返回 null 表示输入无效、不应显示：
 *  - tokens 缺失、非有限、<= 0
 *  - elapsedMs 缺失、非有限、< MIN_ELAPSED_MS
 */
export function computeTokensPerSecond(
  tokens: number | undefined | null,
  elapsedMs: number | undefined | null,
): number | null {
  if (tokens == null || !Number.isFinite(tokens) || tokens <= 0) {
    return null;
  }
  if (elapsedMs == null || !Number.isFinite(elapsedMs) || elapsedMs < MIN_ELAPSED_MS) {
    return null;
  }
  return Math.round(tokens / (elapsedMs / 1000));
}

/**
 * 把速率格式化成简短的 status 文本，例如 "24 t/s"。
 * 没有可显示的速率时返回空串 —— 绝不输出 "0 t/s" 之类的占位符。
 */
export function formatRateText(rate: number | null): string {
  if (rate == null) {
    return "";
  }
  return `${rate} t/s`;
}

/**
 * 计算缓存命中率百分比。
 *
 * 返回 null 表示不该显示：没有用到缓存（cacheRead/cacheWrite 都为 0），
 * 或 prompt 总数为 0。口径与 Pi 内置 footer 的 CH 一致。
 */
export function computeCacheHitPercent(
  usage: AssistantMessageLike["usage"],
): number | null {
  const cacheRead = usage?.cacheRead ?? 0;
  const cacheWrite = usage?.cacheWrite ?? 0;
  if (cacheRead <= 0 && cacheWrite <= 0) {
    return null;
  }
  const prompt = (usage?.input ?? 0) + cacheRead + cacheWrite;
  if (!Number.isFinite(prompt) || prompt <= 0) {
    return null;
  }
  return (cacheRead / prompt) * 100;
}

/** 把命中率格式化成 "CH99.8%"；null 时返回空串（不做占位符）。 */
export function formatCacheHitText(percent: number | null): string {
  if (percent == null) {
    return "";
  }
  return `CH${percent.toFixed(1)}%`;
}

/**
 * 从会话 entry 列表里取最近一条 assistant message（从尾部向前找，命中即返回）。
 * 传入非数组或找不到时返回 null。
 *
 * 用途：重启/恢复会话时扩展收不到历史的 message_end 事件，需要从历史回填。
 */
export function findLastAssistantMessage(entries: unknown): AssistantMessageLike | null {
  if (!Array.isArray(entries)) {
    return null;
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as { type?: string; message?: { role?: string } } | undefined;
    if (entry?.type === "message" && entry.message?.role === "assistant") {
      return entry.message as AssistantMessageLike;
    }
  }
  return null;
}

/**
 * 记录最近一次 assistant message 的两个指标，并对外提供 footer 要用的文本。
 *
 * 状态语义：显示的是「最近一条已完成的 assistant message」。新消息流式期间保留
 * 上一条的完成值（既不空白也不估算），直到新消息完成并被有效数据替换。
 */
export class MetricsStore {
  private startWall = 0;
  // 私有字段与对外的 getter 不能同名，否则 TS 报 Duplicate identifier，
  // 且运行时实例字段会遮蔽原型上的 getter，getter 变成死代码。
  private currentRateText = "";
  private currentCacheHitText = "";

  /** 最近一条已完成 assistant message 的格式化速率，没有时为 ""。 */
  get rateText(): string {
    return this.currentRateText;
  }

  /** 最近一条已完成 assistant message 的格式化命中率，没有时为 ""。 */
  get cacheHitText(): string {
    return this.currentCacheHitText;
  }

  /** 清空两个指标（新会话开始或会话结束时调用）。 */
  clear(): void {
    this.currentRateText = "";
    this.currentCacheHitText = "";
  }

  /** 记录 assistant message 开始时刻（durationMs 缺失时的 wall-clock 回退基准）。 */
  recordStart(): void {
    this.startWall = Date.now();
  }

  /**
   * 记录一条已完成的 assistant message。
   *
   * 有效数据会替换当前显示；无效数据（缺 usage、耗时过短、未命中缓存）会清空
   * 对应指标 —— 因为「最近一次 message」本身没有可显示的值。
   *
   * @returns 任一指标是否变化（变化时调用方应更新 status）。
   */
  recordEnd(message: AssistantMessageLike | undefined): boolean {
    const usage = message?.usage;
    const durationMs = message?.durationMs;
    const elapsedMs =
      typeof durationMs === "number" ? durationMs : Date.now() - this.startWall;

    const nextRate = formatRateText(computeTokensPerSecond(usage?.output, elapsedMs));
    const nextCacheHit = formatCacheHitText(computeCacheHitPercent(usage));

    if (nextRate === this.currentRateText && nextCacheHit === this.currentCacheHitText) {
      return false;
    }
    this.currentRateText = nextRate;
    this.currentCacheHitText = nextCacheHit;
    return true;
  }
}
