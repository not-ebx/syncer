import {
  readProjectConfig,
  detectContext,
  resolveConfig,
  readGlobalConfig,
} from "../core/config.js";
import { registryCachePath } from "../core/registry.js";
import {
  listAvailableSkills,
  listAvailableAgents,
  listAvailableCommands,
  listAvailablePacks,
  loadPack,
} from "../core/resolver.js";
import { log } from "../utils/output.js";
import chalk from "chalk";
import fs from "node:fs";

type ListTarget = "skills" | "agents" | "commands" | "packs" | "all";

export async function runList(
  what: ListTarget = "all",
  options: { cwd?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const context = detectContext(cwd);

  let cachePath: string;

  if (context === "registry") {
    cachePath = cwd;
  } else if (context === "project") {
    const config = readProjectConfig(cwd);
    const globalConfig = readGlobalConfig();
    const resolved = resolveConfig(config, globalConfig);
    if (!resolved.registry) {
      log.error("No registry configured.");
      process.exit(1);
    }
    cachePath = registryCachePath(resolved.registry);
    if (!fs.existsSync(cachePath)) {
      log.error("No local registry cache. Run `syncer sync` first.");
      process.exit(1);
    }
  } else {
    log.error("No .syncer.yaml found. Run `syncer init` first.");
    process.exit(1);
  }

  log.blank();

  if (what === "skills" || what === "all") {
    const skills = listAvailableSkills(cachePath);
    log.info(chalk.bold(`Skills (${skills.length}):`));
    if (skills.length === 0) log.dim("  (none)");
    else skills.forEach((s) => log.dim(`  • ${s}`));
  }

  if (what === "agents" || what === "all") {
    const agents = listAvailableAgents(cachePath);
    log.info(chalk.bold(`Agents (${agents.length}):`));
    if (agents.length === 0) log.dim("  (none)");
    else agents.forEach((a) => log.dim(`  • ${a}`));
  }

  if (what === "commands" || what === "all") {
    const commands = listAvailableCommands(cachePath);
    log.info(chalk.bold(`Commands (${commands.length}):`));
    if (commands.length === 0) log.dim("  (none)");
    else commands.forEach((c) => log.dim(`  • ${c}`));
  }

  if (what === "packs" || what === "all") {
    const packs = listAvailablePacks(cachePath);
    log.info(chalk.bold(`Packs (${packs.length}):`));
    for (const packName of packs) {
      try {
        const pack = loadPack(cachePath, packName);
        const desc = pack.description ? chalk.dim(` — ${pack.description}`) : "";
        const ext = pack.extends ? chalk.dim(` (extends ${pack.extends})`) : "";
        log.dim(`  • ${packName}${desc}${ext}`);
      } catch {
        log.dim(`  • ${packName}`);
      }
    }
    if (packs.length === 0) log.dim("  (none)");
  }
}
