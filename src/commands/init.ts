import fs from "node:fs";
import path from "node:path";
import {
  input,
  checkbox,
  confirm,
  select,
} from "@inquirer/prompts";
import {
  detectContext,
  writeProjectConfig,
  writeGlobalConfig,
  writeRegistryMarker,
  readGlobalConfig,
  findProjectConfigPath,
  REGISTRY_MARKER_FILE,
} from "../core/config.js";
import { ensureRegistry, listRegistryBranches, listRegistryTags } from "../core/registry.js";
import {
  listAvailablePacks,
  listAvailableSkills,
  listAvailableAgents,
  listAvailableCommands,
  loadPack,
} from "../core/resolver.js";
import { detectTargets, ALL_KNOWN_TARGET_NAMES } from "../targets.js";
import { updateSyncerDirGitignore } from "../core/gitignore.js";
import { runSync } from "./sync.js";
import { log } from "../utils/output.js";
import type { ProjectConfig } from "../types.js";

export interface InitOptions {
  global?: boolean;
  registry?: boolean;
  cwd?: string;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  // ── --global: set up ~/.syncer/config.yaml ───────────────────────────────
  if (options.global) {
    await initGlobal();
    return;
  }

  // ── --registry: mark repo as a registry ──────────────────────────────────
  if (options.registry) {
    await initRegistry(cwd);
    return;
  }

  // ── Project init ─────────────────────────────────────────────────────────
  await initProject(cwd);
}

// ─── Global init ─────────────────────────────────────────────────────────────

async function initGlobal(): Promise<void> {
  const existing = readGlobalConfig();

  log.info("Setting up global Syncer config (~/.syncer/config.yaml)\n");

  const registry = await input({
    message: "Default registry Git URL:",
    default: existing.default_registry ?? "",
  });

  const defaultPack = await input({
    message: "Default pack name:",
    default: existing.default_pack ?? "default",
  });

  writeGlobalConfig({
    default_registry: registry || undefined,
    default_pack: defaultPack || undefined,
  });

  log.success("Global config saved to ~/.syncer/config.yaml");
}

// ─── Registry init ────────────────────────────────────────────────────────────

async function initRegistry(cwd: string): Promise<void> {
  if (fs.existsSync(path.join(cwd, REGISTRY_MARKER_FILE))) {
    log.warn("This directory is already a registry (.syncer-registry.yaml found).");
    return;
  }

  const name = await input({
    message: "Registry name:",
    default: path.basename(cwd),
  });

  const description = await input({
    message: "Registry description (optional):",
    default: "",
  });

  writeRegistryMarker(cwd, { name, description: description || undefined });

  // Create standard directories
  for (const dir of ["skills", "agents", "commands", "packs"]) {
    fs.mkdirSync(path.join(cwd, dir), { recursive: true });
  }

  log.success(`Registry initialized: ${name}`);
  log.info("Created: skills/, agents/, commands/, packs/");
  log.info("Add skills (folders with SKILL.md), agents (.md files), commands (.md files), and packs (.yaml files).");
}

// ─── Project init wizard ──────────────────────────────────────────────────────

