/**
 * 纯计算逻辑的单测。运行：npm test
 * （或 node --experimental-strip-types --test extensions/token-rate/lib/*.test.ts）
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  computeTokensPerSecond,
  formatRateText,
  computeCacheHitPercent,
  formatCacheHitText,
  findLastAssistantMessage,
  MetricsStore,
  MIN_ELAPSED_MS,
  STATUS_KEY_CACHE_HIT,
  STATUS_KEY_TOKEN_RATE,
} from "./token-rate.ts";

describe("computeTokensPerSecond", () => {
  it("正常计算 tokens/s", () => {
    assert.strictEqual(computeTokensPerSecond(100, 1000), 100);
    assert.strictEqual(computeTokensPerSecond(50, 500), 100);
    assert.strictEqual(computeTokensPerSecond(33, 1000), 33);
    assert.strictEqual(computeTokensPerSecond(1, 300), 3); // 1/0.3 = 3.33 -> 3
    assert.strictEqual(computeTokensPerSecond(2, 300), 7); // 2/0.3 = 6.67 -> 7
  });

  it("tokens 无效时返回 null", () => {
    assert.strictEqual(computeTokensPerSecond(undefined, 1000), null);
    assert.strictEqual(computeTokensPerSecond(null, 1000), null);
    assert.strictEqual(computeTokensPerSecond(0, 1000), null);
    assert.strictEqual(computeTokensPerSecond(-5, 1000), null);
    assert.strictEqual(computeTokensPerSecond(NaN, 1000), null);
  });

  it("耗时无效时返回 null", () => {
    assert.strictEqual(computeTokensPerSecond(100, undefined), null);
    assert.strictEqual(computeTokensPerSecond(100, null), null);
    assert.strictEqual(computeTokensPerSecond(100, 0), null);
    assert.strictEqual(computeTokensPerSecond(100, MIN_ELAPSED_MS - 1), null);
    assert.strictEqual(computeTokensPerSecond(100, -10), null);
    assert.strictEqual(computeTokensPerSecond(100, NaN), null);
  });

  it("耗时正好等于门槛时有效", () => {
    assert.strictEqual(computeTokensPerSecond(100, MIN_ELAPSED_MS), 1000);
  });
});

describe("formatRateText", () => {
  it("格式化速率", () => {
    assert.strictEqual(formatRateText(24), "24 t/s");
    assert.strictEqual(formatRateText(7), "7 t/s");
    assert.strictEqual(formatRateText(100), "100 t/s");
  });

  it("null 返回空串（永不做占位符）", () => {
    assert.strictEqual(formatRateText(null), "");
  });
});

describe("computeCacheHitPercent", () => {
  it("按 cacheRead/(input+cacheRead+cacheWrite) 计算", () => {
    // 900 / (100 + 900 + 0) = 90%
    assert.strictEqual(computeCacheHitPercent({ input: 100, cacheRead: 900 }), 90);
    // 50 / (50 + 50 + 0) = 50%
    assert.strictEqual(computeCacheHitPercent({ input: 50, cacheRead: 50 }), 50);
    // cacheWrite 也计入分母
    assert.strictEqual(computeCacheHitPercent({ input: 0, cacheRead: 50, cacheWrite: 50 }), 50);
  });

  it("未命中缓存时返回 null", () => {
    assert.strictEqual(computeCacheHitPercent({ input: 100 }), null);
    assert.strictEqual(computeCacheHitPercent({ input: 100, cacheRead: 0, cacheWrite: 0 }), null);
    assert.strictEqual(computeCacheHitPercent(undefined), null);
  });

  it("prompt 为 0 时返回 null", () => {
    assert.strictEqual(computeCacheHitPercent({ input: 0, cacheRead: 0, cacheWrite: 0 }), null);
  });

  it("只有 cacheWrite 没有 cacheRead 时命中率为 0", () => {
    assert.strictEqual(computeCacheHitPercent({ input: 100, cacheWrite: 100 }), 0);
  });
});

describe("formatCacheHitText", () => {
  it("保留一位小数并加 CH 前缀", () => {
    assert.strictEqual(formatCacheHitText(99.84), "CH99.8%");
    assert.strictEqual(formatCacheHitText(90), "CH90.0%");
    assert.strictEqual(formatCacheHitText(0), "CH0.0%");
  });

  it("null 返回空串", () => {
    assert.strictEqual(formatCacheHitText(null), "");
  });
});

describe("findLastAssistantMessage", () => {
  it("从尾部取最近一条 assistant message", () => {
    const entries = [
      { type: "message", message: { role: "user" } },
      { type: "message", message: { role: "assistant", usage: { output: 1 } } },
      { type: "message", message: { role: "user" } },
      { type: "message", message: { role: "assistant", usage: { output: 2 } } },
      { type: "message", message: { role: "toolResult" } },
    ];
    const last = findLastAssistantMessage(entries);
    assert.strictEqual(last?.usage?.output, 2);
  });

  it("非 message 条目被跳过", () => {
    const entries = [
      { type: "message", message: { role: "assistant", usage: { output: 7 } } },
      { type: "usage" },
      { type: "branch_summary" },
    ];
    assert.strictEqual(findLastAssistantMessage(entries)?.usage?.output, 7);
  });

  it("没有 assistant message 时返回 null", () => {
    assert.strictEqual(findLastAssistantMessage([]), null);
    assert.strictEqual(
      findLastAssistantMessage([{ type: "message", message: { role: "user" } }]),
      null,
    );
    assert.strictEqual(findLastAssistantMessage([{ type: "usage" }]), null);
  });

  it("非数组输入返回 null（防御）", () => {
    assert.strictEqual(findLastAssistantMessage(undefined), null);
    assert.strictEqual(findLastAssistantMessage(null), null);
    assert.strictEqual(findLastAssistantMessage("nope"), null);
  });
});

describe("MetricsStore", () => {
  it("初始为空", () => {
    const store = new MetricsStore();
    assert.strictEqual(store.rateText, "");
    assert.strictEqual(store.cacheHitText, "");
  });

  it("有效 completion 同时更新两个指标", () => {
    const store = new MetricsStore();
    assert.strictEqual(
      store.recordEnd({ usage: { output: 1000, input: 100, cacheRead: 900 }, durationMs: 1000 }),
      true,
    );
    assert.strictEqual(store.rateText, "1000 t/s");
    assert.strictEqual(store.cacheHitText, "CH90.0%");
  });

  it("无 usage 时清空两个指标", () => {
    const store = new MetricsStore();
    store.recordEnd({ usage: { output: 1000, input: 100, cacheRead: 900 }, durationMs: 1000 });
    assert.strictEqual(store.recordEnd({ durationMs: 1000 }), true);
    assert.strictEqual(store.rateText, "");
    assert.strictEqual(store.cacheHitText, "");
  });

  it("耗时 < 100ms 时只清速率，命中率仍保留", () => {
    const store = new MetricsStore();
    store.recordEnd({ usage: { output: 1000, input: 100, cacheRead: 900 }, durationMs: 1000 });
    assert.strictEqual(
      store.recordEnd({ usage: { output: 5, input: 100, cacheRead: 900 }, durationMs: MIN_ELAPSED_MS - 1 }),
      true,
    );
    assert.strictEqual(store.rateText, "");
    assert.strictEqual(store.cacheHitText, "CH90.0%");
  });

  it("未命中缓存时只显示速率", () => {
    const store = new MetricsStore();
    store.recordEnd({ usage: { output: 500, input: 1000, cacheRead: 0, cacheWrite: 0 }, durationMs: 1000 });
    assert.strictEqual(store.rateText, "500 t/s");
    assert.strictEqual(store.cacheHitText, "");
  });

  it("值未变化时返回 false（避免多余更新）", () => {
    const store = new MetricsStore();
    assert.strictEqual(store.recordEnd({ usage: { output: 100 }, durationMs: 1000 }), true);
    assert.strictEqual(store.recordEnd({ usage: { output: 100 }, durationMs: 1000 }), false);
  });

  it("clear 清空两个指标", () => {
    const store = new MetricsStore();
    store.recordEnd({ usage: { output: 1000, input: 100, cacheRead: 900 }, durationMs: 1000 });
    store.clear();
    assert.strictEqual(store.rateText, "");
    assert.strictEqual(store.cacheHitText, "");
  });

  it("durationMs 缺失时回退 wall-clock", () => {
    const store = new MetricsStore();
    store.recordStart();
    const start = Date.now();
    while (Date.now() - start < 120) {} // 同步等待，确保 elapsed >= 100ms
    assert.strictEqual(store.recordEnd({ usage: { output: 120 } }), true);
    assert.notStrictEqual(store.rateText, "");
  });

  it("没有开始基准时（回填的历史消息）不显示速率，也不显示占位符", () => {
    const store = new MetricsStore();
    // 没有 recordStart，也没有 durationMs：耗时未知
    assert.strictEqual(store.recordEnd({ usage: { output: 1000, input: 100, cacheRead: 900 } }), true);
    assert.strictEqual(store.rateText, "");
    assert.strictEqual(store.cacheHitText, "CH90.0%");
  });

  it("clear 会连 wall-clock 基准一起清掉", () => {
    const store = new MetricsStore();
    store.recordStart();
    store.recordEnd({ usage: { output: 1000 }, durationMs: 1000 });
    assert.notStrictEqual(store.rateText, "");

    store.clear();
    // 基准已被清掉，此时回填的消息不该算出速率
    store.recordEnd({ usage: { output: 1000 } });
    assert.strictEqual(store.rateText, "");
  });
});

describe("status key 约定", () => {
  it("CH 的 key 字母序在速率之前（内置 footer 按 key 排序渲染）", () => {
    assert.ok(STATUS_KEY_CACHE_HIT.localeCompare(STATUS_KEY_TOKEN_RATE) < 0);
  });
});
