/**
 * Minimal Footer — 3 行布局
 *
 * 第 1 行: git:branch±  |  [###.......] XX% • 上下文长度  |  接入配置名 • model (thinking) • goal
 * 第 2 行: sessionID (单列)
 * 第 3 行: CH(缓存命中率) • t/s(输出速率) • 路径 (单列)
 *
 * 第 3 行的 CH / t/s 由 token-rate 扩展（playpi 包）通过 ctx.ui.setStatus() 发布，
 * 这里只负责读取并排版，不再自己计算，避免两份重复口径。
 * 依赖 key: "cache-hit" 与 "token-rate"（见 token-rate 的 README）。
 * 未安装该扩展时第 3 行只显示路径。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

type RgbColor = { r: number; g: number; b: number };

type ModelWithThinking = {
  id?: string;
  provider?: string;
  reasoning?: boolean;
  contextWindow?: number;
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
};

const THINKING_LEVELS: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

const EFFORT_COLOR_STOPS: RgbColor[] = [
  { r: 142, g: 142, b: 147 }, // gray
  { r: 52, g: 199, b: 89 },   // green
  { r: 255, g: 214, b: 10 },  // yellow
  { r: 255, g: 159, b: 10 },  // orange
  { r: 255, g: 69, b: 58 },   // red
];

const CONTEXT_COLOR_STOPS: RgbColor[] = [
  { r: 52, g: 199, b: 89 },   // green
  { r: 255, g: 214, b: 10 },  // yellow
  { r: 255, g: 159, b: 10 },  // orange
  { r: 255, g: 69, b: 58 },   // red
];

const PROVIDER_COLORS: Record<string, RgbColor> = {
  anthropic: { r: 191, g: 90, b: 242 },
  openai: { r: 52, g: 199, b: 89 },
  google: { r: 66, g: 133, b: 244 },
  gemini: { r: 66, g: 133, b: 244 },
  github: { r: 175, g: 82, b: 222 },
  copilot: { r: 175, g: 82, b: 222 },
  openrouter: { r: 255, g: 159, b: 10 },
  opencode: { r: 45, g: 212, b: 191 }, // teal
  ollama: { r: 142, g: 142, b: 147 },
  local: { r: 142, g: 142, b: 147 },
};

export default function (pi: ExtensionAPI) {
  let tuiRef: { requestRender(): void } | null = null;
  let thinkingLevel: string = "off";
  let currentModel: ModelWithThinking | undefined;
  let modelId: string | undefined;
  let contextWindow: number | undefined;
  let isDirty = false;
  let sessionId: string = "";

  // Keep values fresh so renders pick up changes immediately
  pi.on("model_select", async (event, _ctx) => {
    currentModel = event.model as ModelWithThinking;
    modelId = event.model.id;
    contextWindow = event.model.contextWindow;
    tuiRef?.requestRender();
  });

  pi.on("thinking_level_select", async (event, _ctx) => {
    thinkingLevel = event.level;
    tuiRef?.requestRender();
  });

  async function refreshDirty() {
    // pi.exec 在会话被替换/重载后会「同步」抛出 stale ctx 错误，.catch() 接不住，
    // 因此这里整体兜底：拿不到结果就保持当前 dirty 状态，不影响 footer 渲染。
    try {
      const insideWorkTree = await pi
        .exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: pi.cwd })
        .catch(() => undefined);

      if (insideWorkTree?.stdout.trim() !== "true") {
        if (isDirty) {
          isDirty = false;
          tuiRef?.requestRender();
        }
        return;
      }

      const result = await pi
        .exec("git", ["diff", "--stat"], { cwd: pi.cwd })
        .catch(() => undefined);
      const resultStaged = await pi
        .exec("git", ["diff", "--cached", "--stat"], { cwd: pi.cwd })
        .catch(() => undefined);
      const dirty =
        (result?.stdout.trim().length ?? 0) > 0 ||
        (resultStaged?.stdout.trim().length ?? 0) > 0;
      if (dirty !== isDirty) {
        isDirty = dirty;
        tuiRef?.requestRender();
      }
    } catch {
      // stale ctx：会话已结束或被替换，忽略。
    }
  }

  pi.on("turn_end", () => {
    void refreshDirty();
  });

  function formatContextWindow(n: number | undefined): string {
    if (!n) return "";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
    return `${n}`;
  }

  function middleTruncatePath(path: string, maxWidth = 42): string {
    if (visibleWidth(path) <= maxWidth) return path;

    const parts = path.split("/").filter(Boolean);
    const isHomePath = path.startsWith("~/");
    const isAbsolutePath = path.startsWith("/");
    const first = parts[0] === "~" ? parts[1] : parts[0];
    const last = parts[parts.length - 1];

    if (!first || !last) return truncateToWidth(path, maxWidth);

    const prefix = isHomePath
      ? `~/${first}`
      : isAbsolutePath
        ? `/${first}`
        : first;
    const shortened = `${prefix}/.../${last}`;

    return visibleWidth(shortened) <= maxWidth
      ? shortened
      : truncateToWidth(shortened, maxWidth);
  }

  // 通用中间截断: 保留首尾, 中间用 ... (用于模型名, 避免尾部截断把 thinking 吃掉)
  function middleTruncateText(text: string, maxWidth: number): string {
    if (visibleWidth(text) <= maxWidth) return text;
    if (maxWidth <= 4) return truncateToWidth(text, maxWidth);
    const keep = maxWidth - 3; // 给 ... 留 3 格
    const front = Math.ceil(keep / 2);
    const back = Math.floor(keep / 2);
    return text.slice(0, front) + "..." + text.slice(text.length - back);
  }

  function getCurrentDirectory(contextCwd: string): string {
    const home = process.env.HOME || process.env.USERPROFILE;
    const candidates = [pi.cwd, contextCwd, process.env.PWD, process.cwd()].filter(
      (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
    );

    return candidates.find((candidate) => !home || candidate !== home) ?? candidates[0] ?? contextCwd;
  }

  function formatDirectory(path: string): string {
    const home = process.env.HOME || process.env.USERPROFILE;
    let cwd = path;
    if (home && cwd.startsWith(home)) {
      cwd = "~" + cwd.slice(home.length);
    }
    return middleTruncatePath(cwd);
  }

  function getExtensionStatusValues(statuses: unknown): string[] {
    if (statuses instanceof Map) {
      return Array.from(statuses.values());
    }
    if (Array.isArray(statuses)) {
      return statuses.filter((status): status is string => typeof status === "string");
    }
    return [];
  }

  // token-rate 扩展（playpi 包）发布的 status key，见其 README；未安装时取不到值。
  const STATUS_KEY_CACHE_HIT = "cache-hit";
  const STATUS_KEY_TOKEN_RATE = "token-rate";

  /** 从 getExtensionStatuses() 的 Map 里按 key 取文本；缺失或类型不符时返回空串。 */
  function getStatusText(statuses: unknown, key: string): string {
    if (statuses instanceof Map) {
      const value = statuses.get(key);
      return typeof value === "string" ? value : "";
    }
    return "";
  }

  function isThinkingLevel(value: string): value is ThinkingLevel {
    return THINKING_LEVELS.includes(value as ThinkingLevel);
  }

  function getSupportedThinkingLevels(model: ModelWithThinking | undefined): ThinkingLevel[] {
    if (!model || model.reasoning === false) return ["off"];

    const map = model.thinkingLevelMap ?? {};
    const supported = THINKING_LEVELS.filter((level) => map[level] !== null);
    return supported.length > 0 ? supported : ["off"];
  }

  function interpolateColor(position: number, stops: RgbColor[] = EFFORT_COLOR_STOPS): RgbColor {
    const safeStops = stops.length > 0 ? stops : EFFORT_COLOR_STOPS;
    const clamped = Math.max(0, Math.min(1, position));
    const scaled = clamped * (safeStops.length - 1);
    const leftIndex = Math.floor(scaled);
    const rightIndex = Math.min(safeStops.length - 1, leftIndex + 1);
    const mix = scaled - leftIndex;
    const left = safeStops[leftIndex];
    const right = safeStops[rightIndex];

    return {
      r: Math.round(left.r + (right.r - left.r) * mix),
      g: Math.round(left.g + (right.g - left.g) * mix),
      b: Math.round(left.b + (right.b - left.b) * mix),
    };
  }

  function colorRgb(text: string, { r, g, b }: RgbColor): string {
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
  }

  function colorThinkingLabel(level: string, label: string, model: ModelWithThinking | undefined): string {
    if (!isThinkingLevel(level)) return label;

    const supported = getSupportedThinkingLevels(model);
    const supportedIndex = supported.indexOf(level);
    const fallbackIndex = THINKING_LEVELS.indexOf(level);
    const position =
      supportedIndex >= 0
        ? supported.length <= 1
          ? 0
          : supportedIndex / (supported.length - 1)
        : fallbackIndex / (THINKING_LEVELS.length - 1);

    return colorRgb(label, interpolateColor(position));
  }

  function getProviderColor(provider: string | undefined): RgbColor | undefined {
    if (!provider) return undefined;
    const normalized = provider.toLowerCase();
    return PROVIDER_COLORS[normalized];
  }

  // 自适应三列布局: 内容紧凑排列, 列间 2 空格; 超宽时优先保中间(上下文条)和左边(分支), 只压缩右边(模型)
  function layoutRow(width: number, left: string, middle: string, right: string, gap = 2): string {
    const items = [left, middle, right].filter((s) => visibleWidth(s) > 0);
    if (items.length === 0) return "";
    if (items.length === 1) return truncateToWidth(items[0], width);
    const gapStr = " ".repeat(gap);
    const widths = items.map((s) => visibleWidth(s));
    const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
    if (total <= width) return items.join(gapStr);

    // 超宽: 三列全在是常见情况, 中间定宽保留, 左边优先保留, 只截右边
    if (visibleWidth(left) > 0 && visibleWidth(middle) > 0 && visibleWidth(right) > 0) {
      const lw = visibleWidth(left);
      const mw = visibleWidth(middle);
      const avail = width - mw - gap * 2;
      if (avail <= 0) return truncateToWidth(middle, width); // 极窄屏只留上下文条
      if (lw >= avail) {
        // 左边分支本身超长才走这里: 左 35% / 右 65%
        const lTarget = Math.max(4, Math.floor(avail * 0.35));
        const rTarget = Math.max(0, avail - lTarget);
        return truncateToWidth(left, lTarget) + gapStr + middle + gapStr + truncateToWidth(right, rTarget);
      }
      const rTarget = Math.max(0, avail - lw);
      return left + gapStr + middle + gapStr + truncateToWidth(right, rTarget);
    }

    // 回退(无分支等): 从右往左依次截, 保左侧
    let overflow = total - width;
    const targets = [...widths];
    for (let i = targets.length - 1; i >= 0 && overflow > 0; i--) {
      const minKeep = i === 0 ? 4 : 10;
      const canCut = Math.max(0, targets[i] - minKeep);
      const cut = Math.min(overflow, canCut);
      targets[i] -= cut;
      overflow -= cut;
    }
    return items.map((s, i) => truncateToWidth(s, Math.max(0, targets[i]))).join(gapStr);
  }

  pi.on("session_start", async (_event, ctx) => {
    currentModel = ctx.model as ModelWithThinking | undefined;
    modelId = ctx.model?.id;
    contextWindow = ctx.model?.contextWindow;
    thinkingLevel = pi.getThinkingLevel();
    sessionId = ctx.sessionManager.getSessionId() ?? "";
    void refreshDirty();

    ctx.ui.setFooter((tui, theme, footerData) => {
      tuiRef = tui;
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() {
          unsub();
          tuiRef = null;
        },
        invalidate() {
          void refreshDirty();
        },
        render(width: number): string[] {
          // ── 第一行 第一列: git:branch± ──
          const cwd = formatDirectory(getCurrentDirectory(ctx.cwd));
          const lastSlash = cwd.lastIndexOf("/");
          const pathPrefix = lastSlash >= 0 ? cwd.slice(0, lastSlash + 1) : "";
          const projectName = lastSlash >= 0 ? cwd.slice(lastSlash + 1) : cwd;
          const pathStr = projectName
            ? theme.fg("dim", pathPrefix) + theme.fg("accent", theme.bold(projectName))
            : theme.fg("dim", cwd);
          const branch = footerData.getGitBranch();
          const dirtyMarker = branch && isDirty ? "±" : "";
          const branchStr = branch ? `git:${branch}${dirtyMarker}` : "";
          const branchColor: "warning" | "success" = isDirty ? "warning" : "success";
          const col1row1 = branchStr ? theme.fg(branchColor, branchStr) : "";

          // ── 第一行 第二列: [###.......] XX% • 上下文长度 ──
          const usage = ctx.getContextUsage();
          const pct = usage?.percent ?? 0;
          const pctStr = usage?.percent !== null ? `${Math.round(pct)}%` : "?";
          const ctxRgb = interpolateColor(pct / 100, CONTEXT_COLOR_STOPS);
          const BLOCKS = 10;
          const filled = Math.max(0, Math.min(BLOCKS, Math.round((pct / 100) * BLOCKS)));
          const bar =
            colorRgb("#".repeat(filled), ctxRgb) +
            theme.fg("dim", ".".repeat(BLOCKS - filled));
          const ctxLen = contextWindow ? formatContextWindow(contextWindow) : "";
          const col2row1 =
            colorRgb("[", ctxRgb) + bar + colorRgb("] ", ctxRgb) + colorRgb(pctStr, ctxRgb) +
            (ctxLen ? theme.fg("dim", " • ") + colorRgb(ctxLen, ctxRgb) : "");

          // ── 第一行 第三列: 接入配置名 • model (thinking) • goal ──
          const activeModel = currentModel || (ctx.model as ModelWithThinking | undefined);
          const model = modelId || activeModel?.id || ctx.model?.id || "none";
          const provider = activeModel?.provider;
          const supportedThinkingLevels = getSupportedThinkingLevels(activeModel);
          const showThinkingLabel =
            thinkingLevel !== "off" || supportedThinkingLevels.length > 1;
          const thinkLabel = showThinkingLabel
            ? colorThinkingLabel(thinkingLevel, ` (${thinkingLevel})`, activeModel)
            : "";
          const providerColor = getProviderColor(provider);
          let shortModel = provider && model.startsWith(provider + "/")
            ? model.slice(provider.length + 1)
            : model;
          const providerLabel = provider
            ? (providerColor ? colorRgb(provider, providerColor) : theme.fg("muted", provider))
            : "";
          const statusMap = footerData.getExtensionStatuses?.();
          const statuses = getExtensionStatusValues(statusMap);
          const goalStatus = statuses.find((status) => /goal/i.test(status));
          const goalStr = goalStatus ? theme.fg("warning", goalStatus) : "";
          const buildCol3 = (modelName: string) => [providerLabel, theme.fg("accent", modelName) + thinkLabel, goalStr]
            .filter(Boolean)
            .join(theme.fg("dim", " • "));
          let col3row1 = buildCol3(shortModel);
          // 超宽时只压缩模型名中间, 保留 provider / (thinking) / goal 可见
          {
            const col1W = visibleWidth(col1row1);
            const col2W = visibleWidth(col2row1);
            let col3W = visibleWidth(col3row1);
            const nonEmpty = [col1row1, col2row1, col3row1].filter((s) => visibleWidth(s) > 0).length;
            const gaps = Math.max(0, nonEmpty - 1) * 2;
            if (col1W + col2W + col3W + gaps > width) {
              const overhead = col3W - visibleWidth(shortModel); // provider + 分隔 + thinking + goal 占的宽度
              const modelBudget = width - col1W - col2W - gaps - overhead;
              if (modelBudget < visibleWidth(shortModel)) {
                shortModel = middleTruncateText(shortModel, Math.max(8, modelBudget));
                col3row1 = buildCol3(shortModel);
                col3W = visibleWidth(col3row1);
              }
            }
          }

          // ── 第二行: sessionID (单列, 完整宽度) ──
          const sid = sessionId || "—";
          const row2 = theme.fg("dim", `session:${sid}`);

          // ── 第三行: CH(缓存命中率) • t/s(输出速率) • 路径 (单列) ──
          // 先判空再上色: theme.fg(color, "") 仍返回非空的纯 ANSI 串,
          // 直接 filter(Boolean) 会留下多余的分隔符。
          const row3Parts: string[] = [];
          // CH / t/s 来自 token-rate 扩展；未安装该扩展时取不到值，第 3 行只显示路径。
          const cacheHitStr = getStatusText(statusMap, STATUS_KEY_CACHE_HIT);
          const rateStr = getStatusText(statusMap, STATUS_KEY_TOKEN_RATE);
          if (cacheHitStr) row3Parts.push(theme.fg("accent", cacheHitStr));
          if (rateStr) row3Parts.push(theme.fg("accent", rateStr));
          if (pathStr) row3Parts.push(pathStr);
          const row3 = row3Parts.join(theme.fg("dim", " • "));

          return [
            layoutRow(width, col1row1, col2row1, col3row1),
            truncateToWidth(row2, width),
            truncateToWidth(row3, width),
          ];
        },
      };
    });
  });
}
