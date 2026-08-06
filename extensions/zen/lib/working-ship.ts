// Pi Zen - animated working presentation.
//
// Adapted from the Firstmate project's Zen implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Zen replaces Pi's stock working row with a tiny ASCII fish swimming between
// two rows of water. A small bubble pulses above the fish's mouth on the row
// above it (same horizontal offset as before), so fish and bubble occupy
// different rows instead of sharing the middle one. This module owns
// only the sprite geometry, the swim track, the three animation cadences, the
// session-scoped freeze/resume state, and the temporary TUI widget;
// ../index.ts owns when the presentation is installed and removed, and stays
// the sole caller of setWorkingVisible().
//
// Cadence: one scheduler drives three logically independent clocks. Every
// tick advances the water phase, every ZEN_WORKING_SHIP_TICKS_PER_BUBBLE-th
// tick advances the bubble state, and only every
// ZEN_WORKING_SHIP_TICKS_PER_MOVE-th tick moves the fish. All three clocks
// stop together when the widget is disposed. Ticks, not wall-clock timestamps,
// drive every state change, so tests can seek time exactly.
//
// Continuity: one extension-owned animation instance survives hide/show within
// the same Pi process and Zen extension lifetime. Disposing the widget freezes
// column, direction, water phase, bubble state, and tick cadence without
// advancing them for hidden wall time. The next working period resumes from
// that exact logical state. A fresh session or new extension lifetime calls
// reset() and starts at the normal initial position. State is never a
// module-level or process-global singleton.
//
// Verified against Pi 0.82.0, which exposes ExtensionUIContext.setWidget() with
// a component factory, per-widget dispose(), and TUI.requestRender(). Pi renders
// a widget through Component.render(width), so this module recomputes its track
// from that width on every frame instead of caching a terminal size that a
// resize would invalidate. A resize while the fish is hidden is applied on the
// first resumed frame through the same clamp path.
import type { Component, TUI } from "@earendil-works/pi-tui";

// The fish: 7-cell profile, mouth on the leading end, tail on the trailing
// end. Two directions: right-facing (mouth on right) and left-facing, which
// is the horizontal mirror.
const FISH_RIGHT = "><(((°>";
const FISH_LEFT = "<°)))><";
// 1 cell of water between the fish and its bubble. The bubble always rides on
// the mouth side (leading end), so its side flips with the heading: right of a
// right-facing fish, left of a left-facing fish.
const FISH_BUBBLE_GAP = 1;
// The bubble pulses through 3 states so it visibly breathes while the fish swims.
const BUBBLE_STATES = ["o", "o\u00b0", "\u00b0o"] as const;
const FISH_WIDTH = FISH_RIGHT.length;
// The bubble is widest in states 1 and 2 ("o\u00b0" / "\u00b0o" = 2 cells).
// SPRITE_WIDTH_MAX reserves enough track for the widest state so a frame whose
// bubble has expanded cannot push the trailing water past the terminal edge.
const BUBBLE_WIDTHS = BUBBLE_STATES.map((state) => [...state].length);
const BUBBLE_MAX_WIDTH = Math.max(...BUBBLE_WIDTHS);
const SPRITE_WIDTH_MAX = FISH_WIDTH + FISH_BUBBLE_GAP + BUBBLE_MAX_WIDTH;
// 泡泡换边(从鱼尾侧到鱼头侧)需要两侧各留 gap + 最宽泡泡的空间, 加上鱼身
// 才有重叠的掉头区间。掉头不抖跳要求 span > leftEdge, 即宽度 > 15;
// 宽度不足时掉头点重合/区间分离, 鱼会在边界抖跳, 因此退回泡泡固定在
// 鱼尾侧的旧布局(见 render 的 leftEdge > 0 判断)。
const LEADING_BUBBLE_MIN_WIDTH =
  FISH_WIDTH + 2 * (FISH_BUBBLE_GAP + BUBBLE_MAX_WIDTH) + 1;

