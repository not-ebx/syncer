import fs from "node:fs";
import path from "node:path";
import simpleGit from "simple-git";
import { CACHE_DIR } from "./config.js";
import { ensureDir, urlToKey } from "../utils/fs.js";

/** Returns the path to the registry clone for a given URL */
export function registryCachePath(registryUrl: string): string {
  return path.join(CACHE_DIR, urlToKey(registryUrl));
}

export interface RegistryInfo {
  cachePath: string;
  commit: string;
  fromCache: boolean; // true if offline and using cached version
}

/**
 * Ensure the registry is cloned/fetched and checked out at the target version.
 * Returns the path to the working tree and the current commit hash.
 */
export async function ensureRegistry(
  registryUrl: string,
  version = "latest"
): Promise<RegistryInfo> {
  ensureDir(CACHE_DIR);
  const cachePath = registryCachePath(registryUrl);

  if (fs.existsSync(cachePath)) {
    return await fetchRegistry(cachePath, registryUrl, version);
  } else {
    return await cloneRegistry(cachePath, registryUrl, version);
  }
}

async function cloneRegistry(
  cachePath: string,
  registryUrl: string,
  version: string
): Promise<RegistryInfo> {
  const git = simpleGit();
  const isLatest = version === "latest";

  try {
    if (isLatest) {
      await git.clone(registryUrl, cachePath, ["--depth=1"]);
    } else {
      // Full clone needed for tag/commit/branch checkout
      await git.clone(registryUrl, cachePath);
    }

    const repoGit = simpleGit(cachePath);
    if (!isLatest) {
      await repoGit.checkout(version);
    }

    const commit = await getCommitHash(repoGit);
    return { cachePath, commit, fromCache: false };
  } catch (err) {
    // If clone failed and no cache exists, rethrow
    if (!fs.existsSync(cachePath)) throw err;
    // Partial clone — clean up and rethrow
    fs.rmSync(cachePath, { recursive: true, force: true });
    throw err;
  }
}

async function fetchRegistry(
  cachePath: string,
  registryUrl: string,
  version: string
): Promise<RegistryInfo> {
  const repoGit = simpleGit(cachePath);

  try {
    await repoGit.fetch(["--prune"]);

    const isLatest = version === "latest";
    if (isLatest) {
      // Checkout default branch (main or master)
      const defaultBranch = await getDefaultBranch(repoGit);
      await repoGit.checkout(defaultBranch);
      await repoGit.pull();
    } else {
      await repoGit.checkout(version);
      // Pull only if it's a branch (not a tag or commit hash)
      const isBranchLike = !/^[0-9a-f]{7,40}$/.test(version);
      if (isBranchLike) {
        try {
          await repoGit.pull();
        } catch {
          // May not have upstream tracking — ignore
        }
      }
    }

    const commit = await getCommitHash(repoGit);
    return { cachePath, commit, fromCache: false };
  } catch {
    // Offline or fetch failed — use whatever is checked out
    const commit = await getCommitHash(repoGit).catch(() => "unknown");
    return { cachePath, commit, fromCache: true };
  }
}

async function getCommitHash(git: ReturnType<typeof simpleGit>): Promise<string> {
  const result = await git.revparse(["HEAD"]);
  return result.trim();
}

async function getDefaultBranch(
  git: ReturnType<typeof simpleGit>
): Promise<string> {
  try {
    // Try to get the symbolic ref of origin/HEAD
    const result = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
    return result.trim().replace("refs/remotes/origin/", "");
  } catch {
    // Fallback: try main, then master
    const branches = await git.branch(["-r"]);
    if (branches.all.includes("origin/main")) return "main";
    return "master";
  }
}

/** List all available tags in the registry */
export async function listRegistryTags(
  registryUrl: string
): Promise<string[]> {
  const cachePath = registryCachePath(registryUrl);
  if (!fs.existsSync(cachePath)) return [];
  const git = simpleGit(cachePath);
  const tags = await git.tags();
  return tags.all;
}

/** List all remote branches in the registry cache */
export async function listRegistryBranches(
  registryUrl: string
): Promise<string[]> {
  const cachePath = registryCachePath(registryUrl);
  if (!fs.existsSync(cachePath)) return [];
  const git = simpleGit(cachePath);
  const branches = await git.branch(["-r"]);
  return branches.all
    .map((b) => b.trim().replace(/^origin\//, ""))
    .filter((b) => b !== "HEAD");
}

/**
 * Determine what type of ref a version string is.
 * Returns null if the ref is not found in the cached registry.
 */
export async function resolveRefType(
  registryUrl: string,
  ref: string
): Promise<"tag" | "branch" | "commit" | null> {
  if (/^[0-9a-f]{7,40}$/.test(ref)) return "commit";
  const tags = await listRegistryTags(registryUrl);
  if (tags.includes(ref)) return "tag";
  const branches = await listRegistryBranches(registryUrl);
  if (branches.includes(ref)) return "branch";
  return null;
}

/** Read a file from the registry cache */
export function registryFile(cachePath: string, ...segments: string[]): string {
  return path.join(cachePath, ...segments);
}

/** Check if the registry cache exists */
export function registryCacheExists(registryUrl: string): boolean {
  return fs.existsSync(registryCachePath(registryUrl));
}
