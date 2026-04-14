<div align="center">

```
   _____                           
  / ___/__  ______  ________  _____
  \__ \/ / / / __ \/ ___/ _ \/ ___/
 ___/ / /_/ / / / / /__/  __/ /    
/____/\__, /_/ /_/\___/\___/_/     
     /____/                        
```

**One command. Every repo has the right skills.**

[![npm version](https://img.shields.io/npm/v/@syncer/cli)](https://www.npmjs.com/package/@syncer/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

</div>

---



Syncer is a lightweight CLI that keeps AI agent skills, custom subagents, and slash commands consistent across every repository in your organization. It solves version drift, missing skills, and the manual overhead of copy-pasting files across repos — using a plain Git repo as the single source of truth.

## The Problem

When working with AI coding agents (Claude Code, Codex, Gemini CLI, etc.) across multiple repositories:

- **Version drift** — Repo A has v2 of a skill, Repo B has v1, Repo C has a fork
- **Missing skills** — New repos are created without any skills configured
- **Inconsistent behavior** — The same prompt produces different results because the underlying skills differ
- **Manual overhead** — Keeping files in sync requires copy-pasting that nobody does consistently

## How It Works

Syncer uses a standard Git repository as a **registry** — the single source of truth for all skills, agents, and commands in your org. Each project declares what it needs in a small `.syncer.yaml` config file. Running `syncer sync` fetches from the registry and symlinks everything into the AI agent tool directories.

```
Registry (Git repo)          Developer Machine
────────────────────         ──────────────────────────────────
skills/                      my-project/
├── code-review/        →    ├── .syncer.yaml       (committed)
├── testing/            →    ├── .syncer.lock       (committed)
agents/                      ├── .syncer/           (gitignored)
├── explorer.md         →    │   ├── skills/
commands/                    │   └── agents/
└── lint.md             →    └── .claude/
                                 ├── skills/code-review → ../../.syncer/skills/code-review
                                 └── agents/explorer.md → ../../.syncer/agents/explorer.md
```

## Installation

```bash
npm install -g @syncer/cli
```

Or run without installing:

```bash
npx @syncer/cli sync
```

Requires Node.js 20+.

## Quick Start

```bash
# In any project, run the interactive wizard
cd my-project
syncer init
# → Asks for registry URL
# → Detects AI agent tools (.claude/, .codex/, etc.)
# → Lists available packs from the registry
# → Creates .syncer.yaml and runs first sync

# On subsequent machines / new team members
git clone git@github.com:myorg/some-project.git
cd some-project
syncer sync   # everything is ready in seconds
```

## Commands

### Project

```bash
syncer init                     # Interactive setup wizard
syncer sync                     # Fetch registry + resolve + symlink
syncer sync --all               # Sync all known projects on this machine
syncer sync --no-fetch          # Re-resolve and re-link without fetching
syncer sync --prune             # Remove symlinks for items no longer in config
syncer status                   # What's installed, is it current?
syncer status --all             # All known projects' states
syncer doctor                   # Diagnose broken symlinks, stale cache, etc.

syncer include pack <name>      # Add a pack
syncer include skill <name>     # Add an individual skill
syncer include agent <name>     # Add an individual agent
syncer include command <name>   # Add an individual command

syncer exclude pack <name>      # Remove a pack
syncer exclude skill <name>     # Exclude a skill (even if a pack includes it)
syncer exclude agent <name>     # Exclude an agent
syncer exclude command <name>   # Exclude a command

syncer list                     # List all available content from registry
syncer list skills              # List available skills
syncer list agents              # List available agents
syncer list commands            # List available commands
syncer list packs               # List available packs

syncer config get <key>         # Read a global config value
syncer config set <key> <value> # Write a global config value
```

### Registry

```bash
syncer init --registry          # Mark this repo as a skills registry
syncer sync                     # Validate all skills, agents, commands, packs
syncer skill list               # List skills in this registry
syncer skill validate           # Lint/check skill structure
syncer pack list                # List all packs
syncer pack show <name>         # Show resolved pack contents (own + inherited via extends)
```

## Configuration

### Project config (`.syncer.yaml` — commit this)

```yaml
registry: git@github.com:myorg/skills-registry.git

targets:
  - claude
  - codex

packs:
  include:
    - default
    - frontend

skills:
  include:
    - graphql-schema-check
  exclude:
    - deploy          # Exclude even if a pack includes it

# version: latest             # Track HEAD (default)
# version: v2.1.0             # Pin to a tag
# version: feature/my-branch  # Track a branch (testing only — non-deterministic)
# version: abc123f            # Pin to a commit (maximum reproducibility)
```

### Global config (`~/.syncer/config.yaml`)

```yaml
default_registry: git@github.com:myorg/skills-registry.git
default_pack: default
```

## Supported Targets

| Target | Directory |
|--------|-----------|
| `claude` | `.claude/` |
| `codex` | `.codex/` |
| `gemini` | `.gemini/` |
| `cursor` | `.cursor/` |
| `openclaw` | `.openclaw/` |
| custom | configurable in `.syncer.yaml` |

## Setting Up a Registry

```bash
cd skills-registry
syncer init --registry
# Creates .syncer-registry.yaml and the skills/, agents/, commands/ directories
```

Then manage content via normal Git workflow — branches, PRs, reviews. Publish new versions by tagging a release.

Registry structure:

```
skills-registry/
├── .syncer-registry.yaml   ← registry config + all pack definitions
├── skills/
│   └── code-review/
│       └── SKILL.md
├── agents/
│   └── explorer.md
└── commands/
    └── lint.md
```

## Packs

Packs are named collections of skills, agents, and commands defined directly in `.syncer-registry.yaml`. They support inheritance via `extends`:

```yaml
# .syncer-registry.yaml
name: my-registry
packs:
  default:
    description: Core tools for every project
    skills:
      - code-review
      - testing
    agents:
      - explorer
  frontend:
    description: Frontend-specific additions
    extends: default
    skills:
      - component-guidelines
      - accessibility-check
    agents:
      - design-reviewer
```

Projects include packs by name — when the pack is updated in the registry, everyone gets the update on their next `syncer sync`.

## Why Git as a Registry?

- **No new infrastructure** — your team already knows Git
- **Full history** — every change is audited, reversible, and reviewable via PRs
- **Pinning** — projects can pin to a tag or commit for stability, then upgrade deliberately
- **Private by default** — private repos work out of the box with existing SSH keys

## Contributing

Issues and PRs are welcome. See the repo for development setup.

## License

MIT
