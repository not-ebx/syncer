import { select, input } from "@inquirer/prompts";
import {
  detectContext,
  readProjectConfig,
  writeProjectConfig,
  readGlobalConfig,
  resolveConfig,
} from "../core/config.js";
import {
  ensureRegistry,
  listRegistryBranches,
  listRegistryTags,
  resolveRefType,
  registryCachePath,
} from "../core/registry.js";
import { runSync } from "./sync.js";
import { log } from "../utils/output.js";

export interface LockOptions {
  ref?: string;
  cwd?: string;
}

export async function runLock(options: LockOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  const context = detectContext(cwd);
  if (context === "unconfigured") {
    log.error("No .syncer.yaml found. Run `syncer init` to set up this project.");
    process.exit(1);
  }
  if (context === "registry") {
    log.error("This is a registry, not a project.");
    process.exit(1);
  }

  const config = readProjectConfig(cwd);
  const globalConfig = readGlobalConfig();
  const resolved = resolveConfig(config, globalConfig);

  if (!resolved.registry) {
    log.error("No registry configured. Set `registry` in .syncer.yaml or run `syncer init`.");
    process.exit(1);
  }

  // Ensure registry is fetched so we can query refs
  log.info("Fetching registry...");
  try {
    await ensureRegistry(resolved.registry, resolved.version);
  } catch {
    // If offline, try using existing cache
    if (!registryCachePath(resolved.registry)) {
      log.error("Could not reach registry and no local cache found.");
      process.exit(1);
    }
    log.warn("Offline — using cached registry for ref lookup.");
  }

  let ref = options.ref;

  if (ref) {
    // Validate the provided ref
    const refType = await resolveRefType(resolved.registry, ref);
    if (refType === null) {
      log.error(`Ref "${ref}" not found in registry. Check branches and tags with \`syncer list\`.`);
      process.exit(1);
    }
  } else {
    // Interactive picker
    const branches = await listRegistryBranches(resolved.registry);
    const tags = await listRegistryTags(resolved.registry);

    if (branches.length === 0 && tags.length === 0) {
      log.warn("No branches or tags found in registry cache. Try syncing first.");
      // Fall back to free text
      ref = await input({
        message: "Enter branch, tag, or commit to lock to:",
        default: resolved.version === "latest" ? "" : resolved.version,
      });
      if (!ref || ref === "latest") {
        log.warn("No ref selected.");
        return;
      }
    } else {
      // Prioritize main/master at top, then other branches, then tags
      const priority = ["main", "master"];
      const prioritized = priority.filter((b) => branches.includes(b));
      const rest = branches.filter((b) => !priority.includes(b)).sort();

      const choices = [
        { name: "latest (track default branch)", value: "latest" },
        ...prioritized.map((b) => ({ name: `branch: ${b}`, value: b })),
        ...rest.map((b) => ({ name: `branch: ${b}`, value: b })),
        ...tags.map((t) => ({ name: `tag: ${t}`, value: t })),
      ];

      ref = await select({
        message: "Select a registry branch or tag to lock to:",
        choices,
      });
    }
  }

  if (!ref || ref === "latest") {
    // User chose latest — delegate to unlock
    await runUnlock({ cwd });
    return;
  }

  // Write version to config
  config.version = ref;
  writeProjectConfig(cwd, config);

  const refType = await resolveRefType(resolved.registry, ref);
  const typeLabel = refType === "branch" ? "branch" : refType === "tag" ? "tag" : "commit";
  log.success(`Locked to ${typeLabel}: ${ref}`);

  // Re-sync with new version
  log.blank();
  await runSync({ cwd });
}

export async function runUnlock(options: { cwd?: string } = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  const context = detectContext(cwd);
  if (context === "unconfigured") {
    log.error("No .syncer.yaml found. Run `syncer init` to set up this project.");
    process.exit(1);
  }

  const config = readProjectConfig(cwd);
  if (!config.version || config.version === "latest") {
    log.info("Already tracking latest.");
    return;
  }

  const prev = config.version;
  delete config.version;
  writeProjectConfig(cwd, config);
  log.success(`Unlocked from "${prev}" — now tracking latest.`);

  log.blank();
  await runSync({ cwd });
}
