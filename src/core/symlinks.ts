import fs from "node:fs";
import path from "node:path";
import { ensureDir, copyDir } from "../utils/fs.js";
import type { TargetDef } from "../types.js";

export type LinkMode = "symlink" | "copy";

export interface ConflictResolution {
  backup: boolean; // user confirmed backup
}

/**
 * Create a symlink (relative path) or copy, depending on link_mode.
 * Returns whether a conflict was detected (existing real file/folder).
 */
export async function linkItem(
  src: string,
  dest: string,
  mode: LinkMode,
  onConflict: (dest: string) => Promise<boolean>
): Promise<"created" | "conflict-skipped" | "existed"> {
  // Already correct symlink
  if (mode === "symlink" && fs.existsSync(dest)) {
    try {
      const lstat = fs.lstatSync(dest);
      if (lstat.isSymbolicLink()) {
        const target = fs.readlinkSync(dest);
        const absTarget = path.resolve(path.dirname(dest), target);
        if (absTarget === src) return "existed";
        // Wrong symlink — remove and recreate
        fs.unlinkSync(dest);
      } else {
        // Real file/folder — conflict
        const confirmed = await onConflict(dest);
        if (!confirmed) return "conflict-skipped";
        // Back up
        fs.renameSync(dest, `${dest}.bak`);
      }
    } catch {
      // Continue to create
    }
  }

  if (mode === "copy") {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      copyDir(src, dest);
    } else {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
    }
    return "created";
  }

  // Symlink mode
  ensureDir(path.dirname(dest));
  const relSrc = path.relative(path.dirname(dest), src);
  fs.symlinkSync(relSrc, dest);
  return "created";
}

/**
 * Remove symlinks managed by syncer that are no longer in the resolved list.
 * Only removes symlinks — never real files/dirs.
 */
export function removeStaleLinks(
  targetDef: TargetDef,
  managedItems: { skills: string[]; agents: string[]; commands: string[] },
  projectCacheDir: string
): string[] {
  const removed: string[] = [];

  removed.push(
    ...removeStaleInDir(
      targetDef.skills,
      managedItems.skills,
      path.join(projectCacheDir, "skills"),
      false // skills are folders
    )
  );

  removed.push(
    ...removeStaleInDir(
      targetDef.agents,
      managedItems.agents.map((a) => `${a}.md`),
      path.join(projectCacheDir, "agents"),
      true // agents are files
    )
  );

  removed.push(
    ...removeStaleInDir(
      targetDef.commands,
      managedItems.commands.map((c) => `${c}.md`),
      path.join(projectCacheDir, "commands"),
      true
    )
  );

  return removed;
}

function removeStaleInDir(
  targetDir: string,
  keepNames: string[],
  cacheDir: string,
  _isFile: boolean
): string[] {
  const removed: string[] = [];
  if (!fs.existsSync(targetDir)) return removed;

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;

    const entryPath = path.join(targetDir, entry.name);
    const linkTarget = fs.readlinkSync(entryPath);
    const absTarget = path.resolve(targetDir, linkTarget);

    // Only remove if this symlink points into our cache dir
    if (!absTarget.startsWith(cacheDir)) continue;

    if (!keepNames.includes(entry.name)) {
      fs.unlinkSync(entryPath);
      removed.push(entryPath);
    }
  }

  return removed;
}

/** Audit symlinks in target directories for broken links */
export function auditSymlinks(targetDef: TargetDef): {
  broken: string[];
  valid: string[];
} {
  const broken: string[] = [];
  const valid: string[] = [];

  for (const dir of [targetDef.skills, targetDef.agents, targetDef.commands]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      const linkPath = path.join(dir, entry.name);
      const target = fs.readlinkSync(linkPath);
      const absTarget = path.resolve(dir, target);
      if (fs.existsSync(absTarget)) {
        valid.push(linkPath);
      } else {
        broken.push(linkPath);
      }
    }
  }

  return { broken, valid };
}
