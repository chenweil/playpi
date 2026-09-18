// Pi Zen - result-only assistant-message presentation adapter.
//
// Adapted from the Firstmate project's Zen implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Verified against Pi 0.85.1, which exports AssistantMessageComponent with an
// updateContent method. installZenAssistantMessageRowLayout() probes that exact
// public seam and throws if it is missing; index.ts catches that and skips only
// this adapter with one clear diagnostic instead of blocking Zen or Pi.
//
// How it works: Pi renders an assistant message from its content blocks. Zen
// builds a presentation copy of the message and hands that to the stock
// renderer, keeping the untouched original on lastMessage so invalidate(),
// Ctrl+T, session replay, and turning Zen off all restore the full message
// byte-for-byte.
//
//   - thinking blocks are dropped whenever Zen is on, so a step's reasoning
//     never reaches the transcript. This deliberately overrides Pi's own
//     hide/collapse state: with Zen on, Pi's Ctrl+T cannot reveal reasoning.
//   - a message that still carries tool calls is a step, not the answer. Only
//     its tool-call markers survive, which keeps the component at zero rows and
//     leaves Pi's own notices in charge of reporting problems.
//   - a step that ended in error or abort drops everything instead, because the
//     component only prints those notices when the message has no tool calls.
//     Pi usually reports such a step on its failed tool row as well; showing the
//     problem twice is deliberate, since losing it is not acceptable.
//   - the final assistant message (no tool calls) keeps its text and loses only
//     its thinking blocks.
//
// Truncation (stopReason "length") and the final-message error/abort notices are
// independent of content in Pi's renderer, so they keep working untouched.
import type { AssistantMessageComponent as PiAssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import * as PiCodingAgent from "@earendil-works/pi-coding-agent";
import { zenShowsOnlyResults } from "./visibility.ts";

type AssistantMessage = Parameters<PiAssistantMessageComponent["updateContent"]>[0];

type AssistantMessagePresentationState = {
  hiddenThinkingLabel: string;
  lastMessage?: AssistantMessage;
};

type ZenAssistantMessageRowPatch = {
  hidesProcessRows: () => boolean;
};

// Keep the introduction-version symbol stable so a compatible upgrade cannot
// double-patch a live process.
const ZEN_ASSISTANT_MESSAGE_ROW_PATCH = Symbol.for(
  "pi-zen:assistant-message-rows:pi-0.85.1",
);

export function installZenAssistantMessageRowLayout(): void {
  const registry = globalThis as typeof globalThis & {
    [key: symbol]: ZenAssistantMessageRowPatch | undefined;
  };
  const hidesProcessRows = (): boolean => zenShowsOnlyResults();
  const installed = registry[ZEN_ASSISTANT_MESSAGE_ROW_PATCH];
  if (installed) {
    installed.hidesProcessRows = hidesProcessRows;
    return;
  }

  const patch: ZenAssistantMessageRowPatch = { hidesProcessRows };
  const AssistantMessageComponent = PiCodingAgent.AssistantMessageComponent;
  if (typeof AssistantMessageComponent !== "function") {
    throw new Error("Pi Zen requires Pi AssistantMessageComponent");
  }
  const originalUpdateContent = AssistantMessageComponent.prototype.updateContent;
  if (typeof originalUpdateContent !== "function") {
    throw new Error("Pi Zen requires Pi AssistantMessageComponent.updateContent");
  }

  AssistantMessageComponent.prototype.updateContent = function (
    message: AssistantMessage,
    isStreaming?: boolean,
  ): void {
    const state = this as unknown as AssistantMessagePresentationState;
    // Zen marks its own presentation by clearing the hidden-thinking label, so a
    // component Zen never touched keeps Pi's behaviour even while Zen is on.
    const hides = state.hiddenThinkingLabel === "" && patch.hidesProcessRows();
    let presentationMessage = message;
    if (hides) {
      const isStep = message.content.some((block) => block.type === "toolCall");
      const reportsProblem =
        message.stopReason === "error" || message.stopReason === "aborted";
      const content = !isStep
        ? message.content.filter((block) => block.type !== "thinking")
        : reportsProblem
          ? []
          : message.content.filter((block) => block.type === "toolCall");
      if (content.length !== message.content.length) {
        presentationMessage = { ...message, content };
      }
    }

    // Pi 0.85 added the isStreaming argument (defaulting to the component's own
    // flag). Forward it explicitly, otherwise a streamed message is re-rendered
    // through the settled markdown path for the whole run.
    originalUpdateContent.call(this, presentationMessage, isStreaming);
    if (presentationMessage !== message) state.lastMessage = message;
  };

  registry[ZEN_ASSISTANT_MESSAGE_ROW_PATCH] = patch;
}
