# Syncer

CLI that keeps AI agent skills, subagents, and commands consistent across repos.
Syncs content from a Git registry repo into per-project caches and symlinks them
into agent tool directories (`.claude/`, `.codex/`, etc.).

## Commands

```bash
pnpm build        # Compile TypeScript via tsup → dist/
pnpm dev          # Watch mode (tsup --watch)
pnpm test         # Run tests with vitest
pnpm test:watch   # Vitest in watch mode
pnpm lint         # Type-check only (tsc --noEmit)
```

## Architecture

Two operating contexts, detected by marker file:
- **Registry** (`.syncer-registry.yaml` present): validate skills/agents/commands/packs
- **Project** (`.syncer.yaml` present): sync, include/exclude, status

Data flow: registry Git repo → `~/.syncer/cache/` (shared shallow clone) →
`.syncer/` (per-project resolved content) → per-item symlinks in `.claude/skills/`, etc.

Key files:
- `src/cli/index.ts` — all CLI commands wired via Commander
- `src/core/syncer.ts` — core sync algorithm
- `src/core/resolver.ts` — pack resolution + include/exclude overrides
- `src/core/symlinks.ts` — per-item symlink/copy logic
- `src/types.ts` — all shared TypeScript types

## Gotchas

- `__VERSION__` in `src/cli/index.ts` is injected at build time by tsup — it's not defined in source, don't add it
- Module resolution is `NodeNext` — all local imports must use `.js` extensions (e.g., `import ... from "./foo.js"`)
- `tests/` is excluded from `tsconfig.json` — `pnpm lint` won't catch type errors in tests; `pnpm test` will
- `syncer sync --no-fetch` re-resolves from the local cache without hitting the network — useful for testing locally
- Symlinks are per-item (not per-directory), so local unmanaged files in `.claude/skills/` coexist safely with synced ones
