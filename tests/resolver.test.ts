import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { stringify } from "yaml";
import {
  loadPack,
  resolvePacks,
  applyOverrides,
  listAvailableSkills,
  listAvailableAgents,
  listAvailableCommands,
  listAvailablePacks,
} from "../src/core/resolver.js";
import type { ResolvedConfig } from "../src/core/config.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "syncer-test-"));
  // Create registry structure
  fs.mkdirSync(path.join(tmpDir, "packs"));
  fs.mkdirSync(path.join(tmpDir, "skills", "code-review"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "skills", "testing"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "skills", "deploy"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "agents"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "commands"), { recursive: true });

  fs.writeFileSync(path.join(tmpDir, "skills", "code-review", "SKILL.md"), "# Code Review");
  fs.writeFileSync(path.join(tmpDir, "skills", "testing", "SKILL.md"), "# Testing");
  fs.writeFileSync(path.join(tmpDir, "skills", "deploy", "SKILL.md"), "# Deploy");
  fs.writeFileSync(path.join(tmpDir, "agents", "explorer.md"), "# Explorer");
  fs.writeFileSync(path.join(tmpDir, "agents", "reviewer.md"), "# Reviewer");
  fs.writeFileSync(path.join(tmpDir, "commands", "lint.md"), "# Lint");
  fs.writeFileSync(path.join(tmpDir, "commands", "deploy.md"), "# Deploy cmd");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writePack(name: string, content: object) {
  fs.writeFileSync(
    path.join(tmpDir, "packs", `${name}.yaml`),
    stringify(content)
  );
}

// ─── loadPack ────────────────────────────────────────────────────────────────

describe("loadPack", () => {
  it("loads a pack by name", () => {
    writePack("base", { name: "base", skills: ["code-review"] });
    const pack = loadPack(tmpDir, "base");
    expect(pack.name).toBe("base");
    expect(pack.skills).toEqual(["code-review"]);
  });

  it("throws for unknown pack", () => {
    expect(() => loadPack(tmpDir, "nonexistent")).toThrow('Pack "nonexistent" not found');
  });
});

// ─── resolvePacks ─────────────────────────────────────────────────────────────

describe("resolvePacks", () => {
  it("resolves a simple pack", () => {
    writePack("default", {
      name: "default",
      skills: ["code-review", "testing"],
      agents: ["explorer"],
      commands: ["lint"],
    });

    const result = resolvePacks(tmpDir, ["default"]);
    expect(result.skills).toContain("code-review");
    expect(result.skills).toContain("testing");
    expect(result.agents).toContain("explorer");
    expect(result.commands).toContain("lint");
  });

  it("resolves pack with extends", () => {
    writePack("base", { name: "base", skills: ["code-review"], agents: ["explorer"] });
    writePack("extended", {
      name: "extended",
      extends: "base",
      skills: ["testing"],
    });

    const result = resolvePacks(tmpDir, ["extended"]);
    expect(result.skills).toContain("code-review");
    expect(result.skills).toContain("testing");
    expect(result.agents).toContain("explorer");
  });

  it("deduplicates items from multiple packs", () => {
    writePack("a", { name: "a", skills: ["code-review"] });
    writePack("b", { name: "b", skills: ["code-review", "testing"] });

    const result = resolvePacks(tmpDir, ["a", "b"]);
    const codeReviewCount = result.skills.filter((s) => s === "code-review").length;
    expect(codeReviewCount).toBe(1);
  });

  it("detects circular extends", () => {
    writePack("a", { name: "a", extends: "b", skills: [] });
    writePack("b", { name: "b", extends: "a", skills: [] });

    expect(() => resolvePacks(tmpDir, ["a"])).toThrow("Circular pack extends");
  });

  it("returns empty for no packs", () => {
    const result = resolvePacks(tmpDir, []);
    expect(result.skills).toHaveLength(0);
    expect(result.agents).toHaveLength(0);
    expect(result.commands).toHaveLength(0);
  });
});

// ─── applyOverrides ───────────────────────────────────────────────────────────

describe("applyOverrides", () => {
  const base = {
    skills: ["code-review", "deploy"],
    agents: ["explorer"],
    commands: ["lint"],
  };

  const emptyConfig: ResolvedConfig = {
    registry: "",
    version: "latest",
    targets: ["claude"],
    link_mode: "symlink",
    packs: [],
    skills: { include: [], exclude: [] },
    agents: { include: [], exclude: [] },
    commands: { include: [], exclude: [] },
  };

  it("passes through with no overrides", () => {
    const result = applyOverrides(base, emptyConfig);
    expect(result.skills).toContain("code-review");
    expect(result.skills).toContain("deploy");
  });

  it("adds extra includes", () => {
    const config = { ...emptyConfig, skills: { include: ["testing"], exclude: [] } };
    const result = applyOverrides(base, config);
    expect(result.skills).toContain("testing");
  });

  it("applies excludes", () => {
    const config = { ...emptyConfig, skills: { include: [], exclude: ["deploy"] } };
    const result = applyOverrides(base, config);
    expect(result.skills).not.toContain("deploy");
    expect(result.skills).toContain("code-review");
  });

  it("include + exclude together: exclude wins", () => {
    const config = {
      ...emptyConfig,
      skills: { include: ["testing"], exclude: ["testing"] },
    };
    const result = applyOverrides(base, config);
    expect(result.skills).not.toContain("testing");
  });
});

// ─── list helpers ────────────────────────────────────────────────────────────

describe("list helpers", () => {
  it("lists skills", () => {
    const skills = listAvailableSkills(tmpDir);
    expect(skills).toContain("code-review");
    expect(skills).toContain("testing");
  });

  it("lists agents", () => {
    const agents = listAvailableAgents(tmpDir);
    expect(agents).toContain("explorer");
    expect(agents).toContain("reviewer");
  });

  it("lists commands", () => {
    const commands = listAvailableCommands(tmpDir);
    expect(commands).toContain("lint");
  });

  it("lists packs", () => {
    writePack("default", { name: "default" });
    const packs = listAvailablePacks(tmpDir);
    expect(packs).toContain("default");
  });
});
