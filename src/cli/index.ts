import { Command } from "commander";
import { runInit } from "../commands/init.js";
import { runSync } from "../commands/sync.js";
import { runStatus } from "../commands/status.js";
import { runInclude } from "../commands/include.js";
import { runExclude } from "../commands/exclude.js";
import { runList } from "../commands/list.js";
import { runDoctor } from "../commands/doctor.js";
import { runCheck } from "../commands/check.js";
import { runLock, runUnlock } from "../commands/lock.js";
import { runConfigGet, runConfigSet } from "../commands/config.js";
import {
  runRegistryPackCreate,
  runRegistryPackAdd,
  runRegistryPackRemove,
  runRegistryPackShow,
  runRegistryPackList,
  runRegistryContentCreate,
} from "../commands/registry.js";

declare const __VERSION__: string;

const program = new Command();

program
  .name("syncer")
  .description("Keep AI agent skills, agents, and commands consistent across all repositories")
  .version(__VERSION__);

// ─── syncer init ─────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Set up Syncer for this project (interactive wizard)")
  .option("--global", "Set up global config (~/.syncer/config.yaml)")
  .option("--registry", "Mark this repo as a skills registry")
  .action(async (opts) => {
    await runInit({ global: opts.global, registry: opts.registry });
  });

// ─── syncer sync ─────────────────────────────────────────────────────────────

program
  .command("sync")
  .description("Fetch registry and sync skills, agents, and commands")
  .option("--all", "Sync all known projects on this machine")
  .option("--no-fetch", "Re-resolve and re-link without fetching registry")
  .action(async (opts) => {
    await runSync({ all: opts.all, noFetch: !opts.fetch });
  });

// ─── syncer status ────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Show what's installed and whether it's current")
  .option("--all", "Show status for all known projects")
  .action(async (opts) => {
    await runStatus({ all: opts.all });
  });

// ─── syncer include ───────────────────────────────────────────────────────────

const include = program
  .command("include")
  .description("Add a pack, skill, agent, or command to this project");

include
  .command("pack <name>")
  .description("Add a pack")
  .action(async (name) => {
    await runInclude("pack", name);
  });

include
  .command("skill <name>")
  .description("Add a skill")
  .action(async (name) => {
    await runInclude("skill", name);
  });

include
  .command("agent <name>")
  .description("Add an agent")
  .action(async (name) => {
    await runInclude("agent", name);
  });

include
  .command("command <name>")
  .description("Add a command")
  .action(async (name) => {
    await runInclude("command", name);
  });

// ─── syncer exclude ───────────────────────────────────────────────────────────

const exclude = program
  .command("exclude")
  .description("Remove or exclude a pack, skill, agent, or command");

exclude
  .command("pack <name>")
  .description("Remove a pack")
  .action(async (name) => {
    await runExclude("pack", name);
  });

exclude
  .command("skill <name>")
  .description("Exclude a skill")
  .action(async (name) => {
    await runExclude("skill", name);
  });

exclude
  .command("agent <name>")
  .description("Exclude an agent")
  .action(async (name) => {
    await runExclude("agent", name);
  });

exclude
  .command("command <name>")
  .description("Exclude a command")
  .action(async (name) => {
    await runExclude("command", name);
  });

// ─── syncer list ──────────────────────────────────────────────────────────────

program
  .command("list [what]")
  .description("List available content from registry (skills, agents, commands, packs)")
  .action(async (what) => {
    const valid = ["skills", "agents", "commands", "packs", "all"] as const;
    const target = valid.includes(what) ? what : "all";
    await runList(target);
  });

// ─── syncer lock / unlock ─────────────────────────────────────────────────────

program
  .command("lock [ref]")
  .description("Lock the registry to a specific branch, tag, or commit")
  .action(async (ref) => {
    await runLock({ ref });
  });

program
  .command("unlock")
  .description("Unlock the registry (track latest)")
  .action(async () => {
    await runUnlock();
  });

// ─── syncer check ────────────────────────────────────────────────────────────

program
  .command("check")
  .description("Check if the project is out of sync (no network, exits 1 if out of sync)")
  .option("-q, --quiet", "Suppress output (useful for hooks)")
  .action(async (opts) => {
    await runCheck({ quiet: opts.quiet });
  });

// ─── syncer doctor ────────────────────────────────────────────────────────────

program
  .command("doctor")
  .description("Diagnose issues (broken symlinks, stale cache, hash mismatches)")
  .option("--reset-cache", "Reset the registry cache")
  .action(async (opts) => {
    await runDoctor({ resetCache: opts.resetCache });
  });

// ─── syncer config ────────────────────────────────────────────────────────────

const configCmd = program
  .command("config")
  .description("Read or write global Syncer config");

configCmd
  .command("get <key>")
  .description("Read a config value")
  .action(async (key) => {
    await runConfigGet(key);
  });

configCmd
  .command("set <key> <value>")
  .description("Write a config value")
  .action(async (key, value) => {
    await runConfigSet(key, value);
  });

// ─── syncer registry ──────────────────────────────────────────────────────────

const registry = program
  .command("registry")
  .description("Manage a skills registry (must be run inside a registry repo)");

// syncer registry pack
const registryPack = registry
  .command("pack")
  .description("Manage packs in this registry");

registryPack
  .command("create <name>")
  .description("Create a new pack")
  .option("-d, --description <text>", "Pack description")
  .option("-e, --extends <pack>", "Extend an existing pack")
  .action(async (name, opts) => {
    await runRegistryPackCreate(name, {
      description: opts.description,
      extends: opts.extends,
    });
  });

registryPack
  .command("add <pack> <type> <name>")
  .description("Add a skill, agent, or command to a pack")
  .action(async (pack, type, name) => {
    const valid = ["skill", "agent", "command"] as const;
    if (!valid.includes(type)) {
      console.error(`Invalid type "${type}". Use: skill, agent, command`);
      process.exit(1);
    }
    await runRegistryPackAdd(pack, type, name);
  });

registryPack
  .command("remove <pack> <type> <name>")
  .description("Remove a skill, agent, or command from a pack")
  .action(async (pack, type, name) => {
    const valid = ["skill", "agent", "command"] as const;
    if (!valid.includes(type)) {
      console.error(`Invalid type "${type}". Use: skill, agent, command`);
      process.exit(1);
    }
    await runRegistryPackRemove(pack, type, name);
  });

registryPack
  .command("show <name>")
  .description("Show a pack's contents (own + resolved via extends)")
  .action(async (name) => {
    await runRegistryPackShow(name);
  });

registryPack
  .command("list")
  .description("List all packs in this registry")
  .action(async () => {
    await runRegistryPackList();
  });

// syncer registry skill|agent|command create
for (const type of ["skill", "agent", "command"] as const) {
  const sub = registry
    .command(type)
    .description(`Manage ${type}s in this registry`);

  sub
    .command("create <name>")
    .description(`Create a new ${type} stub`)
    .action(async (name) => {
      await runRegistryContentCreate(type, name);
    });
}

// ─── Parse ────────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("Error:", err);
  process.exit(1);
});
