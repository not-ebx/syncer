import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse, stringify } from "yaml";
import type { GlobalConfig, ProjectConfig, RegistryMarker } from "../types.js";

// ─── Paths ───────────────────────────────────────────────────────────────────

export const GLOBAL_DIR = path.join(os.homedir(), ".syncer");
export const GLOBAL_CONFIG_PATH = path.join(GLOBAL_DIR, "config.yaml");
export const GLOBAL_STATE_PATH = path.join(GLOBAL_DIR, "state.json");
export const CACHE_DIR = path.join(GLOBAL_DIR, "cache");

export const PROJECT_CONFIG_FILE = ".syncer.yaml";
export const PROJECT_LOCK_FILE = ".syncer.lock";
export const PROJECT_CACHE_DIR = ".syncer";
export const REGISTRY_MARKER_FILE = ".syncer-registry.yaml";

// ─── Context detection ───────────────────────────────────────────────────────

export type Context = "project" | "registry" | "unconfigured";

export function detectContext(cwd: string): Context {
  if (fs.existsSync(path.join(cwd, REGISTRY_MARKER_FILE))) return "registry";
  if (fs.existsSync(path.join(cwd, PROJECT_CONFIG_FILE))) return "project";
  return "unconfigured";
}

// ─── Project config ──────────────────────────────────────────────────────────

export function readProjectConfig(cwd: string): ProjectConfig {
  const configPath = path.join(cwd, PROJECT_CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No .syncer.yaml found. Run \`syncer init\` to set up this project.`
    );
  }
  const raw = fs.readFileSync(configPath, "utf8");
  return parse(raw) as ProjectConfig;
}

export function writeProjectConfig(cwd: string, config: ProjectConfig): void {
  const configPath = path.join(cwd, PROJECT_CONFIG_FILE);
  fs.writeFileSync(configPath, stringify(config), "utf8");
}

// ─── Registry marker ─────────────────────────────────────────────────────────

export function readRegistryMarker(cwd: string): RegistryMarker {
  const markerPath = path.join(cwd, REGISTRY_MARKER_FILE);
  const raw = fs.readFileSync(markerPath, "utf8");
  return parse(raw) as RegistryMarker;
}

export function writeRegistryMarker(
  cwd: string,
  marker: RegistryMarker
): void {
  const markerPath = path.join(cwd, REGISTRY_MARKER_FILE);
  fs.writeFileSync(markerPath, stringify(marker), "utf8");
}

// ─── Global config ───────────────────────────────────────────────────────────

export function readGlobalConfig(): GlobalConfig {
  if (!fs.existsSync(GLOBAL_CONFIG_PATH)) return {};
  const raw = fs.readFileSync(GLOBAL_CONFIG_PATH, "utf8");
  return (parse(raw) as GlobalConfig) ?? {};
}

export function writeGlobalConfig(config: GlobalConfig): void {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  fs.writeFileSync(GLOBAL_CONFIG_PATH, stringify(config), "utf8");
}

// ─── Merged / resolved config ────────────────────────────────────────────────

export interface ResolvedConfig {
  registry: string;
  version: string;
  targets: (string | import("../types.js").CustomTarget)[];
  link_mode: "symlink" | "copy";
  packs: string[];
  skills: { include: string[]; exclude: string[] };
  agents: { include: string[]; exclude: string[] };
  commands: { include: string[]; exclude: string[] };
}

export function resolveConfig(
  project: ProjectConfig,
  global: GlobalConfig
): ResolvedConfig {
  const registry =
    project.registry ?? global.default_registry ?? "";

  const defaultPack = global.default_pack;
  const packIncludes = project.packs?.include ?? [];
  const packs =
    packIncludes.length > 0
      ? packIncludes
      : defaultPack
      ? [defaultPack]
      : [];

  return {
    registry,
    version: project.version ?? "latest",
    targets: project.targets ?? ["claude"],
    link_mode: project.link_mode ?? "symlink",
    packs,
    skills: {
      include: project.skills?.include ?? [],
      exclude: project.skills?.exclude ?? [],
    },
    agents: {
      include: project.agents?.include ?? [],
      exclude: project.agents?.exclude ?? [],
    },
    commands: {
      include: project.commands?.include ?? [],
      exclude: project.commands?.exclude ?? [],
    },
  };
}
