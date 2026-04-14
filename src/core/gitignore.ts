import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "../utils/fs.js";
import type { ResolvedContent } from "../types.js";

const BLOCK_START = "# >>> syncer managed (do not edit) >>>";
const BLOCK_END = "# <<< syncer managed <<<";

// Entries always ignored inside .syncer/
const SYNCER_DIR_ENTRIES = ["cache/", "skills/", "agents/", "commands/", ".last-sync"];

/**
 * Idempotently writes a managed block in a .gitignore file.
 * Content outside the block is preserved. If entries is empty, the block is
 * removed; if the file becomes empty, it is deleted.
 */
export function upsertManagedBlock(gitignorePath: string, entries: string[]): void {
  let existing = "";
  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, "utf8");
  }

  const startIdx = existing.indexOf(BLOCK_START);
  const endIdx = existing.indexOf(BLOCK_END);

  let before = existing;
  let after = "";

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    before = existing.slice(0, startIdx);
    after = existing.slice(endIdx + BLOCK_END.length);
    if (after.startsWith("\n")) after = after.slice(1);
  }

  before = before.trimEnd();
  after = after.trimEnd();

  if (entries.length === 0) {
    const result = [before, after].filter(Boolean).join("\n");
    if (result) {
      fs.writeFileSync(gitignorePath, result + "\n", "utf8");
    } else if (fs.existsSync(gitignorePath)) {
      fs.rmSync(gitignorePath);
    }
    return;
  }

  const block = [BLOCK_START, ...entries, BLOCK_END].join("\n");
  const parts = [before, block, after].filter(Boolean);
  fs.writeFileSync(gitignorePath, parts.join("\n") + "\n", "utf8");
}

/**
 * Ensures .syncer/.gitignore exists with the standard managed block that
 * hides cache/generated content while keeping config.yaml and .gitignore
 * committed.
 */
export function updateSyncerDirGitignore(projectRoot: string): void {
  const syncerDir = path.join(projectRoot, ".syncer");
  ensureDir(syncerDir);
  upsertManagedBlock(path.join(syncerDir, ".gitignore"), SYNCER_DIR_ENTRIES);
}

/**
 * Updates (or creates) a managed block in <targetBase>/.gitignore listing
 * all syncer-managed symlinks. Only runs if targetBase exists.
 */
export function updateTargetGitignore(
  targetBase: string,
  projectRoot: string,
  entries: string[]
): void {
  const absBase = path.join(projectRoot, targetBase);
  if (!fs.existsSync(absBase)) return;
  upsertManagedBlock(path.join(absBase, ".gitignore"), entries);
}

/**
 * Derives gitignore-relative paths for all items in a ResolvedContent.
 * e.g. skills/foo, agents/bar.md, commands/baz.md
 */
export function computeManagedEntries(content: ResolvedContent): string[] {
  return [
    ...content.skills.map((s) => `skills/${s}`),
    ...content.agents.map((a) => `agents/${a}.md`),
    ...content.commands.map((c) => `commands/${c}.md`),
  ];
}
