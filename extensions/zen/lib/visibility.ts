// Pi Zen - shared presentation state for the standalone Zen extension.
//
// Adapted from the Firstmate project's Zen implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// This module owns only the in-memory presentation flag. Presentation filtering
// must never delete or alter semantic, session, or export data. Since Pi 1.3.0
// renders /export and /share from session data (JSONL/HTML) and never through
// the TUI components Zen patches, export output is unaffected by this flag and
// needs no separate stock-rendering mode.

let active = false;

/** True while Zen presentation filtering is enabled. */
export function zenPresentationIsActive(): boolean {
  return active;
}

export function setZenPresentation(next: boolean): void {
  active = next;
}

/**
 * True while Zen presents agent results only: thinking blocks, tool rows, and
 * non-final assistant messages are filtered out of the transcript. Failures
 * stay visible - a failed tool row is the row Pi uses to report a tool failure
 * or an aborted/errored step, and Pi's truncated/aborted/error notices are left
 * untouched. Genuine user prompts, the final assistant message, image results,
 * and every other transcript row class are never filtered by this flag.
 *
 * The flag only gates the live TUI transcript. /export and /share read session
 * data directly and are therefore always complete.
 */
export function zenShowsOnlyResults(): boolean {
  return active;
}
