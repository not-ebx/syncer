import path from "node:path";
import { readProjectConfig, detectContext } from "../core/config.js";
import { sync } from "../core/syncer.js";
import { getAllProjects } from "../core/state.js";
import { log } from "../utils/output.js";
import { validateRegistry } from "../core/resolver.js";
import { registryCachePath } from "../core/registry.js";

export interface SyncCommandOptions {
  all?: boolean;
  noFetch?: boolean;
  cwd?: string;
}

export async function runSync(options: SyncCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  if (options.all) {
    await syncAll(options.noFetch);
    return;
  }

  const context = detectContext(cwd);

  if (context === "registry") {
    await syncRegistry(cwd);
    return;
  }

  if (context === "unconfigured") {
    log.error("No .syncer.yaml found. Run `syncer init` to set up this project.");
    process.exit(1);
  }

  // Project sync
  const config = readProjectConfig(cwd);
  const result = await sync(config, { noFetch: options.noFetch, cwd });

  log.blank();
  if (result.added.skills.length || result.added.agents.length || result.added.commands.length) {
    log.success("Synced:");
    if (result.added.skills.length) log.info(`  Skills:   ${result.added.skills.join(", ")}`);
    if (result.added.agents.length) log.info(`  Agents:   ${result.added.agents.join(", ")}`);
    if (result.added.commands.length) log.info(`  Commands: ${result.added.commands.join(", ")}`);
  }
  if (result.unchanged.skills.length || result.unchanged.agents.length || result.unchanged.commands.length) {
    log.dim("Already up to date: " +
      [
        ...result.unchanged.skills,
        ...result.unchanged.agents,
        ...result.unchanged.commands,
      ].join(", ")
    );
  }
  log.success(`Registry commit: ${result.registryCommit.slice(0, 8)}`);
}

async function syncAll(noFetch?: boolean): Promise<void> {
  const projects = getAllProjects();
  const entries = Object.entries(projects);
  if (entries.length === 0) {
    log.warn("No known projects. Run `syncer sync` in a project first.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const [projectPath] of entries) {
    try {
      log.info(`Syncing ${projectPath}...`);
      const config = readProjectConfig(projectPath);
      await sync(config, { noFetch, cwd: projectPath });
      ok++;
    } catch (err) {
      log.error(`  Failed: ${err}`);
      fail++;
    }
  }
  log.blank();
  log.success(`Done: ${ok} succeeded, ${fail} failed.`);
}

async function syncRegistry(cwd: string): Promise<void> {
  const { validateRegistry: validate } = await import("../core/resolver.js");
  const result = validate(cwd);
  if (result.valid) {
    log.success("Registry is valid.");
  } else {
    log.error("Registry validation failed:");
    for (const err of result.errors) log.error(`  • ${err}`);
    process.exit(1);
  }
}
