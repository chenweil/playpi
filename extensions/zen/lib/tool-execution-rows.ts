// Pi Zen - result-only tool-row presentation adapter.
//
// Adapted from the Firstmate project's Zen implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Verified against Pi 0.85.1, which exports ToolExecutionComponent.
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
import { zenShowsOnlyResults } from "./visibility.ts";

type ToolRowPresentationState = {
  result?: { isError?: boolean };
  imageComponents: Component[];
  imageSpacers: Component[];
};

type ZenToolExecutionRowPatch = {
  hidesRows: () => boolean;
};

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
    if (!patch.hidesRows() || state.result?.isError) {
      return originalRender.call(this, width);
    }

    const lines: string[] = [];
    for (let index = 0; index < state.imageComponents.length; index += 1) {
      const spacer = state.imageSpacers[index];
      if (spacer) lines.push(...spacer.render(width));
      const image = state.imageComponents[index];
      if (image) lines.push(...image.render(width));
    }
    return lines;
  };

  registry[ZEN_TOOL_EXECUTION_ROW_PATCH] = patch;
}
