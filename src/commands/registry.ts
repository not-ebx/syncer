import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import {
  detectContext,
  PROJECT_CONFIG_FILE,
  REGISTRY_MARKER_FILE,
} from "../core/config.js";
import {
  loadPack,
  listAvailablePacks,
  listAvailableSkills,
  listAvailableAgents,
  listAvailableCommands,
  resolvePacks,
} from "../core/resolver.js";
import { log } from "../utils/output.js";
import chalk from "chalk";
import type { PackDef } from "../types.js";

// ─── Context guard ────────────────────────────────────────────────────────────

function requireRegistry(cwd: string): void {
  const context = detectContext(cwd);
  if (context === "registry") return;

  log.error("This command only works inside a registry.");
  log.blank();

  if (context === "project") {
    log.info(
      `This directory is a ${chalk.bold("project")} (${PROJECT_CONFIG_FILE} found), not a registry.`
    );
    log.info("A registry is a separate Git repo that stores skills, agents, and commands.");
    log.blank();
    log.info("To include a pack from your registry into this project, run:");
    log.dim("  syncer include pack <name>");
    log.info("To see available packs, run:");
    log.dim("  syncer list packs");
  } else {
    log.info("A registry is a Git repo marked with a .syncer-registry.yaml file.");
    log.info("To turn this directory into a registry, run:");
    log.dim("  syncer init --registry");
  }

  process.exit(1);
}

// ─── Pack helpers ─────────────────────────────────────────────────────────────

function writePack(registryPath: string, pack: PackDef): void {
  const packsDir = path.join(registryPath, "packs");
  fs.mkdirSync(packsDir, { recursive: true });
  fs.writeFileSync(
    path.join(packsDir, `${pack.name}.yaml`),
    stringify(pack),
    "utf8"
  );
}

type ContentType = "skill" | "agent" | "command";

function packKey(type: ContentType): "skills" | "agents" | "commands" {
  if (type === "skill") return "skills";
  if (type === "agent") return "agents";
  return "commands";
}

