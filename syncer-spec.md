# Syncer — Product Specification

> **Version:** 0.2.0 (Draft)
> **Date:** April 9, 2026
> **Status:** Requirements & Design

---

## 1. Problem Statement

Organizations using AI coding agents (Claude Code, Codex, Gemini CLI, etc.) across multiple repositories face a fragmentation problem:

- **Version drift** — Repo A has v2 of a skill, Repo B has v1, Repo C has a forked version
- **Missing skills** — New repos are created without any skills; devs don't know which skills exist
- **Inconsistent behavior** — The same prompt produces different results across repos because the underlying skills differ
- **Manual overhead** — Keeping skills, agents, and commands in sync requires copy-pasting files across repos, which nobody does consistently

### What exists today

| Tool | What it does | What it doesn't do |
|---|---|---|
| **skillshare** | Single source dir → symlinks to multiple CLI tools | No per-repo config, no auto-update, no org registry |
| **skills-cli** | Remote Git sources → sync to targets | No per-repo declarations, no multi-type support |
| **smart-skills** | Rust CLI, source dirs → targets | Lightweight but same limitations |

**The gap:** None of these tools solve the *per-repo, org-level* problem. They sync a global skill library across tools on a single machine. They don't handle "Repo X needs skills A, B, C at version 2.3" while "Repo Y needs skills A, D at version 2.1." And none of them handle agents, commands, or multi-agent-tool targeting.

---

## 2. Product Vision

**Syncer** is a lightweight Node.js CLI that keeps AI agent skills, custom subagents, and commands consistent across all repositories in an organization.

**One-liner:** *"One command, every repo has the right skills."*

### Core Principles

1. **Git is the infrastructure** — A standard Git repo is the registry. No server, no daemon, no background processes. Everyone already has Git.
2. **Per-repo declarations** — Each project declares exactly which skills, agents, and commands it needs (and optionally at which version).
3. **Central registry** — A single Git repo is the source of truth for all org content.
4. **Non-invasive** — Synced content lives in a gitignored cache folder; only a small config file is committed.
5. **Multi-agent** — Works with Claude Code, Codex, Gemini CLI, Cursor, and any tool that reads from a standard directory structure.
6. **Multi-type** — Syncs skills, custom subagents, and commands — not just skills.

---

## 3. Terminology

| Term | Meaning |
|---|---|
| **Registry** | The Git repo that holds skills, agents, commands, and packs. Source of truth. |
| **Project** | Any repo that consumes content from a registry. |
| **Skill** | A folder containing a `SKILL.md` and optional resources (scripts, templates, examples). Synced to `<target>/skills/<name>/`. |
| **Agent** | A single `.md` file defining a custom subagent. Synced to `<target>/agents/<name>.md`. |
| **Command** | A single `.md` file defining a slash command (legacy format). Synced to `<target>/commands/<name>.md`. |
| **Pack** | A named collection of skills, agents, and commands. Defined in the registry. |
| **Target** | An AI agent tool directory (e.g., `.claude`, `.codex`, `.gemini`). |

---

## 4. User Stories

### 4.1 Developer (day-to-day user)

- **US-1:** As a developer, I want to run a single command to sync all skills, agents, and commands for my repo.
- **US-2:** As a developer, if I'm offline or the registry is down, I want my last-synced content to still work.
- **US-3:** As a developer, I want to check what's currently synced and whether updates are available.
- **US-4:** As a developer, I want to include or exclude specific skills for my project and commit that config for my team.

### 4.2 Tech Lead / Org Admin

- **US-5:** As a tech lead, I want to define packs for my org and have projects use them by default.
- **US-6:** As a tech lead, I want to pin specific registry versions per project when needed.
- **US-7:** As a tech lead, I want to add project-specific overrides on top of org defaults.
- **US-8:** As a tech lead, I want to audit which projects are out of date.

### 4.3 Skill Author

- **US-9:** As a skill author, I want to publish a new version by merging a PR to the registry — no special tooling needed.
- **US-10:** As a skill author, I want projects to be able to test a registry branch before merging to main.

---

## 5. Architecture

### 5.1 High-Level Flow

