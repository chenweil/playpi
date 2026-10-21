// Pi Zen - result-only tool-row presentation adapter.
//
// Adapted from the Firstmate project's Zen implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Verified against Pi 1.3.0, which exports ToolExecutionComponent.
// installZenToolExecutionRowLayout() probes that exact public seam and throws if
// it is missing; index.ts catches that and skips only this adapter with one
// clear diagnostic instead of blocking Zen or Pi.
//
// How it works: Zen hides a tool row by returning only its image results from
// render(), which leaves the call line, the text output, and the row framing at
// zero rows. Pi owns tool execution, settings, stored results, and every
// renderer; Zen only changes the final row layout.
//
// The one exception is a failed row, which goes back to Pi's stock renderer.
// Pi reports a tool failure - and an aborted or errored step - by attaching an
// isError result to the pending tool rows, so that row is the only place the
// problem becomes visible. Image results stay visible without their
// call/result shell, whatever tool produced them.
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { collectToolRowImages, shouldRenderStockToolRow } from "./presentation.ts";
import { zenShowsOnlyResults } from "./visibility.ts";

type ToolRowPresentationState = {
  result?: { isError?: boolean };
  imageComponents: Component[];
  imageSpacers: Component[];
};

type ZenToolExecutionRowPatch = {
  hidesRows: () => boolean;
};

// Keep this key stable across Pi upgrades: it records the first Pi version this
// patch was written against (0.85.1) and is the idempotency guard that stops a
// /reload inside a live process from stacking a second patch on the first.
const ZEN_TOOL_EXECUTION_ROW_PATCH = Symbol.for(
  "pi-zen:tool-execution-rows:pi-0.85.1",
);

export function installZenToolExecutionRowLayout(): void {
  const registry = globalThis as typeof globalThis & {
    [key: symbol]: ZenToolExecutionRowPatch | undefined;
  };
  const hidesRows = (): boolean => zenShowsOnlyResults();
  const installed = registry[ZEN_TOOL_EXECUTION_ROW_PATCH];
  if (installed) {
    installed.hidesRows = hidesRows;
    return;
  }

  if (typeof ToolExecutionComponent !== "function") {
    throw new Error("Pi Zen requires Pi ToolExecutionComponent");
  }
  const originalRender = ToolExecutionComponent.prototype.render;
  if (typeof originalRender !== "function") {
    throw new Error("Pi Zen requires Pi ToolExecutionComponent.render");
  }

  const patch: ZenToolExecutionRowPatch = { hidesRows };
  ToolExecutionComponent.prototype.render = function (width: number): string[] {
    const state = this as unknown as ToolRowPresentationState;
    // 判定规则在 ./presentation.ts（纯函数，可单测），这里只负责喂数据。
    if (shouldRenderStockToolRow(patch.hidesRows(), state.result?.isError)) {
      return originalRender.call(this, width);
    }

    const lines: string[] = [];
    for (const entry of collectToolRowImages(state.imageComponents, state.imageSpacers)) {
      if (entry.spacer) lines.push(...entry.spacer.render(width));
      if (entry.image) lines.push(...entry.image.render(width));
    }
    return lines;
  };

  registry[ZEN_TOOL_EXECUTION_ROW_PATCH] = patch;
}
