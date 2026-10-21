/**
 * Zen 扩展的加载与 /zen 命令行为测试。运行：npm test
 *
 * 状态文件写在临时目录里（通过 PI_CODING_AGENT_DIR 重定向），不会碰用户的
 * ~/.pi/agent/zen。
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import zen from "../index.ts";
import { zenPresentationIsActive } from "./visibility.ts";

type CommandHandler = (args: string, ctx: unknown) => Promise<void> | void;

function createStubPi() {
  const handlers = new Map<string, unknown>();
  const commands = new Map<string, { description: string; handler: CommandHandler }>();
  const pi = {
    on(event: string, handler: unknown) {
      handlers.set(event, handler);
      return () => {
        handlers.delete(event);
      };
    },
    registerCommand(name: string, options: { description: string; handler: CommandHandler }) {
      commands.set(name, options);
    },
    getThinkingLevel() {
      return "off";
    },
  };
  return { pi, handlers, commands };
}

function createStubContext() {
  let toolsExpanded = false;
  const calls: string[] = [];
  return {
    calls,
    ctx: {
      ui: {
        setHiddenThinkingLabel: (label?: string) => calls.push(`label:${label ?? ""}`),
        setWorkingVisible: (visible: boolean) => calls.push(`working:${visible}`),
        setWidget: (key: string) => calls.push(`widget:${key}`),
        getToolsExpanded: () => toolsExpanded,
        setToolsExpanded: (expanded: boolean) => {
          toolsExpanded = expanded;
        },
      },
    },
  };
}

let agentDir: string;
let previousAgentDir: string | undefined;

before(() => {
  agentDir = mkdtempSync(join(tmpdir(), "playpi-zen-test-"));
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
});

after(() => {
  if (previousAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }
  rmSync(agentDir, { recursive: true, force: true });
});

describe("zen 扩展加载", () => {
  it("注册 /zen 命令并订阅必要事件", () => {
    const { pi, handlers, commands } = createStubPi();
    zen(pi as unknown as ExtensionAPI);

    assert.ok(commands.has("zen"), "应注册 /zen 命令");
    for (const event of ["session_start", "agent_start", "agent_settled", "session_shutdown"]) {
      assert.ok(handlers.has(event), `应订阅 ${event}`);
    }
  });

  it("/zen 切换后写入状态文件并同步内存状态", async () => {
    const { pi, commands } = createStubPi();
    zen(pi as unknown as ExtensionAPI);
    const command = commands.get("zen");
    assert.ok(command);

    const { ctx, calls } = createStubContext();
    await command.handler("", ctx);

    assert.strictEqual(zenPresentationIsActive(), true);
    assert.strictEqual(readFileSync(join(agentDir, "zen"), "utf8"), "on\n");
    assert.ok(calls.some((call) => call === "label:"), "应把隐藏思考的标签置空作为归属标记");

    await command.handler("", ctx);

    assert.strictEqual(zenPresentationIsActive(), false);
    assert.strictEqual(readFileSync(join(agentDir, "zen"), "utf8"), "off\n");
  });
});
