import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { linkItem, removeStaleLinks, auditSymlinks } from "../src/core/symlinks.js";
import type { TargetDef } from "../src/types.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "syncer-symlinks-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeTarget(base: string): TargetDef {
  return {
    name: "test",
    base,
    skills: path.join(base, "skills"),
    agents: path.join(base, "agents"),
    commands: path.join(base, "commands"),
  };
}

describe("linkItem (symlink mode)", () => {
  it("creates a symlink", async () => {
    const src = path.join(tmpDir, "src-file.md");
    const destDir = path.join(tmpDir, "target");
    const dest = path.join(destDir, "file.md");
    fs.writeFileSync(src, "content");
    fs.mkdirSync(destDir);

    const result = await linkItem(src, dest, "symlink", async () => false);
    expect(result).toBe("created");
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(true);
  });

  it("returns existed for identical symlink", async () => {
    const src = path.join(tmpDir, "src-file.md");
    const destDir = path.join(tmpDir, "target");
    const dest = path.join(destDir, "file.md");
    fs.writeFileSync(src, "content");
    fs.mkdirSync(destDir);

    await linkItem(src, dest, "symlink", async () => false);
    const result = await linkItem(src, dest, "symlink", async () => false);
    expect(result).toBe("existed");
  });

  it("returns conflict-skipped when real file exists and user declines", async () => {
    const src = path.join(tmpDir, "src-file.md");
    const destDir = path.join(tmpDir, "target");
    const dest = path.join(destDir, "file.md");
    fs.writeFileSync(src, "source");
    fs.mkdirSync(destDir);
    fs.writeFileSync(dest, "existing content");

    const result = await linkItem(src, dest, "symlink", async () => false);
    expect(result).toBe("conflict-skipped");
    // Original file untouched
    expect(fs.readFileSync(dest, "utf8")).toBe("existing content");
  });

  it("backs up and creates symlink when user confirms", async () => {
    const src = path.join(tmpDir, "src-file.md");
    const destDir = path.join(tmpDir, "target");
    const dest = path.join(destDir, "file.md");
    fs.writeFileSync(src, "source");
    fs.mkdirSync(destDir);
    fs.writeFileSync(dest, "existing content");

    const result = await linkItem(src, dest, "symlink", async () => true);
    expect(result).toBe("created");
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(`${dest}.bak`)).toBe(true);
    expect(fs.readFileSync(`${dest}.bak`, "utf8")).toBe("existing content");
  });
});

describe("linkItem (copy mode)", () => {
  it("copies a file", async () => {
    const src = path.join(tmpDir, "src.md");
    const destDir = path.join(tmpDir, "target");
    const dest = path.join(destDir, "dest.md");
    fs.writeFileSync(src, "hello");
    fs.mkdirSync(destDir);

    const result = await linkItem(src, dest, "copy", async () => false);
    expect(result).toBe("created");
    expect(fs.readFileSync(dest, "utf8")).toBe("hello");
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
  });
});

describe("removeStaleLinks", () => {
  it("removes symlinks that point to cache but are no longer managed", () => {
    const targetBase = path.join(tmpDir, "target");
    const cacheDir = path.join(tmpDir, ".syncer");
    const agentsCache = path.join(cacheDir, "agents");
    const agentsTarget = path.join(targetBase, "agents");

    fs.mkdirSync(agentsCache, { recursive: true });
    fs.mkdirSync(agentsTarget, { recursive: true });

    // Create a stale managed symlink
    const agentFile = path.join(agentsCache, "old-agent.md");
    fs.writeFileSync(agentFile, "# old");
    const symlinkPath = path.join(agentsTarget, "old-agent.md");
    fs.symlinkSync(path.relative(agentsTarget, agentFile), symlinkPath);

    const target = makeTarget(targetBase);
    const removed = removeStaleLinks(
      target,
      { skills: [], agents: [], commands: [] }, // nothing managed
      cacheDir
    );

    expect(removed).toContain(symlinkPath);
    expect(fs.existsSync(symlinkPath)).toBe(false);
  });

  it("does not remove non-syncer symlinks", () => {
    const targetBase = path.join(tmpDir, "target");
    const externalDir = path.join(tmpDir, "external");
    const agentsTarget = path.join(targetBase, "agents");

    fs.mkdirSync(externalDir, { recursive: true });
    fs.mkdirSync(agentsTarget, { recursive: true });

    // Symlink pointing OUTSIDE cache
    const externalFile = path.join(externalDir, "my-agent.md");
    fs.writeFileSync(externalFile, "# external");
    const symlinkPath = path.join(agentsTarget, "my-agent.md");
    fs.symlinkSync(path.relative(agentsTarget, externalFile), symlinkPath);

    const cacheDir = path.join(tmpDir, ".syncer");
    fs.mkdirSync(cacheDir, { recursive: true });

    const target = makeTarget(targetBase);
    removeStaleLinks(target, { skills: [], agents: [], commands: [] }, cacheDir);

    // Should still exist
    expect(fs.existsSync(symlinkPath)).toBe(true);
  });
});

describe("auditSymlinks", () => {
  it("detects broken symlinks", () => {
    const targetBase = path.join(tmpDir, "target");
    const agentsTarget = path.join(targetBase, "agents");
    fs.mkdirSync(agentsTarget, { recursive: true });

    const symlinkPath = path.join(agentsTarget, "broken.md");
    fs.symlinkSync("/nonexistent/path/broken.md", symlinkPath);

    const target = makeTarget(targetBase);
    const { broken, valid } = auditSymlinks(target);
    expect(broken).toContain(symlinkPath);
    expect(valid).toHaveLength(0);
  });

  it("identifies valid symlinks", () => {
    const targetBase = path.join(tmpDir, "target");
    const agentsTarget = path.join(targetBase, "agents");
    const realFile = path.join(tmpDir, "real.md");
    fs.mkdirSync(agentsTarget, { recursive: true });
    fs.writeFileSync(realFile, "content");

    const symlinkPath = path.join(agentsTarget, "real.md");
    fs.symlinkSync(path.relative(agentsTarget, realFile), symlinkPath);

    const target = makeTarget(targetBase);
    const { broken, valid } = auditSymlinks(target);
    expect(valid).toContain(symlinkPath);
    expect(broken).toHaveLength(0);
  });
});