// One fixed water character fills the top and bottom rows. The phase machinery
// is kept so the row composition pipeline mirrors the original boat, even
// though every cell renders the same character.
const WAVE_CYCLE = ["\u2248", "\u2248", "\u2248", "\u2248"] as const;

// Standard ANSI foreground codes only: no theme lookup, bright variant, or 256/RGB.
const BLUE = "\u001b[34m";
const YELLOW = "\u001b[33m";
const CYAN = "\u001b[36m";
// Restores the default foreground so color never bleeds into padding or later frames.
const RESET = "\u001b[39m";

export const ZEN_WORKING_SHIP_WIDGET_KEY = "zen-working-ship";
/** Scheduler period. One tick advances the water by one phase. */
export const ZEN_WORKING_SHIP_TICK_MS = 220;
/** Fish moves one column every Nth tick, so it travels at 220 * 4 = 880ms per column. */
export const ZEN_WORKING_SHIP_TICKS_PER_MOVE = 4;
/** Bubble state advances every Nth tick, so it pulses at 220 * 2 = 440ms per state. */
export const ZEN_WORKING_SHIP_TICKS_PER_BUBBLE = 2;

export type ZenWorkingShipAnimation = {
  /** Render one frame that exactly fits `width`, clamping the track to it first. */
  render(width: number): string[];
  /** Advance one scheduler tick: water every tick, bubble on its own cadence, fish on its slower cadence. */
  tick(): void;
  restoreLastRendered(): void;
  /** Restore the normal initial column, direction, water phase, bubble state, and cadence. */
  reset(): void;
  /**
   * Clamp the frozen column and direction to `width` without advancing time.
   * Used when a terminal resize lands while the working presentation is hidden.
   */
  clampToWidth(width: number): void;
  /** Current fish column, exposed for deterministic motion assertions. */
  position(): number;
  /** Current travel direction: 1 travelling right, -1 travelling left. */
  direction(): number;
  /** Current water phase, exposed for deterministic ripple assertions. */
  waterPhase(): number;
  /** Current bubble state index, exposed for deterministic pulse assertions. */
  bubbleState(): number;
};

/**
 * Longest right-facing fish start column that still fits the full sprite
 * (fish + gap + widest bubble) in `width` usable cells. Using the maximum
 * bubble width keeps the fish inside the track even when the bubble is in a
 * 2-cell state. The left-facing track mirrors this span with a fixed offset,
 * see `leftEdge` in the animation state.
 */
function trackSpan(width: number): number {
  if (width >= SPRITE_WIDTH_MAX) return width - SPRITE_WIDTH_MAX;
  if (width >= FISH_WIDTH) return width - FISH_WIDTH;
  return 0;
}

