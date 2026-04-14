import fs from "node:fs";
import path from "node:path";
import { readProjectConfig, detectContext, resolveConfig, readGlobalConfig, PROJECT_CACHE_DIR } from "../core/config.js";
import { readLockFile } from "../core/lock.js";
import { registryCachePath } from "../core/registry.js";
import { resolveTargets } from "../targets.js";
import { auditSymlinks } from "../core/symlinks.js";
import { log } from "../utils/output.js";
import { simpleGit } from "simple-git";

/**
 * Fetch the remote and return the latest commit on the tracked branch.
 * Returns null if offline or fetch fails.
 */
async function fetchRemoteCommit(cachePath: string, version: string): Promise<string | null> {
  try {
    const git = simpleGit(cachePath);
    await git.fetch(["--prune"]);

    const isLatest = version === "latest";
    if (isLatest) {
      // Resolve origin/HEAD → origin/<branch> → commit
      let branch = "main";
      try {
        const ref = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
        branch = ref.trim().replace("refs/remotes/origin/", "");
      } catch {
        const branches = await git.branch(["-r"]);
        branch = branches.all.includes("origin/main") ? "main" : "master";
      }
      const commit = await git.revparse([`origin/${branch}`]);
      return commit.trim();
    } else {
      // Pinned to a tag or commit — FETCH_HEAD is the fetched tip; for tags/commits
      // what matters is whether the local checkout matches the lock (no remote check needed)
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Fetch the remote and return the latest commit on a specific branch.
 * Returns null if offline or fetch fails.
 */
async function fetchBranchCommit(cachePath: string, branch: string): Promise<string | null> {
  try {
    const git = simpleGit(cachePath);
    await git.fetch(["--prune"]);
    const commit = await git.revparse([`origin/${branch}`]);
    return commit.trim();
  } catch {
    return null;
  }
}

export interface CheckCommandOptions {
  cwd?: string;
  quiet?: boolean;
}

/**
 * Lightweight out-of-sync check — no network, no writes.
 * Exits 0 if up to date, exits 1 if out of sync.
 * Suitable for use in hooks.
 */
export async function runCheck(options: CheckCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const quiet = options.quiet ?? false;

  const context = detectContext(cwd);
  if (context === "unconfigured") {
    if (!quiet) log.error("No .syncer.yaml found. Run `syncer init` to set up this project.");
    process.exit(1);
  }
  if (context === "registry") {
    if (!quiet) log.info("This is a registry — use `syncer sync` to validate.");
    process.exit(0);
  }

  const config = readProjectConfig(cwd);
  const globalConfig = readGlobalConfig();
  const resolved = resolveConfig(config, globalConfig);
  const lock = readLockFile(cwd);

  if (!lock) {
    if (!quiet) log.warn("Out of sync: no lock file. Run `syncer sync`.");
    process.exit(1);
  }

  const cachePath = registryCachePath(resolved.registry!);
  if (!fs.existsSync(cachePath)) {
    if (!quiet) log.warn("Out of sync: no registry cache. Run `syncer sync`.");
    process.exit(1);
  }

  const version = resolved.version ?? "latest";
  const isLatest = version === "latest";

  if (isLatest) {
    // Fetch remote and compare its HEAD to the lock
    const remoteCommit = await fetchRemoteCommit(cachePath, version);
    if (remoteCommit === null) {
      // Offline — fall back to comparing local cache HEAD with lock
      let cacheCommit: string;
      try {
        const git = simpleGit(cachePath);
        cacheCommit = (await git.revparse(["HEAD"])).trim();
      } catch {
        if (!quiet) log.warn("Out of sync: could not read registry cache commit.");
        process.exit(1);
      }
      if (cacheCommit! !== lock.registry_commit) {
        if (!quiet) log.warn(`Out of sync (offline): local cache is at ${cacheCommit!.slice(0, 8)}, lock is at ${lock.registry_commit.slice(0, 8)}. Run \`syncer sync\`.`);
        process.exit(1);
      }
    } else if (remoteCommit !== lock.registry_commit) {
      if (!quiet) log.warn(`Out of sync: registry is at ${remoteCommit.slice(0, 8)}, lock is at ${lock.registry_commit.slice(0, 8)}. Run \`syncer sync\`.`);
      process.exit(1);
    }
  } else {
    const refType = lock.locked_ref_type;

    if (refType === "tag") {
      // Tags are immutable — local cache match is sufficient, no network needed
      let cacheCommit: string;
      try {
        const git = simpleGit(cachePath);
        cacheCommit = (await git.revparse(["HEAD"])).trim();
      } catch {
        if (!quiet) log.warn("Out of sync: could not read registry cache commit.");
        process.exit(1);
      }
      if (cacheCommit! !== lock.registry_commit) {
        if (!quiet) log.warn(`Out of sync: local cache is at ${cacheCommit!.slice(0, 8)}, lock is at ${lock.registry_commit.slice(0, 8)}. Run \`syncer sync\`.`);
        process.exit(1);
      }
    } else if (refType === "branch" && lock.locked_ref) {
      // Branch — fetch and check if remote branch has moved
      const remoteCommit = await fetchBranchCommit(cachePath, lock.locked_ref);
      if (remoteCommit === null) {
        // Offline — fall back to local cache comparison
        let cacheCommit: string;
        try {
          const git = simpleGit(cachePath);
          cacheCommit = (await git.revparse(["HEAD"])).trim();
        } catch {
          if (!quiet) log.warn("Out of sync: could not read registry cache commit.");
          process.exit(1);
        }
        if (cacheCommit! !== lock.registry_commit) {
          if (!quiet) log.warn(`Out of sync (offline): local cache is at ${cacheCommit!.slice(0, 8)}, lock is at ${lock.registry_commit.slice(0, 8)}. Run \`syncer sync\`.`);
          process.exit(1);
        }
      } else if (remoteCommit !== lock.registry_commit) {
        if (!quiet) log.warn(`Out of sync: branch "${lock.locked_ref}" is at ${remoteCommit.slice(0, 8)}, lock is at ${lock.registry_commit.slice(0, 8)}. Run \`syncer sync\`.`);
        process.exit(1);
      }
    } else {
      // Commit hash or old lock file without ref type — compare local cache HEAD with lock
      let cacheCommit: string;
      try {
        const git = simpleGit(cachePath);
        cacheCommit = (await git.revparse(["HEAD"])).trim();
      } catch {
        if (!quiet) log.warn("Out of sync: could not read registry cache commit.");
        process.exit(1);
      }
      if (cacheCommit! !== lock.registry_commit) {
        if (!quiet) log.warn(`Out of sync: local cache is at ${cacheCommit!.slice(0, 8)}, lock is at ${lock.registry_commit.slice(0, 8)}. Run \`syncer sync\`.`);
        process.exit(1);
      }
    }
  }

  // Check symlinks
  const targets = resolveTargets(resolved.targets);
  const brokenLinks: string[] = [];
  for (const target of targets) {
    const audit = auditSymlinks(target);
    brokenLinks.push(...audit.broken);
  }

  if (brokenLinks.length > 0) {
    if (!quiet) {
      log.warn("Out of sync: broken symlinks detected:");
      for (const b of brokenLinks) log.warn(`  ${b}`);
      log.warn("Run `syncer sync` to fix.");
    }
    process.exit(1);
  }

  if (!quiet) log.success("Up to date.");
  process.exit(0);
}