```
┌─────────────────────────────────────────────────────┐
│               Registry (Git repo)                   │
│         (e.g., org/skills-registry)                 │
│                                                     │
│  skills/                agents/                     │
│  ├── code-review/       ├── explorer.md             │
│  │   ├── SKILL.md       └── reviewer.md             │
│  │   └── scripts/                                   │
│  └── testing/           commands/                   │
│      ├── SKILL.md       ├── deploy.md               │
│      └── examples/      └── lint.md                 │
│                                                     │
│  packs/                                             │
│  ├── default.yaml                                   │
│  └── frontend.yaml                                  │
│                                                     │
│  Tags: v1.0.0, v1.1.0, v2.0.0                      │
└──────────────────────┬──────────────────────────────┘
                       │
                       │  git clone / fetch
                       ▼
┌─────────────────────────────────────────────────────┐
│              Developer Machine                      │
│                                                     │
│  ~/.syncer/                                         │
│  ├── cache/                  (cloned registry)      │
│  ├── config.yaml             (global settings)      │
│  └── state.json              (known projects)       │
│                                                     │
│  ~/projects/my-repo/                                │
│  ├── .syncer.yaml            (committed config)     │
│  ├── .syncer.lock            (committed lock file)  │
│  ├── .syncer/                (gitignored cache)     │
│  │   ├── skills/                                    │
│  │   ├── agents/                                    │
│  │   ├── commands/                                  │
│  │   └── .last-sync                                 │
│  ├── .claude/                                       │
│  │   ├── skills/code-review → ../../.syncer/skills/ │
│  │   ├── agents/explorer.md → ../../.syncer/agents/ │
│  │   └── commands/deploy.md → ../../.syncer/cmds/   │
│  ├── .codex/                 (if configured)        │
│  └── .gemini/                (if configured)        │
└─────────────────────────────────────────────────────┘
```

### 5.2 Two Contexts

Syncer detects which mode it's in based on what's in the current repo:

| Marker file | Context | What you can do |
|---|---|---|
| `.syncer-registry.yaml` | **Registry** | Validate skills, list/inspect packs |
| `.syncer.yaml` | **Project** | Sync, include/exclude, status |
| Neither | **Unconfigured** | `syncer init` to set up either |

### 5.3 Component Breakdown

#### A. Registry (Git Repo)

A standard Git repository owned by the organization. Structure:

```
skills-registry/
├── .syncer-registry.yaml       # Registry marker + metadata
├── skills/
│   ├── code-review/
│   │   ├── SKILL.md            # Main skill instructions
│   │   ├── scripts/            # Optional helper scripts
│   │   ├── templates/          # Optional templates
│   │   └── examples/           # Optional examples
│   ├── testing-standards/
│   │   ├── SKILL.md
│   │   └── examples/
│   │       └── sample-test.ts
│   └── deploy/
│       └── SKILL.md
├── agents/
│   ├── explorer.md             # Custom subagent (flat file)
│   └── code-reviewer.md
├── commands/
│   ├── deploy.md               # Slash command (flat file, legacy)
│   └── lint.md
└── packs/
    ├── default.yaml
    ├── frontend.yaml
    └── backend.yaml
```

**Registry marker:**

```yaml
# .syncer-registry.yaml
name: myorg-skills
description: Organization-wide AI agent skills, agents, and commands
```

**Skills** are folders containing a `SKILL.md` plus optional resources (scripts, templates, examples, etc.). The entire folder is synced.

**Agents** and **Commands** are flat `.md` files. One file = one agent or command.

#### B. Packs

Packs are named collections defined in the registry. They can reference skills, agents, and commands:

```yaml
# packs/default.yaml
name: default
description: Standard pack for all repos
skills:
  - code-review
  - testing-standards
  - deploy
agents:
  - explorer
commands:
  - lint
```

Packs can extend other packs:

```yaml
# packs/frontend.yaml
name: frontend
extends: default              # Inherits everything from default
skills:
  - component-guidelines
  - accessibility-check
agents:
  - frontend-reviewer
commands:
  - storybook-gen
```

The `extends` chain is resolved recursively. Circular references are detected and rejected during validation.

#### C. Project Config (`.syncer.yaml` — committed)

Small config file committed to each project repo:

```yaml
# .syncer.yaml
registry: git@github.com:myorg/skills-registry.git

# Pin to a specific registry version (optional)
# version: v2.1.0

# Which AI agent targets to sync to (defaults to [claude])
targets:
  - claude
  - codex

# Packs to include
packs:
  include:
    - default
    - frontend

# Individual skills (on top of packs)
skills:
  include:
    - graphql-schema-check
  exclude:
    - deploy              # Exclude even if a pack includes it

# Individual agents (on top of packs)
agents:
  include: []
  exclude:
    - explorer            # Exclude even if a pack includes it

# Individual commands (on top of packs)
commands:
  include:
    - legacy-deploy
  exclude: []
```

