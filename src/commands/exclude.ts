import {
  readProjectConfig,
  writeProjectConfig,
  detectContext,
} from "../core/config.js";
import { runSync } from "./sync.js";
import { log } from "../utils/output.js";

type ContentType = "skill" | "agent" | "command" | "pack";

export async function runExclude(
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
    // Packs don't have an exclude list — just remove from include
    config.packs ??= {};
    config.packs.include ??= [];
    const idx = config.packs.include.indexOf(name);
    if (idx === -1) {
      log.warn(`Pack "${name}" is not in packs.include.`);
      return;
    }
    config.packs.include.splice(idx, 1);
    log.success(`Removed pack "${name}" from .syncer.yaml`);
  } else {
    const key = pluralize(type);
    config[key] ??= {};
    config[key]!.include ??= [];
    config[key]!.exclude ??= [];

    const inInclude = config[key]!.include!.indexOf(name);
    if (inInclude !== -1) {
      // Was individually included — just remove from include
      config[key]!.include!.splice(inInclude, 1);
      log.success(`Removed ${type} "${name}" from include list.`);
    } else {
      // Came from a pack — add to exclude
      if (config[key]!.exclude!.includes(name)) {
        log.warn(`${capitalize(type)} "${name}" is already excluded.`);
        return;
      }
      config[key]!.exclude!.push(name);
      log.success(`Added ${type} "${name}" to exclude list.`);
    }
  }

  writeProjectConfig(cwd, config);
  await runSync({ cwd });
}

function pluralize(t: Exclude<ContentType, "pack">): "skills" | "agents" | "commands" {
  if (t === "skill") return "skills";
  if (t === "agent") return "agents";
  return "commands";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
