/**
 * 三个扩展的加载冒烟测试：确认它们在当前 Pi 的类型与运行时下能加载、能注册预期
 * 资源，并且 session_start 里用到的 ctx.ui 方法都还在。
 *
 * 运行：npm run smoke
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import zen from "../extensions/zen/index.ts";
import tokenRate from "../extensions/token-rate/index.ts";
import minimalFooter from "../extensions/minimal-footer/index.ts";

type Handler = (...args: unknown[]) => unknown;

function createStubPi() {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, { description: string; handler: Handler }>();
  const pi = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
      return () => {
        handlers.delete(event);
      };
    },
    registerCommand(name: string, options: { description: string; handler: Handler }) {
      commands.set(name, options);
    },
    getThinkingLevel() {
      return "off";
    },
    exec() {
      throw new Error("冒烟测试里不应真的执行命令");
    },
  };
  return { pi, handlers, commands };
}

let agentDir: string;
let previousAgentDir: string | undefined;

before(() => {
  // 状态目录重定向到临时目录，避免冒烟测试读写用户真实的 Pi 配置目录。
  agentDir = mkdtempSync(join(tmpdir(), "playpi-smoke-"));
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

describe("扩展加载冒烟", () => {
  it("zen 注册 /zen 命令与必要事件", () => {
    const { pi, handlers, commands } = createStubPi();
    zen(pi as unknown as ExtensionAPI);

    assert.ok(commands.has("zen"), "zen 应注册 /zen 命令");
    for (const event of ["session_start", "agent_start", "agent_settled", "session_shutdown"]) {
      assert.ok(handlers.has(event), `zen 应订阅 ${event}`);
    }
  });

  it("zen 的 session_start 能跑通", () => {
    const { pi, handlers } = createStubPi();
    zen(pi as unknown as ExtensionAPI);
    const sessionStart = handlers.get("session_start");
    assert.ok(sessionStart);

    const calls: string[] = [];
    sessionStart({ type: "session_start", reason: "startup" }, {
      ui: {
        setHiddenThinkingLabel: (label?: string) => calls.push(`label:${label ?? ""}`),
        setWorkingVisible: (visible: boolean) => calls.push(`working:${visible}`),
        setWidget: (key: string) => calls.push(`widget:${key}`),
      },
    });
    assert.ok(calls.length > 0, "zen 的 session_start 应操作过 UI");
  });

  it("token-rate 注册必要事件", () => {
    const { pi, handlers } = createStubPi();
    tokenRate(pi as unknown as ExtensionAPI);

    for (const event of ["session_start", "message_start", "message_end", "session_shutdown"]) {
      assert.ok(handlers.has(event), `token-rate 应订阅 ${event}`);
    }
  });

  it("token-rate 的 session_start 能跑通", () => {
    const { pi, handlers } = createStubPi();
    tokenRate(pi as unknown as ExtensionAPI);
    const sessionStart = handlers.get("session_start");
    assert.ok(sessionStart);

    const statuses: string[] = [];
    sessionStart({ type: "session_start", reason: "startup" }, {
      sessionManager: { getEntries: () => [] },
      ui: {
        setStatus: (key: string, text: string | undefined) => {
          statuses.push(`${key}=${text ?? ""}`);
        },
      },
    });
    assert.strictEqual(statuses.length, 2, "应清空并发布两个状态项");
  });

  it("minimal-footer 在 session_start 时安装自定义 footer", () => {
    const { pi, handlers } = createStubPi();
    minimalFooter(pi as unknown as ExtensionAPI);
    const sessionStart = handlers.get("session_start");
    assert.ok(sessionStart);

    let footerInstalled = false;
    sessionStart({ type: "session_start", reason: "startup" }, {
      model: undefined,
      cwd: process.cwd(),
      sessionManager: { getSessionId: () => "smoke-session" },
      ui: {
        setFooter: () => {
          footerInstalled = true;
        },
      },
    });
    assert.ok(footerInstalled, "minimal-footer 应调用 ctx.ui.setFooter");
  });
});
