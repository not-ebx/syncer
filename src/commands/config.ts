import { readGlobalConfig, writeGlobalConfig } from "../core/config.js";
import { log } from "../utils/output.js";

export async function runConfigGet(key: string): Promise<void> {
  const config = readGlobalConfig();
  const value = (config as Record<string, unknown>)[key];
  if (value === undefined) {
    log.warn(`Key "${key}" is not set.`);
  } else {
    console.log(String(value));
  }
}

export async function runConfigSet(key: string, value: string): Promise<void> {
  const config = readGlobalConfig();
  (config as Record<string, unknown>)[key] = value;
  writeGlobalConfig(config);
  log.success(`Set ${key} = ${value}`);
}
