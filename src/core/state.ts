import fs from "node:fs";
import { GLOBAL_DIR, GLOBAL_STATE_PATH } from "./config.js";
import type { StateFile } from "../types.js";

function readState(): StateFile {
  if (!fs.existsSync(GLOBAL_STATE_PATH)) return { projects: {} };
  try {
    return JSON.parse(fs.readFileSync(GLOBAL_STATE_PATH, "utf8")) as StateFile;
  } catch {
    return { projects: {} };
  }
}

function writeState(state: StateFile): void {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  fs.writeFileSync(GLOBAL_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export function recordSync(
  projectPath: string,
  registry: string
): void {
  const state = readState();
  state.projects[projectPath] = {
    last_sync: new Date().toISOString(),
    registry,
  };
  writeState(state);
}

export function getAllProjects(): Record<string, { last_sync: string; registry: string }> {
  return readState().projects;
}

export function removeProject(projectPath: string): void {
  const state = readState();
  delete state.projects[projectPath];
  writeState(state);
}
