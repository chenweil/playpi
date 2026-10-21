// Pi Zen - 展示层过滤的纯逻辑。
//
// Adapted from the Firstmate project's Zen implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// 这里只放不依赖 Pi 运行时的纯函数。两个 patch 适配器
// （assistant-message-rows.ts / tool-execution-rows.ts）只负责把 Pi 组件的状态喂
// 进来、再把结果交回 Pi 渲染，过滤规则全部集中在这里，方便单测。
import type { Component } from "@earendil-works/pi-tui";

/** Zen 过滤规则关心的内容块最小形状。 */
export interface ZenContentBlock {
  type: string;
}

/** Zen 过滤规则关心的 assistant message 最小形状。 */
export interface ZenAssistantMessageLike {
  content: readonly ZenContentBlock[];
  stopReason?: string;
}

/**
 * 这条 assistant message 是不是中间步骤（还带着工具调用）。
 * 带工具调用的消息不是答案，只是过程的一步。
 */
export function zenMessageIsStep(message: ZenAssistantMessageLike): boolean {
  return message.content.some((block) => block.type === "toolCall");
}

/**
 * 这条 assistant message 是否在报告问题（报错或被中断）。
 * Pi 的渲染器只在消息没有工具调用时才打印这类提示，所以失败的步骤要整条丢掉，
 * 让失败由失败的工具行来说明——那条行才是 Pi 上报工具失败与中断/报错步骤的地方。
 */
export function zenMessageReportsProblem(message: ZenAssistantMessageLike): boolean {
  return message.stopReason === "error" || message.stopReason === "aborted";
}

/**
 * 计算 Zen 展示时保留的内容块。
 *
 * - 最终回答（不带工具调用）：保留文字，去掉思考块。
 * - 中间步骤且没有报错：只保留工具调用标记。Pi 自己不渲染这些标记，于是整行高度为 0。
 * - 中间步骤且报错/中断：整条丢掉，问题交给失败的工具行说。
 */
export function computeZenAssistantContent<T extends ZenContentBlock>(
  content: readonly T[],
  options: { isStep: boolean; reportsProblem: boolean },
): T[] {
  if (!options.isStep) {
    return content.filter((block) => block.type !== "thinking");
  }
  if (options.reportsProblem) {
    return [];
  }
  return content.filter((block) => block.type === "toolCall");
}

/**
 * 工具行是否交回 Pi 原样渲染。
 *
 * Zen 开启时工具行整体隐藏，但失败行必须原样显示：Pi 正是靠失败行上报工具失败，
 * 以及被中断/报错的步骤。失败行一旦被吞掉，问题就彻底看不见了。
 */
export function shouldRenderStockToolRow(hides: boolean, isError: boolean | undefined): boolean {
  return !hides || isError === true;
}

/**
 * Zen 隐藏工具行时只保留图片结果：图片组件与它上方的间隔组件按序配对。
 * 间隔组件可能缺失（例如还没渲染出来），这时只渲染图片。
 */
export function collectToolRowImages(
  imageComponents: readonly Component[],
  imageSpacers: readonly Component[],
): { spacer?: Component; image?: Component }[] {
  const entries: { spacer?: Component; image?: Component }[] = [];
  for (let index = 0; index < imageComponents.length; index += 1) {
    entries.push({ spacer: imageSpacers[index], image: imageComponents[index] });
  }
  return entries;
}
