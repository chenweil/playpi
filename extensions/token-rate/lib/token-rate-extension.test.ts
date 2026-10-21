/**
 * token-rate 扩展的会话级行为测试：session_start 从历史回填、message_end 发布
 * 指标、session_shutdown 清空。运行：npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import tokenRate from "../index.ts";
import { STATUS_KEY_CACHE_HIT, STATUS_KEY_TOKEN_RATE } from "./token-rate.ts";

type Handler = (...args: unknown[]) => unknown;

function createStubPi() {
  const handlers = new Map<string, Handler>();
  const pi = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
      return () => {
        handlers.delete(event);
      };
    },
  };
  return { pi, handlers };
}

function createStubContext(entries: unknown[] = []) {
  const statuses: { key: string; text: string | undefined }[] = [];
  return {
    statuses,
    ctx: {
      sessionManager: { getEntries: () => entries },
      ui: {
        setStatus: (key: string, text: string | undefined) => {
          statuses.push({ key, text });
        },
      },
    },
  };
}

/** 取某个 key 最后一次发布的文本。 */
function lastStatus(
  statuses: { key: string; text: string | undefined }[],
  key: string,
): string | undefined {
  for (let index = statuses.length - 1; index >= 0; index -= 1) {
    if (statuses[index].key === key) return statuses[index].text;
  }
  return undefined;
}

const ASSISTANT_ENTRY = {
  type: "message",
  message: {
    role: "assistant",
    usage: { output: 1000, input: 100, cacheRead: 900 },
    durationMs: 1000,
  },
};

describe("token-rate 会话级行为", () => {
  it("session_start 从会话历史回填最近一条 assistant message", () => {
    const { pi, handlers } = createStubPi();
    tokenRate(pi as unknown as ExtensionAPI);
    const sessionStart = handlers.get("session_start");
    assert.ok(sessionStart);

    const { ctx, statuses } = createStubContext([
      { type: "message", message: { role: "user" } },
      ASSISTANT_ENTRY,
    ]);
    sessionStart({ type: "session_start", reason: "resume" }, ctx);

    assert.strictEqual(lastStatus(statuses, STATUS_KEY_CACHE_HIT), "CH90.0%");
    assert.strictEqual(lastStatus(statuses, STATUS_KEY_TOKEN_RATE), "1000 t/s");
  });

  it("历史里没有 assistant message 时两个状态都不发布内容", () => {
    const { pi, handlers } = createStubPi();
    tokenRate(pi as unknown as ExtensionAPI);
    const sessionStart = handlers.get("session_start");
    assert.ok(sessionStart);

    const { ctx, statuses } = createStubContext([
      { type: "message", message: { role: "user" } },
    ]);
    sessionStart({ type: "session_start", reason: "startup" }, ctx);

    assert.strictEqual(lastStatus(statuses, STATUS_KEY_CACHE_HIT), undefined);
    assert.strictEqual(lastStatus(statuses, STATUS_KEY_TOKEN_RATE), undefined);
  });

  it("回填的旧消息没有 durationMs 时不显示速率，也不显示占位符", () => {
    const { pi, handlers } = createStubPi();
    tokenRate(pi as unknown as ExtensionAPI);
    const sessionStart = handlers.get("session_start");
    assert.ok(sessionStart);

    const { ctx, statuses } = createStubContext([
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { output: 1000, input: 100, cacheRead: 900 },
          // 老消息没有 durationMs，耗时无从得知
        },
      },
    ]);
    sessionStart({ type: "session_start", reason: "resume" }, ctx);

    assert.strictEqual(lastStatus(statuses, STATUS_KEY_TOKEN_RATE), undefined);
    // 命中率与耗时无关，照常回填
    assert.strictEqual(lastStatus(statuses, STATUS_KEY_CACHE_HIT), "CH90.0%");
  });

  it("message_end 发布新消息的指标", () => {
    const { pi, handlers } = createStubPi();
    tokenRate(pi as unknown as ExtensionAPI);
    const messageEnd = handlers.get("message_end");
    assert.ok(messageEnd);

    const { ctx, statuses } = createStubContext();
    messageEnd(
      {
        type: "message_end",
        message: {
          role: "assistant",
          usage: { output: 500, input: 100, cacheRead: 900 },
          durationMs: 1000,
        },
      },
      ctx,
    );

    assert.strictEqual(lastStatus(statuses, STATUS_KEY_CACHE_HIT), "CH90.0%");
    assert.strictEqual(lastStatus(statuses, STATUS_KEY_TOKEN_RATE), "500 t/s");
  });

  it("非 assistant 消息不发布指标", () => {
    const { pi, handlers } = createStubPi();
    tokenRate(pi as unknown as ExtensionAPI);
    const messageEnd = handlers.get("message_end");
    assert.ok(messageEnd);

    const { ctx, statuses } = createStubContext();
    messageEnd({ type: "message_end", message: { role: "user" } }, ctx);

    assert.strictEqual(statuses.length, 0);
  });

  it("session_shutdown 清空状态", () => {
    const { pi, handlers } = createStubPi();
    tokenRate(pi as unknown as ExtensionAPI);
    const messageEnd = handlers.get("message_end");
    const sessionShutdown = handlers.get("session_shutdown");
    assert.ok(messageEnd);
    assert.ok(sessionShutdown);

    const { ctx, statuses } = createStubContext();
    messageEnd(
      {
        type: "message_end",
        message: {
          role: "assistant",
          usage: { output: 500, input: 100, cacheRead: 900 },
          durationMs: 1000,
        },
      },
      ctx,
    );
    sessionShutdown({ type: "session_shutdown", reason: "quit" }, ctx);

    assert.strictEqual(lastStatus(statuses, STATUS_KEY_CACHE_HIT), undefined);
    assert.strictEqual(lastStatus(statuses, STATUS_KEY_TOKEN_RATE), undefined);
  });
});
