import path from "node:path";
import { readProjectConfig, detectContext, resolveConfig, readGlobalConfig } from "../core/config.js";
import { readLockFile } from "../core/lock.js";
import { getAllProjects } from "../core/state.js";
import { resolveTargets } from "../targets.js";
import { auditSymlinks } from "../core/symlinks.js";
import { log } from "../utils/output.js";
import chalk from "chalk";

export interface StatusCommandOptions {
  all?: boolean;
  cwd?: string;
}

export async function runStatus(options: StatusCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  if (options.all) {
    await statusAll();
    return;
  }

  const context = detectContext(cwd);
  if (context === "unconfigured") {
    log.error("No .syncer.yaml found. Run `syncer init` to set up this project.");
    process.exit(1);
  }
  if (context === "registry") {
    log.info("This is a registry. Use `syncer sync` to validate.");
    return;
  }

  const config = readProjectConfig(cwd);
  const globalConfig = readGlobalConfig();
  const resolved = resolveConfig(config, globalConfig);
  const lock = readLockFile(cwd);
  const targets = resolveTargets(resolved.targets);

  log.blank();
  log.info(chalk.bold("Project status"));
  log.dim(`  Registry: ${resolved.registry}`);
  log.dim(`  Version:  ${resolved.version}`);
  log.dim(`  Targets:  ${resolved.targets.join(", ")}`);

  if (!lock) {
    log.warn("  No lock file — run `syncer sync` first.");
    return;
  }

  log.blank();
  log.info(`  Last synced: ${lock.resolved_at}`);
  log.info(`  Registry commit: ${lock.registry_commit.slice(0, 8)}`);
  log.info(`  Packs: ${lock.packs.join(", ") || "(none)"}`);

  if (lock.skills.length) {
    log.info(`  Skills (${lock.skills.length}): ${lock.skills.map((s) => s.name).join(", ")}`);
  }
  if (lock.agents.length) {
    log.info(`  Agents (${lock.agents.length}): ${lock.agents.map((a) => a.name).join(", ")}`);
  }
  if (lock.commands.length) {
    log.info(`  Commands (${lock.commands.length}): ${lock.commands.map((c) => c.name).join(", ")}`);
  }

  // Symlink audit
  log.blank();
  for (const target of targets) {
    const audit = auditSymlinks(target);
    if (audit.broken.length > 0) {
      log.warn(`  Broken symlinks in ${target.name}:`);
      for (const b of audit.broken) log.warn(`    ${b}`);
    } else {
      log.success(`  ${target.name}: ${audit.valid.length} symlinks OK`);
    }
  }
}

async function statusAll(): Promise<void> {
  const projects = getAllProjects();
  const entries = Object.entries(projects);
  if (entries.length === 0) {
    log.warn("No known projects.");
    return;
  }

  log.blank();
  log.info(chalk.bold("All known projects:"));
  for (const [projectPath, state] of entries) {
    const lock = readLockFile(projectPath);
    const commit = lock?.registry_commit.slice(0, 8) ?? "no lock";
    log.dim(`  ${projectPath}`);
    log.dim(`    Last sync: ${state.last_sync}  commit: ${commit}`);
  }
}
