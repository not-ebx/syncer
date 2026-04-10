import type { CustomTarget, TargetDef } from "./types.js";

const KNOWN_TARGETS: Record<string, TargetDef> = {
  claude: {
    name: "claude",
    base: ".claude",
    skills: ".claude/skills",
    agents: ".claude/agents",
    commands: ".claude/commands",
  },
  codex: {
    name: "codex",
    base: ".codex",
    skills: ".codex/skills",
    agents: ".codex/agents",
    commands: ".codex/commands",
  },
  gemini: {
    name: "gemini",
    base: ".gemini",
    skills: ".gemini/skills",
    agents: ".gemini/agents",
    commands: ".gemini/commands",
  },
  cursor: {
    name: "cursor",
    base: ".cursor",
    skills: ".cursor/skills",
    agents: ".cursor/agents",
    commands: ".cursor/commands",
  },
  openclaw: {
    name: "openclaw",
    base: ".openclaw",
    skills: ".openclaw/skills",
    agents: ".openclaw/agents",
    commands: ".openclaw/commands",
  },
};

export const ALL_KNOWN_TARGET_NAMES = Object.keys(KNOWN_TARGETS);

export function resolveTarget(
  target: string | CustomTarget
): TargetDef | null {
  if (typeof target === "string") {
    return KNOWN_TARGETS[target] ?? null;
  }
  // Custom target
  return {
    name: target.name,
    base: target.base,
    skills: `${target.base}/skills`,
    agents: `${target.base}/agents`,
    commands: `${target.base}/commands`,
  };
}

export function resolveTargets(
  targets: (string | CustomTarget)[]
): TargetDef[] {
  return targets
    .map(resolveTarget)
    .filter((t): t is TargetDef => t !== null);
}

/** Scan projectRoot for known agent directories and return detected target names */
export async function detectTargets(projectRoot: string): Promise<string[]> {
  const { existsSync } = await import("node:fs");
  const path = await import("node:path");
  return ALL_KNOWN_TARGET_NAMES.filter((name) =>
    existsSync(path.join(projectRoot, KNOWN_TARGETS[name].base))
  );
}
