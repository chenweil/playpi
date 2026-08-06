// Pi Zen - gapless collapsed-thinking presentation adapter.
//
// Adapted from the Firstmate project's Zen implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Verified against Pi 0.82.0, which exports AssistantMessageComponent with an
// updateContent method. installZenCollapsedThinkingLayout() probes that exact
// public seam and throws if it is missing; index.ts catches that and skips only
// this adapter with one clear diagnostic instead of blocking Zen or Pi.
//
// How it works: Pi renders a hidden thinking block as one static label row.
// Zen sets that label to the empty string and this adapter filters thinking
// blocks out of the message handed to the stock renderer, so a collapsed
// thinking block occupies zero rows instead of one blank one. The unfiltered
// message is kept on lastMessage so expanding thinking (Ctrl+T) and turning
// Zen off both restore the original reasoning content byte-for-byte. Only
// collapsed thinking is affected: expanded reasoning, assistant text, and tool
// calls render exactly as Pi renders them.
import type { AssistantMessageComponent as PiAssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import * as PiCodingAgent from "@earendil-works/pi-coding-agent";
import { zenHidesTranscriptChrome } from "./visibility.ts";

type AssistantMessage = Parameters<PiAssistantMessageComponent["updateContent"]>[0];

type AssistantMessagePresentationState = {
  hiddenThinkingLabel: string;
  hideThinkingBlock: boolean;
  lastMessage?: AssistantMessage;
};

type ZenCollapsedThinkingPatch = {
  hidesThinking: () => boolean;
};

// Keep the introduction-version symbol stable so a compatible upgrade cannot
// double-patch a live process.
const ZEN_COLLAPSED_THINKING_PATCH = Symbol.for(
  "pi-zen:collapsed-thinking-layout:pi-0.82.0",
);

export function installZenCollapsedThinkingLayout(): void {
  const registry = globalThis as typeof globalThis & {
    [key: symbol]: ZenCollapsedThinkingPatch | undefined;
  };
  const hidesThinking = (): boolean => zenHidesTranscriptChrome();
  const installed = registry[ZEN_COLLAPSED_THINKING_PATCH];
  if (installed) {
    installed.hidesThinking = hidesThinking;
    return;
  }

  const patch: ZenCollapsedThinkingPatch = { hidesThinking };
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
  ): void {
    const state = this as unknown as AssistantMessagePresentationState;
    const hideThinking =
      state.hiddenThinkingLabel === "" &&
      state.hideThinkingBlock &&
      patch.hidesThinking();
    const presentationMessage = hideThinking
      ? {
          ...message,
          content: message.content.filter((block) => block.type !== "thinking"),
        }
      : message;

    originalUpdateContent.call(this, presentationMessage);
    if (presentationMessage !== message) state.lastMessage = message;
  };

  registry[ZEN_COLLAPSED_THINKING_PATCH] = patch;
}