#### D. Global Config (`~/.syncer/config.yaml`)

Per-developer defaults:

```yaml
# ~/.syncer/config.yaml
default_registry: git@github.com:myorg/skills-registry.git
default_pack: default
```

Used as fallback when a project's `.syncer.yaml` doesn't specify a registry or pack.

#### E. Global State (`~/.syncer/state.json`)

Tracks known projects on this machine. Updated automatically whenever `syncer init` or `syncer sync` runs in a project. Used by `syncer sync --all` and `syncer status --all` to find projects.

```json
{
  "projects": {
    "/Users/dev/projects/my-repo": {
      "last_sync": "2026-04-09T14:30:00Z",
      "registry": "git@github.com:myorg/skills-registry.git"
    }
  }
}
```

#### F. Registry Cache (`~/.syncer/cache/`)

A bare or shallow clone of the registry repo, shared across all projects on the machine. Avoids cloning the registry once per project.

#### G. Project Cache (`.syncer/` — gitignored)

Per-project resolved content. This is what gets symlinked into the agent target directories.

```
.syncer/
├── skills/
│   ├── code-review/
│   │   ├── SKILL.md
│   │   └── scripts/
│   └── testing-standards/
│       └── SKILL.md
├── agents/
│   ├── explorer.md
│   └── frontend-reviewer.md
├── commands/
│   └── lint.md
└── .last-sync
```

---

## 6. CLI Interface

### 6.1 Commands

#### Global Setup

```
syncer init --global                     # Set default registry, preferences
syncer config set <key> <value>          # Update global config
syncer config get <key>                  # Read global config
```

#### In a Project

```
syncer init                              # Interactive wizard (see §6.2)
syncer sync                              # Fetch registry + resolve + symlink
syncer sync --all                        # Sync all known projects on this machine
syncer sync --no-fetch                   # Re-resolve and re-link without fetching

syncer status                            # What's installed, is it current?
syncer status --all                      # All known projects' states

syncer include pack <name>               # Add pack to packs.include
syncer include skill <name>              # Add to skills.include
syncer include agent <name>              # Add to agents.include
syncer include command <name>            # Add to commands.include

syncer exclude skill <name>              # Add to skills.exclude (or remove from skills.include)
syncer exclude agent <name>              # Add to agents.exclude (or remove from agents.include)
syncer exclude command <name>            # Add to commands.exclude (or remove from commands.include)
syncer exclude pack <name>               # Remove from packs.include

syncer list                              # List all available content from registry
syncer list skills                       # List available skills
syncer list agents                       # List available agents
syncer list commands                     # List available commands
syncer list packs                        # List available packs

syncer doctor                            # Diagnose issues (broken symlinks, stale cache, etc.)
```

#### In a Registry

```
syncer init --registry                   # Mark repo as a registry
syncer sync                              # Validate all skills, agents, commands, packs
syncer skill list                        # List skills in this registry
syncer skill validate                    # Lint/check skill structure
syncer pack list                         # List packs
syncer pack show <name>                  # Show resolved pack contents
```

### 6.2 Init Wizard (`syncer init`)

The `syncer init` command is an interactive wizard that walks the user through setting up a project. It does **not** silently generate a config — it guides the user through each decision.

**Guard: already configured**

If `.syncer.yaml` already exists, the wizard exits immediately:

```
This project is already configured (.syncer.yaml found).
To reconfigure, remove .syncer.yaml and run `syncer init` again.
```

**Step 1: Registry**

```
? Which skills registry do you want to use?
  Enter Git URL (or press Enter for default: git@github.com:myorg/skills-registry.git)
> git@github.com:myorg/skills-registry.git
```

Syncer fetches the registry to make the next steps possible. If offline, it tells the user to configure manually and shows how (`syncer include pack <name>`, etc.).

**Step 2: Detect targets**

Syncer scans the project root for known agent directories and pre-selects them:

```
? Which AI agent tools do you want to sync to?
  (Syncer detected: claude, codex)
  [x] claude    (detected .claude/)
  [x] codex     (detected .codex/)
  [ ] gemini
  [ ] cursor
  [ ] openclaw
  [ ] custom...
```

**Step 3: Select packs**

Syncer lists available packs from the registry:

```
? Which packs do you want to include?
  [ ] default — Standard skills for all repos
  [ ] frontend — Frontend-specific skills (extends default)
  [ ] backend — Backend-specific skills (extends default)
```

**Step 4: Select individual content (optional)**

