/**
 * Zen 展示层过滤规则的单测。运行：npm test
 * （或 node --experimental-strip-types --test extensions/zen/lib/*.test.ts）
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  collectToolRowImages,
  computeZenAssistantContent,
  shouldRenderStockToolRow,
  zenMessageIsStep,
  zenMessageReportsProblem,
} from "./presentation.ts";

const text = { type: "text" };
const thinking = { type: "thinking" };
const toolCall = { type: "toolCall" };

describe("zenMessageIsStep", () => {
  it("带工具调用的是中间步骤", () => {
    assert.strictEqual(zenMessageIsStep({ content: [text, thinking, toolCall] }), true);
  });

  it("不带工具调用的是最终回答", () => {
    assert.strictEqual(zenMessageIsStep({ content: [text, thinking] }), false);
  });

  it("空内容不是步骤", () => {
    assert.strictEqual(zenMessageIsStep({ content: [] }), false);
  });
});

describe("zenMessageReportsProblem", () => {
  it("报错与中断都算问题", () => {
    assert.strictEqual(zenMessageReportsProblem({ content: [], stopReason: "error" }), true);
    assert.strictEqual(zenMessageReportsProblem({ content: [], stopReason: "aborted" }), true);
  });

  it("正常结束不算问题", () => {
    assert.strictEqual(zenMessageReportsProblem({ content: [], stopReason: "stop" }), false);
    assert.strictEqual(zenMessageReportsProblem({ content: [], stopReason: "length" }), false);
    assert.strictEqual(zenMessageReportsProblem({ content: [] }), false);
  });
});

describe("computeZenAssistantContent", () => {
  it("最终回答只去掉思考块", () => {
    const content = computeZenAssistantContent([text, thinking, text], {
      isStep: false,
      reportsProblem: false,
    });
    assert.deepStrictEqual(content, [text, text]);
  });

  it("最终回答没有思考块时原样返回", () => {
    const content = computeZenAssistantContent([text], {
      isStep: false,
      reportsProblem: false,
    });
    assert.deepStrictEqual(content, [text]);
  });

  it("中间步骤只保留工具调用标记", () => {
    const content = computeZenAssistantContent([text, thinking, toolCall], {
      isStep: true,
      reportsProblem: false,
    });
    assert.deepStrictEqual(content, [toolCall]);
  });

  it("报错的中间步骤整条丢掉", () => {
    const content = computeZenAssistantContent([text, thinking, toolCall], {
      isStep: true,
      reportsProblem: true,
    });
    assert.deepStrictEqual(content, []);
  });

  it("空内容返回空数组", () => {
    assert.deepStrictEqual(
      computeZenAssistantContent([], { isStep: false, reportsProblem: false }),
      [],
    );
  });

  it("不修改入参数组", () => {
    const input = [text, thinking];
    computeZenAssistantContent(input, { isStep: false, reportsProblem: false });
    assert.strictEqual(input.length, 2);
  });
});

describe("shouldRenderStockToolRow", () => {
  it("Zen 关闭时一律原样渲染", () => {
    assert.strictEqual(shouldRenderStockToolRow(false, false), true);
    assert.strictEqual(shouldRenderStockToolRow(false, undefined), true);
  });

  it("Zen 开启时失败行必须原样渲染", () => {
    assert.strictEqual(shouldRenderStockToolRow(true, true), true);
  });

  it("Zen 开启且成功时隐藏该行", () => {
    assert.strictEqual(shouldRenderStockToolRow(true, false), false);
    assert.strictEqual(shouldRenderStockToolRow(true, undefined), false);
  });
});

describe("collectToolRowImages", () => {
  const component = (text: string) => ({ render: () => [text] }) as never;

  it("图片与间隔组件按序配对", () => {
    const image1 = component("img1");
    const image2 = component("img2");
    const spacer1 = component("gap1");
    const spacer2 = component("gap2");
    const entries = collectToolRowImages([image1, image2], [spacer1, spacer2]);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].image, image1);
    assert.strictEqual(entries[0].spacer, spacer1);
    assert.strictEqual(entries[1].image, image2);
    assert.strictEqual(entries[1].spacer, spacer2);
  });

  it("间隔组件缺失时该项为空", () => {
    const entries = collectToolRowImages([component("img1")], []);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].spacer, undefined);
    assert.ok(entries[0].image);
  });

  it("没有图片时返回空数组", () => {
    assert.deepStrictEqual(collectToolRowImages([], []), []);
  });
});
