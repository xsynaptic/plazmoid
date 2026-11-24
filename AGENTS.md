# AGENTS.md

Add to this file only what an agent can't infer from the code and config.

## Context

- `.claude/glossary.md` defines track, release and cue point; read it before naming anything
- `.claude/` is gitignored and holds plans and notes; only a plan with `status: ready` is open work
- Everything tracked is public: name no person and none of our other projects in code, comments, fixtures, docs, changesets or commit messages

## Packages

- Every public name carries the `pzm` prefix: tags, classes, custom properties, storage keys and page attributes
- Each package's `tsconfig.shipped.json` type-checks shipped source without the newer globals the tests get; a failure there means shipped code uses something the build target lacks

## Checks

- Lefthook is the gate and there is no CI: `pnpm check` reports, `pnpm fix` autofixes then rechecks. The gate is green, so anything it reports is yours
- The player's Playwright suite runs on demand, after a build: `pnpm -F @xsynaptic/plazmoid-player test-e2e`, with `PZM_FIXTURE_SOURCE` naming a local track. Run it after changing core's `engine/`, `store/` or `page-controls.ts`, or anything the player renders

## Releases

- Pre-1.0: break APIs freely, with no compatibility shims or migration notes
- Every package change takes a minimal changeset
- The operator commits the version bump and publishes, through `pnpm release`