```
? Do you want to add or exclude individual skills, agents, or commands?
  (You can always do this later with `syncer include` / `syncer exclude`)
  [y/N]
```

If yes, Syncer lists available content from the registry and lets the user pick. If no, the wizard moves on.

**Step 5: Version pinning (optional)**

```
? Pin to a specific registry version? (default: latest)
  > latest
```

**Step 6: Summary + confirm**

```
Ready to create .syncer.yaml:
  Registry:  git@github.com:myorg/skills-registry.git
  Targets:   claude, codex
  Packs:     frontend
  Skills:    +graphql-schema-check, -deploy
  Agents:    (from packs)
  Commands:  (from packs)
  Version:   latest

? Create config and run first sync? [Y/n]
```

On confirm, Syncer:
1. Writes `.syncer.yaml`
2. Adds `.syncer/` to `.gitignore`
3. Runs the first `syncer sync`

### 6.3 Include/Exclude Semantics

**`syncer include <type> <name>`:**
- Adds the item to `<type>.include` in `.syncer.yaml`
- Runs `syncer sync` to apply immediately

**`syncer exclude <type> <name>`:**
- If the item was individually included → removes from `<type>.include`
- If the item came from a pack → adds to `<type>.exclude`
- Runs `syncer sync` to apply immediately

**`syncer exclude pack <name>`:**
- Removes the pack from `packs.include` (packs don't have an exclude list — you just don't include them)

All changes are written to `.syncer.yaml`, ready to be committed and PR'd.

---

## 7. Sync Algorithm

### 7.1 Full Sync (`syncer sync` in a Project)

```
1. Read .syncer.yaml from current project
2. Read global config from ~/.syncer/config.yaml (for defaults)
3. Update registry cache:
   a. If cache exists → git fetch + checkout target version/branch
   b. If cache doesn't exist → shallow clone
   c. If offline → use existing cache, warn user
4. Resolve content list:
   a. Load all declared packs from registry
   b. Apply extends chains (recursively, with cycle detection)
   c. Merge all pack contents into a unified list per type
   d. Apply per-type include overrides (add individual items)
   e. Apply per-type exclude overrides (remove items)
5. Copy resolved content to .syncer/:
   a. skills/ → copy entire skill folders (SKILL.md + resources)
   b. agents/ → copy individual .md files
   c. commands/ → copy individual .md files
6. Create/update symlinks for each target:
   a. For each target (claude, codex, etc.):
      - Symlink each skill folder individually
      - Symlink each agent file individually
      - Symlink each command file individually
   b. Remove stale symlinks for content no longer in the resolved list
7. Write .syncer/.last-sync with timestamp + registry commit hash
8. Write .syncer.lock with full resolved state
9. Update ~/.syncer/state.json with this project's info
10. Report what changed since last sync
```

### 7.2 Registry Sync (`syncer sync` in a Registry)

```
1. Validate all skills:
   a. Each skill folder has a SKILL.md
   b. No orphaned references
2. Validate all agents:
   a. Each agent is a valid .md file
3. Validate all commands:
   a. Each command is a valid .md file
4. Validate all packs:
   a. All referenced skills/agents/commands exist
   b. All extends references are valid
   c. No circular extends chains
5. Report validation results
6. If issues found:
   a. List all problems
   b. Offer to reset local cache (with confirmation)
```

---

## 8. Targets

### 8.1 Known Targets

Syncer ships with built-in knowledge of popular AI agent directory structures:

| Target name | Base path | Skills | Agents | Commands |
|---|---|---|---|---|
| `claude` | `.claude/` | `.claude/skills/` | `.claude/agents/` | `.claude/commands/` |
| `codex` | `.codex/` | `.codex/skills/` | `.codex/agents/` | `.codex/commands/` |
| `gemini` | `.gemini/` | `.gemini/skills/` | `.gemini/agents/` | `.gemini/commands/` |
| `cursor` | `.cursor/` | `.cursor/skills/` | `.cursor/agents/` | `.cursor/commands/` |
| `openclaw` | `.openclaw/` | `.openclaw/skills/` | `.openclaw/agents/` | `.openclaw/commands/` |

### 8.2 Custom Targets

For agents Syncer doesn't know about:

```yaml
# .syncer.yaml
targets:
  - claude
  - codex
  - custom:
      name: my-agent
      base: .my-agent
```

This creates `.my-agent/skills/`, `.my-agent/agents/`, `.my-agent/commands/` and symlinks into them following the same structure as built-in targets.

### 8.3 Default

