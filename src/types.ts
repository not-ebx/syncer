// ─── Config shapes ───────────────────────────────────────────────────────────

export interface ProjectConfig {
  registry?: string;
  version?: string; // "latest" | tag | branch | commit hash
  targets?: (string | CustomTarget)[];
  link_mode?: "symlink" | "copy";
  packs?: {
    include?: string[];
  };
  skills?: IncludeExclude;
  agents?: IncludeExclude;
  commands?: IncludeExclude;
}

export interface IncludeExclude {
  include?: string[];
  exclude?: string[];
}

export interface CustomTarget {
  name: string;
  base: string;
}

export interface GlobalConfig {
  default_registry?: string;
  default_pack?: string;
}

// ─── Registry shapes ─────────────────────────────────────────────────────────

export interface RegistryMarker {
  name: string;
  description?: string;
}

export interface PackDef {
  name: string;
  description?: string;
  extends?: string;
  skills?: string[];
  agents?: string[];
  commands?: string[];
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export interface ResolvedContent {
  skills: string[];
  agents: string[];
  commands: string[];
}

// ─── Lock file ───────────────────────────────────────────────────────────────

export interface LockFile {
  syncer_version: string;
  registry_commit: string;
  resolved_at: string;
  packs: string[];
  skills: ContentEntry[];
  agents: ContentEntry[];
  commands: ContentEntry[];
}

export interface ContentEntry {
  name: string;
  hash: string;
}

// ─── State ───────────────────────────────────────────────────────────────────

export interface StateFile {
  projects: Record<string, ProjectState>;
}

export interface ProjectState {
  last_sync: string;
  registry: string;
}

// ─── Targets ─────────────────────────────────────────────────────────────────

export interface TargetDef {
  name: string;
  base: string;
  skills: string;
  agents: string;
  commands: string;
}

// ─── Sync result ─────────────────────────────────────────────────────────────

export interface SyncResult {
  added: ResolvedContent;
  removed: ResolvedContent;
  unchanged: ResolvedContent;
  registryCommit: string;
}