function validateContentExists(
  registryPath: string,
  type: ContentType,
  name: string
): void {
  const available =
    type === "skill"
      ? listAvailableSkills(registryPath)
      : type === "agent"
      ? listAvailableAgents(registryPath)
      : listAvailableCommands(registryPath);

  if (!available.includes(name)) {
    log.error(
      `${capitalize(type)} "${name}" does not exist in this registry.`
    );
    log.info(`Available ${type}s: ${available.join(", ") || "(none)"}`);
    process.exit(1);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── syncer registry pack create ─────────────────────────────────────────────

export async function runRegistryPackCreate(
  name: string,
  options: { extends?: string; description?: string; cwd?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  requireRegistry(cwd);

  const packsDir = path.join(cwd, "packs");
  const packFile = path.join(packsDir, `${name}.yaml`);

  if (fs.existsSync(packFile)) {
    log.error(`Pack "${name}" already exists.`);
    process.exit(1);
  }

  if (options.extends) {
    const availablePacks = listAvailablePacks(cwd);
    if (!availablePacks.includes(options.extends)) {
      log.error(`Cannot extend unknown pack "${options.extends}".`);
      log.info(`Available packs: ${availablePacks.join(", ") || "(none)"}`);
      process.exit(1);
    }
  }

  const pack: PackDef = {
    name,
    ...(options.description ? { description: options.description } : {}),
    ...(options.extends ? { extends: options.extends } : {}),
    skills: [],
    agents: [],
    commands: [],
  };

  writePack(cwd, pack);
  log.success(`Created pack "${name}" at packs/${name}.yaml`);

  if (options.extends) {
    log.dim(`  Extends: ${options.extends}`);
  }
  log.blank();
  log.info("Add content with:");
  log.dim(`  syncer registry pack add ${name} skill <skill-name>`);
  log.dim(`  syncer registry pack add ${name} agent <agent-name>`);
  log.dim(`  syncer registry pack add ${name} command <command-name>`);
}

// ─── syncer registry pack add ─────────────────────────────────────────────────

export async function runRegistryPackAdd(
  packName: string,
  type: ContentType,
  itemName: string,
  options: { cwd?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  requireRegistry(cwd);
  validateContentExists(cwd, type, itemName);

  let pack: PackDef;
  try {
    pack = loadPack(cwd, packName);
  } catch {
    log.error(`Pack "${packName}" not found. Create it first:`);
    log.dim(`  syncer registry pack create ${packName}`);
    process.exit(1);
  }

  const key = packKey(type);
  pack[key] ??= [];

  if (pack[key]!.includes(itemName)) {
    log.warn(`${capitalize(type)} "${itemName}" is already in pack "${packName}".`);
    return;
  }

  pack[key]!.push(itemName);
  writePack(cwd, pack);
  log.success(`Added ${type} "${itemName}" to pack "${packName}".`);
}

// ─── syncer registry pack remove ──────────────────────────────────────────────

export async function runRegistryPackRemove(
  packName: string,
  type: ContentType,
  itemName: string,
  options: { cwd?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  requireRegistry(cwd);

  let pack: PackDef;
  try {
    pack = loadPack(cwd, packName);
  } catch {
    log.error(`Pack "${packName}" not found.`);
    process.exit(1);
  }

  const key = packKey(type);
  const list = pack[key] ?? [];
  const idx = list.indexOf(itemName);

  if (idx === -1) {
    log.warn(`${capitalize(type)} "${itemName}" is not in pack "${packName}".`);
    return;
  }

  list.splice(idx, 1);
  pack[key] = list;
  writePack(cwd, pack);
  log.success(`Removed ${type} "${itemName}" from pack "${packName}".`);
}

// ─── syncer registry pack show ────────────────────────────────────────────────

export async function runRegistryPackShow(
  packName: string,
  options: { cwd?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  requireRegistry(cwd);

  let pack: PackDef;
  try {
    pack = loadPack(cwd, packName);
  } catch {
    log.error(`Pack "${packName}" not found.`);
    process.exit(1);
  }

  log.blank();
  log.info(chalk.bold(`Pack: ${packName}`));
  if (pack.description) log.dim(`  ${pack.description}`);
  if (pack.extends) log.dim(`  Extends: ${pack.extends}`);
  log.blank();

  // Show own content
  log.info("Own content:");
  if ((pack.skills ?? []).length) log.dim(`  Skills:   ${pack.skills!.join(", ")}`);
  if ((pack.agents ?? []).length) log.dim(`  Agents:   ${pack.agents!.join(", ")}`);
  if ((pack.commands ?? []).length) log.dim(`  Commands: ${pack.commands!.join(", ")}`);
  if (!pack.skills?.length && !pack.agents?.length && !pack.commands?.length) {
    log.dim("  (empty)");
  }

  // Show resolved (includes inherited content)
  if (pack.extends) {
    log.blank();
    log.info("Resolved (including inherited):");
    try {
      const resolved = resolvePacks(cwd, [packName]);
      if (resolved.skills.length) log.dim(`  Skills:   ${resolved.skills.join(", ")}`);
      if (resolved.agents.length) log.dim(`  Agents:   ${resolved.agents.join(", ")}`);
      if (resolved.commands.length) log.dim(`  Commands: ${resolved.commands.join(", ")}`);
    } catch (err) {
      log.warn(`  Could not resolve: ${err}`);
    }
  }
}

// ─── syncer registry pack list ────────────────────────────────────────────────

export async function runRegistryPackList(
  options: { cwd?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  requireRegistry(cwd);

  const packs = listAvailablePacks(cwd);
  log.blank();
  log.info(chalk.bold(`Packs (${packs.length}):`));

  if (packs.length === 0) {
    log.dim("  (none) — create one with: syncer registry pack create <name>");
    return;
  }

  for (const packName of packs) {
    try {
      const pack = loadPack(cwd, packName);
      const desc = pack.description ? chalk.dim(` — ${pack.description}`) : "";
      const ext = pack.extends ? chalk.dim(` (extends ${pack.extends})`) : "";
      const counts = [
        pack.skills?.length ? `${pack.skills.length} skills` : "",
        pack.agents?.length ? `${pack.agents.length} agents` : "",
        pack.commands?.length ? `${pack.commands.length} commands` : "",
      ]
        .filter(Boolean)
        .join(", ");
      log.dim(`  • ${packName}${desc}${ext}${counts ? chalk.dim(` [${counts}]`) : ""}`);
    } catch {
      log.dim(`  • ${packName} ${chalk.red("(failed to load)")}`);
    }
  }
}

// ─── syncer registry skill|agent|command create ───────────────────────────────

export async function runRegistryContentCreate(
  type: ContentType,
  name: string,
  options: { cwd?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  requireRegistry(cwd);

  if (type === "skill") {
    const skillDir = path.join(cwd, "skills", name);
    if (fs.existsSync(skillDir)) {
      log.error(`Skill "${name}" already exists.`);
      process.exit(1);
    }
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      `# ${name}\n\n<!-- Describe what this skill does and how to use it -->\n`,
      "utf8"
    );
    log.success(`Created skill "${name}" at skills/${name}/SKILL.md`);
  } else {
    const dir = path.join(cwd, `${type}s`);
    const file = path.join(dir, `${name}.md`);
    if (fs.existsSync(file)) {
      log.error(`${capitalize(type)} "${name}" already exists.`);
      process.exit(1);
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      file,
      `# ${name}\n\n<!-- Describe this ${type} -->\n`,
      "utf8"
    );
    log.success(`Created ${type} "${name}" at ${type}s/${name}.md`);
  }
}
