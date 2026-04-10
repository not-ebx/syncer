# Syncer

> One command, every repo has the right skills.

Syncer is a lightweight Node.js CLI that keeps AI agent skills, custom subagents, and commands consistent across all repositories in an organization. It solves version drift, missing skills, and the manual overhead of copy-pasting files across repos.

## The Problem

When using AI coding agents (Claude Code, Codex, Gemini CLI, etc.) across multiple repositories:

- **Version drift** — Repo A has v2 of a skill, Repo B has v1, Repo C has a fork
- **Missing skills** — New repos are created without any skills
- **Inconsistent behavior** — The same prompt produces different results because the underlying skills differ
- **Manual overhead** — Keeping skills in sync requires copy-pasting files that nobody does consistently

## How It Works

Syncer uses a standard Git repository as a **registry** — the single source of truth for all skills, agents, and commands in your org. Each project declares what it needs in a small `.syncer.yaml` config file. Running `syncer sync` fetches from the registry and creates symlinks into the AI agent tool directories (`.claude/`, `.codex/`, etc.).

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
npm install -g syncer
```

Requires Node.js 20+.

## Quick Start

```bash
# Set up global defaults (optional)
syncer init --global

# In any project, run the interactive wizard
cd my-project
syncer init
# → Asks for registry URL
# → Detects AI agent tools (.claude/, .codex/, etc.)
# → Lists available packs from registry
# → Creates .syncer.yaml and runs first sync

# On subsequent machines / new team members
git clone git@github.com:myorg/some-project.git
cd some-project
syncer sync   # everything is ready in <30 seconds
```

## Commands

### Project

```bash
syncer init                     # Interactive setup wizard
syncer sync                     # Fetch registry + resolve + symlink
syncer sync --all               # Sync all known projects on this machine
syncer sync --no-fetch          # Re-resolve and re-link without fetching
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
syncer list packs               # List available packs

syncer config get <key>         # Read a global config value
syncer config set <key> <value> # Write a global config value
```

### Registry

```bash
syncer init --registry          # Mark this repo as a skills registry
syncer registry pack list       # List all packs
syncer registry pack show <n>   # Show pack contents (own + inherited via extends)
syncer registry pack create <n> # Create a new pack
syncer registry skill create <n>    # Create a skill stub
syncer registry agent create <n>    # Create an agent stub
syncer registry command create <n>  # Create a command stub
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

# version: v2.1.0   # Pin to a specific registry tag (optional)
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
# Creates .syncer-registry.yaml and the skills/, agents/, commands/, packs/ directories
```

Then manage content via normal Git workflow — branches, PRs, reviews. Publish new versions by tagging a release.

Registry structure:

```
skills-registry/
├── .syncer-registry.yaml
├── skills/
│   └── code-review/
│       └── SKILL.md
├── agents/
│   └── explorer.md
├── commands/
│   └── lint.md
└── packs/
    └── default.yaml
```

## Packs

Packs are named collections of skills, agents, and commands defined in the registry. They can extend other packs:

```yaml
# packs/frontend.yaml
name: frontend
extends: default
skills:
  - component-guidelines
  - accessibility-check
```

## License

MIT
