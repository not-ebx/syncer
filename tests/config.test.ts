import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { stringify } from "yaml";
import {
  readProjectConfig,
  writeProjectConfig,
  detectContext,
  resolveConfig,
} from "../src/core/config.js";
import type { ProjectConfig, GlobalConfig } from "../src/types.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "syncer-config-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("detectContext", () => {
  it("returns unconfigured for empty dir", () => {
    expect(detectContext(tmpDir)).toBe("unconfigured");
  });

  it("returns project when .syncer.yaml exists", () => {
    fs.writeFileSync(path.join(tmpDir, ".syncer.yaml"), "registry: git@github.com:org/reg.git\n");
    expect(detectContext(tmpDir)).toBe("project");
  });

  it("returns registry when .syncer-registry.yaml exists", () => {
    fs.writeFileSync(path.join(tmpDir, ".syncer-registry.yaml"), "name: my-registry\n");
    expect(detectContext(tmpDir)).toBe("registry");
  });

  it("registry takes precedence over project", () => {
    fs.writeFileSync(path.join(tmpDir, ".syncer.yaml"), "registry: x\n");
    fs.writeFileSync(path.join(tmpDir, ".syncer-registry.yaml"), "name: x\n");
    expect(detectContext(tmpDir)).toBe("registry");
  });
});

describe("readProjectConfig / writeProjectConfig", () => {
  it("round-trips a config", () => {
    const config: ProjectConfig = {
      registry: "git@github.com:org/reg.git",
      targets: ["claude", "codex"],
      packs: { include: ["default"] },
    };
    writeProjectConfig(tmpDir, config);
    const read = readProjectConfig(tmpDir);
    expect(read.registry).toBe(config.registry);
    expect(read.targets).toEqual(["claude", "codex"]);
    expect(read.packs?.include).toEqual(["default"]);
  });

  it("throws if no config file", () => {
    expect(() => readProjectConfig(tmpDir)).toThrow("No .syncer.yaml found");
  });
});

describe("resolveConfig", () => {
  it("uses project registry over global default", () => {
    const project: ProjectConfig = { registry: "git@github.com:org/proj.git" };
    const global: GlobalConfig = { default_registry: "git@github.com:org/global.git" };
    const resolved = resolveConfig(project, global);
    expect(resolved.registry).toBe("git@github.com:org/proj.git");
  });

  it("falls back to global registry when project has none", () => {
    const project: ProjectConfig = {};
    const global: GlobalConfig = { default_registry: "git@github.com:org/global.git" };
    const resolved = resolveConfig(project, global);
    expect(resolved.registry).toBe("git@github.com:org/global.git");
  });

  it("defaults targets to [claude]", () => {
    const resolved = resolveConfig({}, {});
    expect(resolved.targets).toEqual(["claude"]);
  });

  it("uses global default_pack when project has no packs", () => {
    const resolved = resolveConfig({}, { default_pack: "default" });
    expect(resolved.packs).toEqual(["default"]);
  });

  it("project packs override global default_pack", () => {
    const project: ProjectConfig = { packs: { include: ["frontend"] } };
    const global: GlobalConfig = { default_pack: "default" };
    const resolved = resolveConfig(project, global);
    expect(resolved.packs).toEqual(["frontend"]);
  });

  it("defaults version to latest", () => {
    const resolved = resolveConfig({}, {});
    expect(resolved.version).toBe("latest");
  });

  it("defaults link_mode to symlink", () => {
    const resolved = resolveConfig({}, {});
    expect(resolved.link_mode).toBe("symlink");
  });
});
