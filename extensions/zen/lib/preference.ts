// Pi Zen - persisted on/off preference.
//
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// The preference lives in a plain local state file named "zen" directly under
// Pi's agent directory (~/.pi/agent by default, PI_CODING_AGENT_DIR when set).
// That directory is Pi runtime territory: this repository never tracks the
// state file and Home Manager never manages it. The file contains exactly
// "on\n" or "off\n"; anything else, including a missing or unreadable file,
// means off.

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as PiCodingAgent from "@earendil-works/pi-coding-agent";

export const ZEN_PREFERENCE_FILE_NAME = "zen";
// 旧版 Calm 扩展的状态文件名。首次加载 Zen 时若发现旧文件, 会迁移到新文件,
// 保证用户已开启的状态在改名后不丢失。迁移完成后旧文件不再读写。
const LEGACY_PREFERENCE_FILE_NAME = "calm";

/**
 * Resolve Pi's agent directory through Pi's exported getAgentDir(), which
 * honors PI_CODING_AGENT_DIR and tilde expansion. If a future Pi stops
 * exporting it, fall back to the documented environment variable and default
 * path instead of failing.
 */
export function zenAgentDir(): string {
  if (typeof PiCodingAgent.getAgentDir === "function") return PiCodingAgent.getAgentDir();
  const envDir = process.env.PI_CODING_AGENT_DIR?.trim();
  if (envDir) return envDir;
  return join(homedir(), ".pi", "agent");
}

export function zenPreferencePath(): string {
  return join(zenAgentDir(), ZEN_PREFERENCE_FILE_NAME);
}

/** Load the persisted preference. Zen is off by default and on any read error. */
export function loadZenPreference(): boolean {
  try {
    return readFileSync(zenPreferencePath(), "utf8").trim() === "on";
  } catch {
    // 首次升级: 旧的 calm 状态文件存在时, 读它的内容并在新文件上落盘,
    // 之后一律走新文件。旧文件本身保留不删, 便于回退。
    const legacyPath = join(zenAgentDir(), LEGACY_PREFERENCE_FILE_NAME);
    try {
      const legacy = readFileSync(legacyPath, "utf8").trim();
      if (legacy === "on" || legacy === "off") persistZenPreference(legacy === "on");
      return legacy === "on";
    } catch {
      return false;
    }
  }
}

/**
 * Persist the preference atomically (unique temp file plus rename) so a
 * crashed write never leaves a truncated state file. A failure throws a clear
 * error naming the path so /zen can surface it instead of silently applying
 * a toggle that would not survive a restart.
 */
export function persistZenPreference(active: boolean): void {
  const path = zenPreferencePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, active ? "on\n" : "off\n", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      renameSync(temporaryPath, path);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Pi Zen could not persist its preference to ${path}: ${reason}`);
  }
}
