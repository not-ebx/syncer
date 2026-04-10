import path from "node:path";
import fs from "node:fs";
import {
  readProjectConfig,
  detectContext,
  resolveConfig,
  readGlobalConfig,
  PROJECT_CACHE_DIR,
  CACHE_DIR,
} from "../core/config.js";
import { readLockFile } from "../core/lock.js";
import { resolveTargets } from "../targets.js";
import { auditSymlinks } from "../core/symlinks.js";
import { log } from "../utils/output.js";
import { dirSha256, fileSha256 } from "../utils/fs.js";
import chalk from "chalk";

export interface DoctorOptions {
  resetCache?: boolean;
  cwd?: string;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const context = detectContext(cwd);

  if (context === "unconfigured") {
    log.error("No .syncer.yaml found.");
    process.exit(1);
  }

  const issues: string[] = [];
  log.info(chalk.bold("Running diagnostics...\n"));

  // 1. Check global cache dir
  if (!fs.existsSync(CACHE_DIR)) {
    issues.push("Global cache directory missing (~/.syncer/cache/)");
  } else {
    log.success(`Global cache exists: ${CACHE_DIR}`);
  }

  if (context === "registry") {
    log.info("This is a registry — limited diagnostics available.");
    if (issues.length === 0) log.success("No issues found.");
    else issues.forEach((i) => log.warn(`  • ${i}`));
    return;
  }

  const config = readProjectConfig(cwd);
  const globalConfig = readGlobalConfig();
  const resolved = resolveConfig(config, globalConfig);
  const lock = readLockFile(cwd);
  const targets = resolveTargets(resolved.targets);

  // 2. Check project cache dir
  const projectCacheDir = path.join(cwd, PROJECT_CACHE_DIR);
  if (!fs.existsSync(projectCacheDir)) {
    issues.push("Project cache (.syncer/) missing — run `syncer sync`");
  } else {
    log.success("Project cache (.syncer/) exists");
  }

  // 3. Check lock file
  if (!lock) {
    issues.push("No lock file — run `syncer sync`");
  } else {
    log.success(`Lock file found (synced at ${lock.resolved_at})`);

    // 4. Hash verification
    const skillsCacheDir = path.join(projectCacheDir, "skills");
    const agentsCacheDir = path.join(projectCacheDir, "agents");
    const commandsCacheDir = path.join(projectCacheDir, "commands");

    for (const entry of lock.skills) {
      const skillDir = path.join(skillsCacheDir, entry.name);
      if (!fs.existsSync(skillDir)) {
        issues.push(`Skill "${entry.name}" missing from cache`);
        continue;
      }
      const currentHash = `sha256:${dirSha256(skillDir)}`;
      if (currentHash !== entry.hash) {
        issues.push(
          `Skill "${entry.name}" hash mismatch (possible tampering or stale cache)`
        );
      }
    }

    for (const entry of lock.agents) {
      const agentFile = path.join(agentsCacheDir, `${entry.name}.md`);
      if (!fs.existsSync(agentFile)) {
        issues.push(`Agent "${entry.name}" missing from cache`);
        continue;
      }
      const currentHash = `sha256:${fileSha256(agentFile)}`;
      if (currentHash !== entry.hash) {
        issues.push(`Agent "${entry.name}" hash mismatch`);
      }
    }

    for (const entry of lock.commands) {
      const cmdFile = path.join(commandsCacheDir, `${entry.name}.md`);
      if (!fs.existsSync(cmdFile)) {
        issues.push(`Command "${entry.name}" missing from cache`);
        continue;
      }
      const currentHash = `sha256:${fileSha256(cmdFile)}`;
      if (currentHash !== entry.hash) {
        issues.push(`Command "${entry.name}" hash mismatch`);
      }
    }
  }

  // 5. Symlink audit
  for (const target of targets) {
    const audit = auditSymlinks(target);
    if (audit.broken.length > 0) {
      for (const b of audit.broken) {
        issues.push(`Broken symlink: ${b}`);
      }
    } else {
      log.success(`${target.name}: ${audit.valid.length} symlinks OK`);
    }
  }

  // Report
  log.blank();
  if (issues.length === 0) {
    log.success("Everything looks good!");
  } else {
    log.warn(`Found ${issues.length} issue(s):`);
    for (const issue of issues) log.warn(`  • ${issue}`);
    log.blank();
    log.info("Run `syncer sync` to fix most issues.");

    if (options.resetCache) {
      const { removeDir } = await import("../utils/fs.js");
      const { registryCachePath } = await import("../core/registry.js");
      if (resolved.registry) {
        const cachePath = registryCachePath(resolved.registry);
        if (fs.existsSync(cachePath)) {
          removeDir(cachePath);
          log.success("Registry cache reset. Run `syncer sync` to refetch.");
        }
      }
    }
  }
}
