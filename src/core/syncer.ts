import fs from "node:fs";
import path from "node:path";
import { resolveConfig, readGlobalConfig, PROJECT_CACHE_DIR } from "./config.js";
import { ensureRegistry } from "./registry.js";
import { resolvePacks, applyOverrides } from "./resolver.js";
import { linkItem, removeStaleLinks } from "./symlinks.js";
import { buildLockFile, writeLockFile, writeLastSync } from "./lock.js";
import { resolveRefType } from "./registry.js";
import { recordSync } from "./state.js";
import { ensureDir, copyDir } from "../utils/fs.js";
import { resolveTargets } from "../targets.js";
import type { ProjectConfig, ResolvedContent, SyncResult } from "../types.js";
import { log, spinner } from "../utils/output.js";
import { readLockFile } from "./lock.js";

export interface SyncOptions {
  noFetch?: boolean;
  cwd?: string;
  onConflict?: (dest: string) => Promise<boolean>;
}

export async function sync(
  projectConfig: ProjectConfig,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const cwd = options.cwd ?? process.cwd();
  const globalConfig = readGlobalConfig();
  const resolved = resolveConfig(projectConfig, globalConfig);

  if (!resolved.registry) {
    throw new Error(
      "No registry configured. Set `registry` in .syncer.yaml or run `syncer init`."
    );
  }

  // ── 1. Update registry cache ──────────────────────────────────────────────
  let spin = spinner("Fetching registry...");
  let registryInfo: Awaited<ReturnType<typeof ensureRegistry>>;

  if (options.noFetch) {
    const { registryCachePath } = await import("./registry.js");
    const cachePath = registryCachePath(resolved.registry);
    if (!fs.existsSync(cachePath)) {
      spin.fail("No local cache found. Run without --no-fetch first.");
      throw new Error("No registry cache found.");
    }
    const { simpleGit } = await import("simple-git");
    const git = simpleGit(cachePath);
    const commit = (await git.revparse(["HEAD"])).trim();
    registryInfo = { cachePath, commit, fromCache: true };
    spin.succeed("Using local cache (--no-fetch).");
  } else {
    try {
      registryInfo = await ensureRegistry(resolved.registry, resolved.version);
      if (registryInfo.fromCache) {
        spin.warn("Offline — using cached registry.");
      } else {
        spin.succeed("Registry up to date.");
      }
    } catch (err) {
      spin.fail(`Failed to fetch registry: ${err}`);
      throw err;
    }
  }

  const { cachePath, commit } = registryInfo;

  // ── 1b. Check if we're out of sync ───────────────────────────────────────
  const existingLock = readLockFile(cwd);
  const isOutOfSync = !existingLock || existingLock.registry_commit !== commit;
  if (isOutOfSync) {
    log.warn("Not up to date — fetching updates...");
  }

  // ── 2. Resolve content list ───────────────────────────────────────────────
  spin = spinner("Resolving content...");
  let packResolved: ResolvedContent;
  try {
    packResolved = resolvePacks(cachePath, resolved.packs);
  } catch (err) {
    spin.fail(`Pack resolution failed: ${err}`);
    throw err;
  }
  const finalContent = applyOverrides(packResolved, resolved);
  spin.succeed(
    `Resolved: ${finalContent.skills.length} skills, ${finalContent.agents.length} agents, ${finalContent.commands.length} commands`
  );

  // ── 3. Copy resolved content to .syncer/ ─────────────────────────────────
  const projectCacheDir = path.join(cwd, PROJECT_CACHE_DIR);
  ensureDir(projectCacheDir);

  const skillsCacheDir = path.join(projectCacheDir, "skills");
  const agentsCacheDir = path.join(projectCacheDir, "agents");
  const commandsCacheDir = path.join(projectCacheDir, "commands");
  ensureDir(skillsCacheDir);
  ensureDir(agentsCacheDir);
  ensureDir(commandsCacheDir);

  spin = spinner("Copying content...");

  for (const skill of finalContent.skills) {
    const src = path.join(cachePath, "skills", skill);
    const dest = path.join(skillsCacheDir, skill);
    if (fs.existsSync(src)) copyDir(src, dest);
  }
  for (const agent of finalContent.agents) {
    const src = path.join(cachePath, "agents", `${agent}.md`);
    const dest = path.join(agentsCacheDir, `${agent}.md`);
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  }
  for (const cmd of finalContent.commands) {
    const src = path.join(cachePath, "commands", `${cmd}.md`);
    const dest = path.join(commandsCacheDir, `${cmd}.md`);
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  }
  spin.succeed("Content copied to .syncer/");

  // ── 4. Create/update symlinks for each target ─────────────────────────────
  const targets = resolveTargets(resolved.targets);
  const defaultConflictHandler = async (dest: string): Promise<boolean> => {
    log.warn(`Conflict at ${dest} — skipping (pass --force to overwrite)`);
    return false;
  };
  const onConflict = options.onConflict ?? defaultConflictHandler;
  const linkMode = resolved.link_mode;

  spin = spinner("Creating symlinks...");
  const added: ResolvedContent = { skills: [], agents: [], commands: [] };
  const unchanged: ResolvedContent = { skills: [], agents: [], commands: [] };

  for (const target of targets) {
    ensureDir(target.skills);
    ensureDir(target.agents);
    ensureDir(target.commands);

    for (const skill of finalContent.skills) {
      const src = path.join(skillsCacheDir, skill);
      const dest = path.join(target.skills, skill);
      const result = await linkItem(src, dest, linkMode, onConflict);
      if (result === "created") added.skills.push(skill);
      else if (result === "existed") unchanged.skills.push(skill);
    }

    for (const agent of finalContent.agents) {
      const src = path.join(agentsCacheDir, `${agent}.md`);
      const dest = path.join(target.agents, `${agent}.md`);
      const result = await linkItem(src, dest, linkMode, onConflict);
      if (result === "created") added.agents.push(agent);
      else if (result === "existed") unchanged.agents.push(agent);
    }

    for (const cmd of finalContent.commands) {
      const src = path.join(commandsCacheDir, `${cmd}.md`);
      const dest = path.join(target.commands, `${cmd}.md`);
      const result = await linkItem(src, dest, linkMode, onConflict);
      if (result === "created") added.commands.push(cmd);
      else if (result === "existed") unchanged.commands.push(cmd);
    }

    // Remove stale symlinks
    removeStaleLinks(target, finalContent, projectCacheDir);
  }
  spin.succeed("Symlinks created.");

  // ── 5. Write lock file + last-sync ────────────────────────────────────────
  const isLatestVersion = resolved.version === "latest";
  const lockedRef = isLatestVersion ? undefined : resolved.version;
  const lockedRefType = lockedRef
    ? await resolveRefType(resolved.registry, lockedRef) ?? undefined
    : undefined;
  const lockFile = buildLockFile(cachePath, commit, finalContent, resolved.packs, lockedRef, lockedRefType);
  writeLockFile(cwd, lockFile);
  writeLastSync(projectCacheDir, commit);

  // ── 6. Update global state ────────────────────────────────────────────────
  recordSync(cwd, resolved.registry);

  return {
    added: dedupeSyncResult(added),
    removed: { skills: [], agents: [], commands: [] },
    unchanged: dedupeSyncResult(unchanged),
    registryCommit: commit,
  };
}

function dedupeSyncResult(r: ResolvedContent): ResolvedContent {
  return {
    skills: Array.from(new Set(r.skills)),
    agents: Array.from(new Set(r.agents)),
    commands: Array.from(new Set(r.commands)),
  };
}
