// Pi Zen - shared presentation state for the standalone Zen extension.
//
// Adapted from the Firstmate project's Zen implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// This module owns only the in-memory presentation flags. Presentation filtering
// must never delete or alter semantic, session, or export data, so the export
// path forces stock rendering for the duration of an /export or /share command.

let active = false;
let stockExportRendering = false;

/** True while Zen presentation filtering is enabled. */
export function zenPresentationIsActive(): boolean {
  return active;
}

export function setZenPresentation(next: boolean): void {
  active = next;
}

/** True while an /export or /share render is in flight and stock output is required. */
export function zenStockExportRenderingIsActive(): boolean {
  return stockExportRendering;
}

export function setZenStockExportRendering(next: boolean): void {
  stockExportRendering = next;
}

/**
 * True while Zen should hide the supported transcript chrome: collapsed
 * thinking labels and the known Pi built-in tool call/result shells. Genuine
 * user prompts, assistant text, custom tools, and every other transcript row
 * class are never filtered by this flag.
 */
export function zenHidesTranscriptChrome(): boolean {
  return active && !stockExportRendering;
}