async function initProject(cwd: string): Promise<void> {
  // Guard: already configured
  if (findProjectConfigPath(cwd)) {
    log.warn(
      "This project is already configured (syncer config found).\n" +
      "To reconfigure, remove the config and run `syncer init` again."
    );
    return;
  }

  const globalConfig = readGlobalConfig();
  log.info("Setting up Syncer for this project.\n");

  // ── Step 1: Registry ──────────────────────────────────────────────────────
  const registryUrl = await input({
    message: "Which skills registry do you want to use? (Git URL)",
    default: globalConfig.default_registry ?? "",
    validate: (v) => v.trim() !== "" || "Registry URL is required",
  });

  // Fetch registry to enable pack/content selection
  let registryCachePath: string | null = null;
  let isOffline = false;

  try {
    log.info("Fetching registry...");
    const info = await ensureRegistry(registryUrl, "latest");
    registryCachePath = info.cachePath;
    if (info.fromCache) {
      isOffline = true;
      log.warn("Offline — using cached registry for selections.");
    } else {
      log.success("Registry fetched.");
    }
  } catch {
    isOffline = true;
    log.warn(
      "Could not reach registry. You can configure content later with `syncer include` / `syncer sync`."
    );
  }

  // ── Step 2: Detect targets ────────────────────────────────────────────────
  const detectedTargets = await detectTargets(cwd);
  const targetChoices = ALL_KNOWN_TARGET_NAMES.map((name) => ({
    name: detectedTargets.includes(name) ? `${name}  (detected)` : name,
    value: name,
    checked: detectedTargets.includes(name),
  }));

  const selectedTargets = await checkbox({
    message: "Which AI agent tools do you want to sync to?",
    choices: targetChoices,
  });

  if (selectedTargets.length === 0) {
    selectedTargets.push("claude"); // default
  }

  // ── Step 3: Select packs ──────────────────────────────────────────────────
  let selectedPacks: string[] = [];

  if (registryCachePath && !isOffline) {
    const availablePacks = listAvailablePacks(registryCachePath);
    if (availablePacks.length > 0) {
      const packChoices = availablePacks.map((name) => {
        let description = "";
        try {
          const pack = loadPack(registryCachePath!, name);
          description = pack.description ? ` — ${pack.description}` : "";
        } catch { /* ignore */ }
        return { name: `${name}${description}`, value: name, checked: false };
      });

      selectedPacks = await checkbox({
        message: "Which packs do you want to include?",
        choices: packChoices,
      });
    }
  } else if (globalConfig.default_pack) {
    selectedPacks = [globalConfig.default_pack];
  }

  // ── Step 4: Individual content (optional) ─────────────────────────────────
  let extraSkills: string[] = [];
  let excludeSkills: string[] = [];
  let extraAgents: string[] = [];
  let excludeAgents: string[] = [];
  let extraCommands: string[] = [];
  let excludeCommands: string[] = [];

  if (registryCachePath) {
    const wantIndividual = await confirm({
      message:
        "Do you want to add or exclude individual skills, agents, or commands?\n" +
        "  (You can always do this later with `syncer include` / `syncer exclude`)",
      default: false,
    });

    if (wantIndividual) {
      const availableSkills = listAvailableSkills(registryCachePath);
      if (availableSkills.length > 0) {
        extraSkills = await checkbox({
          message: "Include additional skills:",
          choices: availableSkills.map((s) => ({ name: s, value: s })),
        });
        excludeSkills = await checkbox({
          message: "Exclude skills:",
          choices: availableSkills.map((s) => ({ name: s, value: s })),
        });
      }

      const availableAgents = listAvailableAgents(registryCachePath);
      if (availableAgents.length > 0) {
        extraAgents = await checkbox({
          message: "Include additional agents:",
          choices: availableAgents.map((a) => ({ name: a, value: a })),
        });
        excludeAgents = await checkbox({
          message: "Exclude agents:",
          choices: availableAgents.map((a) => ({ name: a, value: a })),
        });
      }

      const availableCommands = listAvailableCommands(registryCachePath);
      if (availableCommands.length > 0) {
        extraCommands = await checkbox({
          message: "Include additional commands:",
          choices: availableCommands.map((c) => ({ name: c, value: c })),
        });
        excludeCommands = await checkbox({
          message: "Exclude commands:",
          choices: availableCommands.map((c) => ({ name: c, value: c })),
        });
      }
    }
  }

  // ── Step 5: Version pinning ───────────────────────────────────────────────
  let versionPin = "latest";

  if (registryCachePath && !isOffline) {
    const branches = await listRegistryBranches(registryUrl);
    const tags = await listRegistryTags(registryUrl);

    const priority = ["main", "master"];
    const prioritized = priority.filter((b) => branches.includes(b));
    const rest = branches.filter((b) => !priority.includes(b)).sort();

    const choices = [
      { name: "latest (track default branch)", value: "latest" },
      ...prioritized.map((b) => ({ name: `branch: ${b}`, value: b })),
      ...rest.map((b) => ({ name: `branch: ${b}`, value: b })),
      ...tags.map((t) => ({ name: `tag: ${t}`, value: t })),
    ];

    versionPin = await select({
      message: "Which registry version do you want to track?",
      choices,
    });
  } else {
    versionPin = await input({
      message: "Pin to a specific registry version? (default: latest)",
      default: "latest",
    });
  }

  // ── Step 6: Summary + confirm ─────────────────────────────────────────────
  log.blank();
  log.info("Ready to create .syncer.yaml:");
  log.dim(`  Registry: ${registryUrl}`);
  log.dim(`  Targets:  ${selectedTargets.join(", ")}`);
  log.dim(`  Packs:    ${selectedPacks.join(", ") || "(none)"}`);
  if (extraSkills.length) log.dim(`  +Skills:  ${extraSkills.join(", ")}`);
  if (excludeSkills.length) log.dim(`  -Skills:  ${excludeSkills.join(", ")}`);
  if (extraAgents.length) log.dim(`  +Agents:  ${extraAgents.join(", ")}`);
  if (excludeAgents.length) log.dim(`  -Agents:  ${excludeAgents.join(", ")}`);
  if (extraCommands.length) log.dim(`  +Cmds:    ${extraCommands.join(", ")}`);
  if (excludeCommands.length) log.dim(`  -Cmds:    ${excludeCommands.join(", ")}`);
  log.dim(`  Version:  ${versionPin}`);
  log.blank();

  const doCreate = await confirm({
    message: "Create config and run first sync?",
    default: true,
  });

  if (!doCreate) {
    log.warn("Aborted.");
    return;
  }

  // ── Write config ──────────────────────────────────────────────────────────
  const projectConfig: ProjectConfig = {
    registry: registryUrl,
  };

  if (versionPin !== "latest") projectConfig.version = versionPin;
  if (selectedTargets.length > 0 && !(selectedTargets.length === 1 && selectedTargets[0] === "claude")) {
    projectConfig.targets = selectedTargets;
  }
  if (selectedPacks.length > 0) {
    projectConfig.packs = { include: selectedPacks };
  }
  if (extraSkills.length || excludeSkills.length) {
    projectConfig.skills = {};
    if (extraSkills.length) projectConfig.skills.include = extraSkills;
    if (excludeSkills.length) projectConfig.skills.exclude = excludeSkills;
  }
  if (extraAgents.length || excludeAgents.length) {
    projectConfig.agents = {};
    if (extraAgents.length) projectConfig.agents.include = extraAgents;
    if (excludeAgents.length) projectConfig.agents.exclude = excludeAgents;
  }
  if (extraCommands.length || excludeCommands.length) {
    projectConfig.commands = {};
    if (extraCommands.length) projectConfig.commands.include = extraCommands;
    if (excludeCommands.length) projectConfig.commands.exclude = excludeCommands;
  }

  writeProjectConfig(cwd, projectConfig);
  log.success(".syncer/syncer.yaml created");

  // Set up .syncer/.gitignore so cache/generated content is not committed
  updateSyncerDirGitignore(cwd);
  log.success(".syncer/.gitignore created");

  // First sync
  if (!isOffline) {
    log.blank();
    await runSync({ cwd });
  } else {
    log.warn("Skipping sync (offline). Run `syncer sync` when you have network access.");
  }
}
