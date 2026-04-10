import {
  readProjectConfig,
  writeProjectConfig,
  detectContext,
} from "../core/config.js";
import { runSync } from "./sync.js";
import { log } from "../utils/output.js";

type ContentType = "skill" | "agent" | "command" | "pack";

export async function runInclude(
  type: ContentType,
  name: string,
  options: { cwd?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const context = detectContext(cwd);

  if (context !== "project") {
    log.error("No .syncer.yaml found. Run `syncer init` first.");
    process.exit(1);
  }

  const config = readProjectConfig(cwd);

  if (type === "pack") {
    config.packs ??= {};
    config.packs.include ??= [];
    if (config.packs.include.includes(name)) {
      log.warn(`Pack "${name}" is already included.`);
      return;
    }
    config.packs.include.push(name);
  } else {
    const key = pluralize(type);
    config[key] ??= {};
    config[key]!.include ??= [];
    config[key]!.exclude ??= [];

    if (config[key]!.include!.includes(name)) {
      log.warn(`${capitalize(type)} "${name}" is already included.`);
      return;
    }
    // Remove from exclude if present
    config[key]!.exclude = config[key]!.exclude!.filter((e) => e !== name);
    config[key]!.include!.push(name);
  }

  writeProjectConfig(cwd, config);
  log.success(`Added ${type} "${name}" to .syncer.yaml`);

  await runSync({ cwd });
}

function pluralize(t: ContentType): "skills" | "agents" | "commands" | "packs" {
  if (t === "skill") return "skills";
  if (t === "agent") return "agents";
  if (t === "command") return "commands";
  return "packs";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
