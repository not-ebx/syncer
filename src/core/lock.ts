import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { PROJECT_LOCK_FILE } from "./config.js";
import { fileSha256, dirSha256 } from "../utils/fs.js";
import type { LockFile, ResolvedContent } from "../types.js";

const SYNCER_VERSION = "0.2.0";

export function buildLockFile(
  registryPath: string,
  registryCommit: string,
  resolved: ResolvedContent,
  packs: string[]
): LockFile {
  return {
    syncer_version: SYNCER_VERSION,
    registry_commit: registryCommit,
    resolved_at: new Date().toISOString(),
    packs,
    skills: resolved.skills.map((name) => ({
      name,
      hash: hashSkill(registryPath, name),
    })),
    agents: resolved.agents.map((name) => ({
      name,
      hash: hashAgent(registryPath, name),
    })),
    commands: resolved.commands.map((name) => ({
      name,
      hash: hashCommand(registryPath, name),
    })),
  };
}

function hashSkill(registryPath: string, name: string): string {
  const skillDir = path.join(registryPath, "skills", name);
  return `sha256:${dirSha256(skillDir)}`;
}

function hashAgent(registryPath: string, name: string): string {
  const agentFile = path.join(registryPath, "agents", `${name}.md`);
  return `sha256:${fileSha256(agentFile)}`;
}

function hashCommand(registryPath: string, name: string): string {
  const cmdFile = path.join(registryPath, "commands", `${name}.md`);
  return `sha256:${fileSha256(cmdFile)}`;
}

export function writeLockFile(projectRoot: string, lock: LockFile): void {
  const lockPath = path.join(projectRoot, PROJECT_LOCK_FILE);
  fs.writeFileSync(lockPath, stringify(lock), "utf8");
}

export function readLockFile(projectRoot: string): LockFile | null {
  const lockPath = path.join(projectRoot, PROJECT_LOCK_FILE);
  if (!fs.existsSync(lockPath)) return null;
  try {
    return parse(fs.readFileSync(lockPath, "utf8")) as LockFile;
  } catch {
    return null;
  }
}

export function writeLastSync(cacheDir: string, commit: string): void {
  const lastSyncPath = path.join(cacheDir, ".last-sync");
  fs.writeFileSync(
    lastSyncPath,
    JSON.stringify({ timestamp: new Date().toISOString(), commit }),
    "utf8"
  );
}