If `targets` is omitted from `.syncer.yaml`, it defaults to `[claude]`.

---

## 9. Symlink Strategy

### 9.1 Per-Item Symlinks (Default)

Syncer symlinks each item individually rather than symlinking entire directories. This allows local (unmanaged) content to coexist with synced content:

```
.claude/skills/
├── code-review/  → ../../.syncer/skills/code-review/    (managed)
├── testing/      → ../../.syncer/skills/testing/         (managed)
└── my-local-skill/                                       (unmanaged, local)

.claude/agents/
├── explorer.md   → ../../.syncer/agents/explorer.md      (managed)
└── my-agent.md                                           (unmanaged, local)
```

### 9.2 Conflict Handling

If a managed item already exists as a real file/folder (not a symlink), Syncer will:
1. Warn the user
2. Offer to back up existing content to `<path>.bak`
3. Replace with symlink (only after confirmation)

### 9.3 Fallback: Copy Mode

Some environments don't support symlinks (e.g., certain Windows setups, Docker volumes):

```yaml
# .syncer.yaml
link_mode: copy    # "symlink" (default) | "copy"
```

In copy mode, files are copied instead of symlinked. `syncer status` will prominently remind that re-syncing is required to pick up changes.

### 9.4 Stale Symlink Cleanup

When content is removed from the resolved list (e.g., a skill was excluded or a pack was removed), `syncer sync` removes the corresponding symlinks from all target directories. Only symlinks managed by Syncer are removed — local content is never touched.

---

## 10. Gitignore Management

On `syncer init`, the tool automatically adds to `.gitignore`:

```gitignore
# Syncer cache (managed by syncer)
.syncer/
```

The following files are **NOT** gitignored — they are meant to be committed:
- `.syncer.yaml` — project config, shared with the team
- `.syncer.lock` — resolved state, for reproducibility

---

## 11. Version Pinning & Resolution

### 11.1 Version Strategies

```yaml
# .syncer.yaml

# Track latest (default) — always use main/HEAD
version: latest

# Pin to a tag — stay on this version until manually bumped
version: v2.1.0

# Pin to a branch — useful for testing pre-release content
# Warning: non-deterministic — two devs syncing at different times
# may get different results. Use for testing only, not in main.
version: feature/new-deploy-skill

# Pin to a commit — maximum reproducibility
version: abc123f
```

### 11.2 Lock File (`.syncer.lock` — committed)

After every sync, Syncer writes a lock file with the exact resolved state:

```yaml
# .syncer.lock
syncer_version: 0.2.0
registry_commit: abc123f4567890
resolved_at: 2026-04-09T14:30:00Z
packs:
  - default
  - frontend
skills:
  - name: code-review
    hash: sha256:a1b2c3...
  - name: testing-standards
    hash: sha256:d4e5f6...
  - name: component-guidelines
    hash: sha256:g7h8i9...
agents:
  - name: explorer
    hash: sha256:j1k2l3...
commands:
  - name: lint
    hash: sha256:m4n5o6...
```

The lock file is committed by default. To suppress diff noise, add to `.gitattributes`:

```
.syncer.lock linguist-generated=true
```

---

## 12. Configuration Precedence

From highest to lowest priority:

| Priority | Source | Scope |
|---|---|---|
| 1 | CLI flags | Single invocation |
| 2 | `.syncer.yaml` (project) | Per-project, shared with team |
| 3 | `~/.syncer/config.yaml` (global) | Per-developer defaults |
| 4 | Built-in defaults | Fallback |

---

## 13. Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| No network / registry unreachable | Use cached version, warn user |
| No cache and no network (cold start) | Create `.syncer.yaml`, skip sync, tell user to run `syncer sync` when online |
| No `.syncer.yaml` in project | Error with suggestion to run `syncer init` |
| Registry has no matching version/tag | Error with suggestion to check available versions |
| Symlink target dir doesn't exist | Create it |
| Existing content conflicts with managed symlink | Warn + offer backup (see §9.2) |
| Corrupted cache | `syncer doctor` detects and offers `--reset-cache` |
| Multiple nested repos | Resolve to nearest parent with `.syncer.yaml` |
| Concurrent syncs (two terminals) | File lock on `.syncer/.lock` |
| Circular pack extends | Detected during resolution, error with chain displayed |
| Branch pinning non-determinism | Lock file captures exact commit hash for reproducibility |
| Pack references non-existent skill/agent/command | Error during sync (project) or validation (registry) |
| `syncer init` in already-configured project | Exit with message: "Already configured. Remove `.syncer.yaml` to reconfigure." |
| `syncer init` wizard with no network | Create `.syncer.yaml` with registry URL only, skip content selection, tell user to run `syncer include` / `syncer sync` when online |