export function createZenWorkingShipAnimation(): ZenWorkingShipAnimation {
  let position = 0;
  let direction = 1;
  let span = 0;
  // 朝左时泡泡在鱼左侧, position 不能低于该值, 否则泡泡越出左边界。
  // 宽屏才渲染泡泡, 此时等于 gap + 最宽泡泡宽度; 窄屏为 0(无泡泡, 对称)。
  let leftEdge = 0;
  let phase = 0;
  let bubble = 0;
  let ticks = 0;
  let renderedPosition = position;
  let renderedDirection = direction;
  let renderedSpan = span;
  let renderedLeftEdge = leftEdge;
  let renderedPhase = phase;
  let renderedBubble = bubble;
  let renderedTicks = ticks;

  // Reversing the moment the fish lands on an endpoint means the endpoint frame
  // itself already shows the new heading, so no frame at or after a bounce shows
  // the old mouth direction. 转向的瞬间把 position 拉回新方向的合法区间,
  // 否则泡泡换边后(朝右上限 span / 朝左下限 leftEdge)会越界渲染。
  const settleDirectionAtEdges = (): void => {
    if (span <= 0) return;
    if (direction >= 0 && position >= span) {
      direction = -1;
      position = Math.max(leftEdge, position);
    } else if (direction < 0 && position <= leftEdge) {
      direction = 1;
      position = Math.min(span, position);
    }
  };

  const applyWidth = (width: number): void => {
    if (width <= 0) {
      span = 0;
      position = 0;
      leftEdge = 0;
      return;
    }
    span = trackSpan(width);
    // 窄屏(< SPRITE_WIDTH_MAX)不渲染泡泡, 左右边界对称;
    // 宽度不足 LEADING_BUBBLE_MIN_WIDTH 时泡泡固定鱼尾侧, 左右也对称;
    // 否则泡泡在鱼头侧, 朝左时 position 至少要为 gap + 最宽泡泡留出空间。
    leftEdge =
      width >= LEADING_BUBBLE_MIN_WIDTH ? FISH_BUBBLE_GAP + BUBBLE_MAX_WIDTH : 0;
    const lower = direction >= 0 ? 0 : leftEdge;
    const upper = direction >= 0 ? span : span + leftEdge;
    position = Math.min(upper, Math.max(lower, position));
    settleDirectionAtEdges();
  };

  const commitRenderedState = (): void => {
    renderedPosition = position;
    renderedDirection = direction;
    renderedSpan = span;
    renderedLeftEdge = leftEdge;
    renderedPhase = phase;
    renderedBubble = bubble;
    renderedTicks = ticks;
  };

  const restoreLastRenderedState = (): void => {
    position = renderedPosition;
    direction = renderedDirection;
    span = renderedSpan;
    leftEdge = renderedLeftEdge;
    phase = renderedPhase;
    bubble = renderedBubble;
    ticks = renderedTicks;
  };

  /** One run of water characters covering absolute columns [from, from + count). */
  const water = (from: number, count: number): string => {
    if (count <= 0) return "";
    let cells = "";
    for (let column = from; column < from + count; column += 1) {
      cells += WAVE_CYCLE[(column + phase) % WAVE_CYCLE.length];
    }
    return cells;
  };

  const paintWater = (text: string): string => `${BLUE}${text}${RESET}`;
  const paintFish = (text: string): string => `${YELLOW}${text}${RESET}`;
  const paintBubble = (text: string): string => `${CYAN}${text}${RESET}`;

  return {
    position: () => position,
    direction: () => direction,
    waterPhase: () => phase,
    bubbleState: () => bubble,

    restoreLastRendered: restoreLastRenderedState,

    reset(): void {
      position = 0;
      direction = 1;
      span = 0;
      leftEdge = 0;
      phase = 0;
      bubble = 0;
      ticks = 0;
      commitRenderedState();
    },

    clampToWidth(width: number): void {
      applyWidth(width);
    },

    tick(): void {
      ticks += 1;
      phase = (phase + 1) % WAVE_CYCLE.length;
      if (ticks % ZEN_WORKING_SHIP_TICKS_PER_BUBBLE === 0) {
        bubble = (bubble + 1) % BUBBLE_STATES.length;
      }
      if (ticks % ZEN_WORKING_SHIP_TICKS_PER_MOVE !== 0) return;
      if (span <= 0) {
        position = 0;
        return;
      }
      // 朝右在 [0, span] 区间游, 朝左在 [leftEdge, span + leftEdge] 区间游。
      const lower = direction >= 0 ? 0 : leftEdge;
      const upper = direction >= 0 ? span : span + leftEdge;
      position = Math.min(upper, Math.max(lower, position + direction));
      settleDirectionAtEdges();
    },

    render(width: number): string[] {
      if (width <= 0) return ["", "", ""];

      // A resize lands here before the next frame, so recompute and clamp the track
      // immediately rather than trusting a position measured against the old width.
      applyWidth(width);

      const fish = direction >= 0 ? FISH_RIGHT : FISH_LEFT;
      const bubbleText = BUBBLE_STATES[bubble];
      // The bubble's visible width depends on its current state (1 or 2 cells).
      // The middle row's trailing water count must reflect the *current* bubble
      // width, not a fixed SPRITE_WIDTH constant, otherwise a 2-cell bubble pushes
      // the line one cell past the terminal width and Pi aborts rendering.
      const bubbleWidth = BUBBLE_WIDTHS[bubble];

      const waterRow = paintWater(water(0, width));

      let frame: string[];
      if (width < FISH_WIDTH) {
        // Too narrow for even the fish: two empty rows where the fish would go,
        // with a water row above and below.
        frame = [waterRow, "", waterRow];
      } else if (width < SPRITE_WIDTH_MAX) {
        // Too narrow for the bubble: water + fish + water, no bubble.
        frame = [
          waterRow,
          paintWater(water(0, position)) +
            paintFish(fish) +
            paintWater(water(position + FISH_WIDTH, width - position - FISH_WIDTH)),
          waterRow,
        ];
      } else if (direction < 0 && leftEdge > 0) {
        // 朝左且宽度足够: 泡泡在鱼头(左侧)的上一行, 布局为
        //   行0(顶): water + bubble + water
        //   行1(中): water + fish + water
        // 泡泡左端 = position - gap - bubbleWidth, 由 leftEdge 保证不出左边界。
        const bubbleStart = position - FISH_BUBBLE_GAP - bubbleWidth;
        frame = [
          paintWater(water(0, bubbleStart)) +
            paintBubble(bubbleText) +
            paintWater(
              water(bubbleStart + bubbleWidth, width - bubbleStart - bubbleWidth),
            ),
          paintWater(water(0, position)) +
            paintFish(fish) +
            paintWater(water(position + FISH_WIDTH, width - position - FISH_WIDTH)),
          waterRow,
        ];
      } else {
        // 朝右, 或宽度不足 LEADING_BUBBLE_MIN_WIDTH(泡泡固定鱼尾侧):
        // 泡泡在鱼头(右侧)的上一行, 布局为
        //   行0(顶): water + bubble + water
        //   行1(中): water + fish + water
        // 顶部水格数用泡泡*当前*宽度, 保证每行恰好等于 `width`, 与泡泡状态无关。
        const bubbleStart = position + FISH_WIDTH + FISH_BUBBLE_GAP;
        frame = [
          paintWater(water(0, bubbleStart)) +
            paintBubble(bubbleText) +
            paintWater(
              water(bubbleStart + bubbleWidth, width - bubbleStart - bubbleWidth),
            ),
          paintWater(water(0, position)) +
            paintFish(fish) +
            paintWater(water(position + FISH_WIDTH, width - position - FISH_WIDTH)),
          waterRow,
        ];
      }

      commitRenderedState();
      return frame;
    },
  };
}

/**
 * Build the temporary Zen working widget bound to one caller-owned animation.
 * Pi disposes the previous component before installing a replacement under the same
 * key and when it clears extension widgets, so the single scheduler driving all
 * cadences cannot outlive the widget or duplicate. Disposing freezes the shared
 * animation in place; the next widget bound to the same animation resumes without
 * applying hidden wall time.
 */
export function createZenWorkingShipWidget(
  tui: TUI,
  animation: ZenWorkingShipAnimation = createZenWorkingShipAnimation(),
): Component & { dispose(): void } {
  let disposed = false;
  const timer = setInterval(() => {
    if (disposed) return;
    animation.tick();
    tui.requestRender();
  }, ZEN_WORKING_SHIP_TICK_MS);
  // The animation must never keep Pi's process alive on its own.
  timer.unref?.();

  return {
    render: (width) => (disposed ? ["", "", ""] : animation.render(width)),
    // Every frame is rebuilt from fixed standard ANSI codes, so there is no cache.
    invalidate: () => {},
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      animation.restoreLastRendered();
    },
  };
}
