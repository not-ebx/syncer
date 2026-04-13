import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { PackDef, ResolvedContent } from "../types.js";
import type { ResolvedConfig } from "./config.js";

// ─── Pack loading ─────────────────────────────────────────────────────────────

export function loadPack(registryPath: string, packName: string): PackDef {
  const packFile = path.join(registryPath, "packs", `${packName}.yaml`);
  if (!fs.existsSync(packFile)) {
    throw new Error(`Pack "${packName}" not found in registry (${packFile})`);
  }
  const raw = fs.readFileSync(packFile, "utf8");
  return parse(raw) as PackDef;
}

/** List all available pack names in the registry */
export function listAvailablePacks(registryPath: string): string[] {
  const packsDir = path.join(registryPath, "packs");
  if (!fs.existsSync(packsDir)) return [];
  return fs
    .readdirSync(packsDir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""));
}

/** List all available skills in the registry */
export function listAvailableSkills(registryPath: string): string[] {
  const dir = path.join(registryPath, "skills");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/** List all available agents in the registry */
export function listAvailableAgents(registryPath: string): string[] {
  const dir = path.join(registryPath, "agents");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/** List all available commands in the registry */
export function listAvailableCommands(registryPath: string): string[] {
  const dir = path.join(registryPath, "commands");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

// ─── Pack resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a list of pack names into merged skills/agents/commands.
 * Handles `extends` chains recursively with cycle detection.
 */
export function resolvePacks(
  registryPath: string,
  packNames: string[]
): ResolvedContent {
  const merged: ResolvedContent = { skills: [], agents: [], commands: [] };

  for (const packName of packNames) {
    const resolved = resolveOnePack(registryPath, packName, []);
    mergeInto(merged, resolved);
  }

  return {
    skills: dedupe(merged.skills),
    agents: dedupe(merged.agents),
    commands: dedupe(merged.commands),
  };
}

function resolveOnePack(
  registryPath: string,
  packName: string,
  chain: string[]
): ResolvedContent {
  if (chain.includes(packName)) {
    throw new Error(
      `Circular pack extends detected: ${[...chain, packName].join(" → ")}`
    );
  }

  const pack = loadPack(registryPath, packName);
  const result: ResolvedContent = { skills: [], agents: [], commands: [] };

  // Resolve parent first (extends)
  if (pack.extends) {
    const parent = resolveOnePack(registryPath, pack.extends, [
      ...chain,
      packName,
    ]);
    mergeInto(result, parent);
  }

  // Add this pack's own items
  if (pack.skills) result.skills.push(...pack.skills);
  if (pack.agents) result.agents.push(...pack.agents);
  if (pack.commands) result.commands.push(...pack.commands);

  return result;
}

// ─── Override application ────────────────────────────────────────────────────

/**
 * Apply project-level include/exclude overrides on top of resolved pack content.
 */
export function applyOverrides(
  base: ResolvedContent,
  config: ResolvedConfig
): ResolvedContent {
  return {
    skills: applyOverride(
      base.skills,
      config.skills.include,
      config.skills.exclude
    ),
    agents: applyOverride(
      base.agents,
      config.agents.include,
      config.agents.exclude
    ),
    commands: applyOverride(
      base.commands,
      config.commands.include,
      config.commands.exclude
    ),
  };
}

function applyOverride(
  base: string[],
  include: string[],
  exclude: string[]
): string[] {
  const set = new Set([...base, ...include]);
  for (const item of exclude) set.delete(item);
  return Array.from(set);
}

// ─── Validation (registry mode) ──────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRegistry(registryPath: string): ValidationResult {
  const errors: string[] = [];

  // Validate skills
  const skillsDir = path.join(registryPath, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillMd)) {
        errors.push(`Skill "${entry.name}" is missing SKILL.md`);
      }
    }
  }

  // Validate packs
  const packNames = listAvailablePacks(registryPath);
  const availableSkills = new Set(listAvailableSkills(registryPath));
  const availableAgents = new Set(listAvailableAgents(registryPath));
  const availableCommands = new Set(listAvailableCommands(registryPath));

  for (const packName of packNames) {
    try {
      const pack = loadPack(registryPath, packName);

      // Validate extends reference
      if (pack.extends && !packNames.includes(pack.extends)) {
        errors.push(
          `Pack "${packName}" extends unknown pack "${pack.extends}"`
        );
      }

      // Validate extends chains for cycles
      try {
        resolveOnePack(registryPath, packName, []);
      } catch (err) {
        errors.push(String(err));
      }

      // Validate referenced content exists
      for (const skill of pack.skills ?? []) {
        if (!availableSkills.has(skill)) {
          errors.push(
            `Pack "${packName}" references unknown skill "${skill}"`
          );
        }
      }
      for (const agent of pack.agents ?? []) {
        if (!availableAgents.has(agent)) {
          errors.push(
            `Pack "${packName}" references unknown agent "${agent}"`
          );
        }
      }
      for (const cmd of pack.commands ?? []) {
        if (!availableCommands.has(cmd)) {
          errors.push(
            `Pack "${packName}" references unknown command "${cmd}"`
          );
        }
      }
    } catch (err) {
      errors.push(`Pack "${packName}" failed to load: ${err}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mergeInto(target: ResolvedContent, source: ResolvedContent): void {
  target.skills.push(...source.skills);
  target.agents.push(...source.agents);
  target.commands.push(...source.commands);
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