---

## 14. Security Considerations

- **Registry trust** — Skills and agents can contain arbitrary instructions that AI agents will follow. The registry should be an org-controlled repo with branch protection and code review.
- **No arbitrary code execution on sync** — Syncer only copies/symlinks files. It never executes scripts from the registry during sync.
- **Audit trail** — The lock file provides a full audit trail of which content was active and when, with SHA-256 hashes.
- **Hash verification** — Content is hashed on sync. If a file changes unexpectedly (e.g., local tampering), `syncer doctor` flags it.
- **Threat model** — Hash verification detects local tampering. It does **not** protect against a compromised registry — that's the registry's branch protection and code review's job.

---

## 15. Installation & Setup

### 15.1 Install

```bash
npm install -g syncer

# Or via npx (no global install)
npx syncer sync
```

### 15.2 First-Time Setup

```bash
# 1. Set up global config (optional — sets default registry)
syncer init --global
# Prompts for: registry URL, default pack

# 2. In any project, run the init wizard
cd my-project
syncer init
# Interactive wizard (see §6.2):
#   → Asks for registry URL
#   → Detects AI agent tools (.claude/, .codex/, etc.)
#   → Lists available packs from registry
#   → Optionally pick individual skills/agents/commands
#   → Creates .syncer.yaml + adds .syncer/ to .gitignore
#   → Runs first sync
```

### 15.3 Onboarding a New Dev

```bash
# Clone any project that already has .syncer.yaml
git clone git@github.com:myorg/some-project.git
cd some-project

# One command — skills, agents, and commands are ready
syncer sync
```

### 15.4 Setting Up a New Registry

```bash
cd skills-registry
syncer init --registry
# Creates .syncer-registry.yaml
# Creates skills/, agents/, commands/, packs/ directories
```

Then add skills (folders with SKILL.md), agents (.md files), commands (.md files), and packs (.yaml files) via normal Git workflow — branches, PRs, reviews.

---

## 16. Future Considerations (Out of Scope for v1)

- **`syncer diff`** — Show what changed between current sync and latest registry version before syncing
- **Web dashboard** — See all projects' sync status across the org
- **Webhooks** — Notify Slack/Teams when registry is updated
- **Private skill overrides** — Per-developer customizations that don't affect the team
- **Auto-migration** — Detect repos using skillshare or similar tools and offer `syncer migrate`
- **Plugin system** — Hooks for custom pre/post-sync logic
- **Monorepo support** — Different packs per workspace/package within a monorepo
- **Multi-registry** — Pull from multiple registries (e.g., org + community)
- **Conditional packs** — "Include skill X only if repo has `package.json`"
- **Automation hooks** — Users can wire Syncer into Claude Code session hooks, git hooks, or cron for auto-sync. Syncer itself is manual-only.

---

## 17. Success Metrics

- **Adoption:** % of org projects with `.syncer.yaml`
- **Freshness:** Average lag between registry update and project sync
- **Consistency:** % of projects on the latest registry version
- **Developer friction:** Time from `git clone` to "skills are working" (target: <30 seconds)

---

## 18. Resolved Design Decisions

These were open questions in v0.1 — now resolved:

| Question | Decision | Rationale |
|---|---|---|
| Lock file committed? | **Yes, by default** | Same trade-off as `package-lock.json` — reproducibility > noisy diffs. Use `.gitattributes` to suppress. |
| Skill format opinionated? | **No** | Syncer treats skills as opaque folders. Format is the agent tool's concern. |
| Shell hooks / auto-sync? | **No** | Syncer is manual-only. Users can wire their own automation (Claude Code session hooks, git hooks, cron). |
| Add/remove skills from CLI? | **`include`/`exclude` commands** | Edits `.syncer.yaml` only. Skill creation/management happens in the registry via normal Git workflow. |
| Multi-type support? | **Yes — skills, agents, commands** | All three Claude Code content types are supported. Commands are legacy but still included. |

---

## 19. Open Questions

1. **Naming** — Is `syncer` the right name? Alternatives: `agentkit`, `skillpull`, `syncskill`, `skillhub`
2. **Multi-registry** — Should a project be able to pull from multiple registries? Deferred to future, but architecture should not prevent it.
3. **Backwards compat** — Migration path from skillshare/skills-cli. Deferred to future (`syncer migrate`).
