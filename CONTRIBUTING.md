# Contributing

Thanks for your interest in contributing! This repository follows the shared conventions
used across the **Quark** ecosystem, adapted to a TypeScript/WebGL stack.

## Getting started

1. Fork the repo and create a feature branch from `master`:
   `git switch -c feat/short-description`
2. Install and run the game:
   ```bash
   npm install
   npm run dev          # → http://localhost:5114
   ```
3. Make your change. Keep commits focused and the working tree green.
4. Run the full gate locally before pushing:
   ```bash
   npm run verify       # typecheck + format check + tests
   ```
5. Open a Pull Request and fill in the template.

## Conventions

- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org):
  `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:` …
- **Code style** is enforced by `.editorconfig` + Prettier. Run `npm run format` before pushing.
- **Types** are the linter here: `tsconfig.json` runs `strict` plus `noUncheckedIndexedAccess`
  and `exactOptionalPropertyTypes`. `npm run typecheck` must be clean — there is no `any` escape
  hatch in review.
- **One logical change per PR.** Large mechanical changes go in their own PR.
- CI must be green before a PR can be merged.

## Where things live

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first — it explains the render pipeline and
the update order, which is the part of this codebase that is easiest to break by accident.

Two rules that are easy to miss:

- **Nothing allocates in the frame loop.** Effects, sparks and casings are pooled; vectors are
  module-level scratch objects. If you add a system, pre-allocate it.
- **All player-facing prose lives in `src/story/`.** Gameplay code never contains a French
  sentence, so the script can be rewritten or translated without touching logic.

## Reporting bugs / requesting features

Use the issue templates. Provide reproduction steps, expected vs actual behaviour, your browser
and GPU, and anything the console printed. Security issues: please **do not** open a public
issue — contact the maintainer directly.

## Code of Conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
