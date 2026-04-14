import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  upsertManagedBlock,
  updateSyncerDirGitignore,
  updateTargetGitignore,
  computeManagedEntries,
} from "../src/core/gitignore.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "syncer-gitignore-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── upsertManagedBlock ───────────────────────────────────────────────────────

describe("upsertManagedBlock", () => {
  it("creates a new file with the managed block", () => {
    const giPath = path.join(tmpDir, ".gitignore");
    upsertManagedBlock(giPath, ["skills/foo", "agents/bar.md"]);
    const content = fs.readFileSync(giPath, "utf8");
    expect(content).toContain("# >>> syncer managed (do not edit) >>>");
    expect(content).toContain("skills/foo");
    expect(content).toContain("agents/bar.md");
    expect(content).toContain("# <<< syncer managed <<<");
  });

  it("updates an existing block in place", () => {
    const giPath = path.join(tmpDir, ".gitignore");
    upsertManagedBlock(giPath, ["skills/foo"]);
    upsertManagedBlock(giPath, ["skills/bar", "commands/baz.md"]);
    const content = fs.readFileSync(giPath, "utf8");
    expect(content).not.toContain("skills/foo");
    expect(content).toContain("skills/bar");
    expect(content).toContain("commands/baz.md");
  });

  it("preserves user content before and after the block", () => {
    const giPath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(giPath, "node_modules/\ndist/\n", "utf8");
    upsertManagedBlock(giPath, ["skills/foo"]);
    const content = fs.readFileSync(giPath, "utf8");
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
    expect(content).toContain("skills/foo");
  });

  it("preserves user content that appears after the block", () => {
    const giPath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(
      giPath,
      "before/\n# >>> syncer managed (do not edit) >>>\nold-entry\n# <<< syncer managed <<<\nafter/\n",
      "utf8"
    );
    upsertManagedBlock(giPath, ["new-entry"]);
    const content = fs.readFileSync(giPath, "utf8");
    expect(content).toContain("before/");
    expect(content).toContain("after/");
    expect(content).toContain("new-entry");
    expect(content).not.toContain("old-entry");
  });

  it("removes the block when entries is empty", () => {
    const giPath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(giPath, "node_modules/\n", "utf8");
    upsertManagedBlock(giPath, ["skills/foo"]);
    upsertManagedBlock(giPath, []);
    const content = fs.readFileSync(giPath, "utf8");
    expect(content).not.toContain("syncer managed");
    expect(content).not.toContain("skills/foo");
    expect(content).toContain("node_modules/");
  });

  it("deletes the file when entries is empty and no other content", () => {
    const giPath = path.join(tmpDir, ".gitignore");
    upsertManagedBlock(giPath, ["skills/foo"]);
    upsertManagedBlock(giPath, []);
    expect(fs.existsSync(giPath)).toBe(false);
  });

  it("is idempotent — same entries twice produces same output", () => {
    const giPath = path.join(tmpDir, ".gitignore");
    upsertManagedBlock(giPath, ["skills/foo", "agents/bar.md"]);
    const first = fs.readFileSync(giPath, "utf8");
    upsertManagedBlock(giPath, ["skills/foo", "agents/bar.md"]);
    const second = fs.readFileSync(giPath, "utf8");
    expect(first).toBe(second);
  });
});

// ─── updateSyncerDirGitignore ─────────────────────────────────────────────────

describe("updateSyncerDirGitignore", () => {
  it("creates .syncer/.gitignore with standard entries", () => {
    updateSyncerDirGitignore(tmpDir);
    const giPath = path.join(tmpDir, ".syncer", ".gitignore");
    expect(fs.existsSync(giPath)).toBe(true);
    const content = fs.readFileSync(giPath, "utf8");
    expect(content).toContain("cache/");
    expect(content).toContain("skills/");
    expect(content).toContain("agents/");
    expect(content).toContain("commands/");
    expect(content).toContain(".last-sync");
  });

  it("creates .syncer/ directory if it does not exist", () => {
    const syncerDir = path.join(tmpDir, ".syncer");
    expect(fs.existsSync(syncerDir)).toBe(false);
    updateSyncerDirGitignore(tmpDir);
    expect(fs.existsSync(syncerDir)).toBe(true);
  });
});

// ─── updateTargetGitignore ────────────────────────────────────────────────────

describe("updateTargetGitignore", () => {
  it("writes managed block in target base dir", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    updateTargetGitignore(".claude", tmpDir, ["skills/foo", "agents/bar.md"]);
    const content = fs.readFileSync(path.join(tmpDir, ".claude", ".gitignore"), "utf8");
    expect(content).toContain("skills/foo");
    expect(content).toContain("agents/bar.md");
  });

  it("skips if target base dir does not exist", () => {
    updateTargetGitignore(".codex", tmpDir, ["skills/foo"]);
    expect(fs.existsSync(path.join(tmpDir, ".codex", ".gitignore"))).toBe(false);
  });
});

// ─── computeManagedEntries ────────────────────────────────────────────────────

describe("computeManagedEntries", () => {
  it("formats paths correctly for all content types", () => {
    const entries = computeManagedEntries({
      skills: ["my-skill"],
      agents: ["my-agent"],
      commands: ["my-cmd"],
    });
    expect(entries).toContain("skills/my-skill");
    expect(entries).toContain("agents/my-agent.md");
    expect(entries).toContain("commands/my-cmd.md");
  });

  it("returns empty array for empty content", () => {
    const entries = computeManagedEntries({ skills: [], agents: [], commands: [] });
    expect(entries).toHaveLength(0);
  });
});
