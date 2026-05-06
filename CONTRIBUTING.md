# Contributing

Thank you for your interest in contributing!

## Before you start

- Open an issue to discuss the change before investing significant time in an implementation. For small fixes (typos, doc clarifications) you can go straight to a PR.
- This project follows [TDD](https://martinfowler.com/bliki/TestDrivenDevelopment.html): write the failing test first, then the implementation.

## Development setup

1. Install Node 20+.
2. Copy `worker/.dev.vars.example` to `worker/.dev.vars` and fill in the secrets (see [docs/CONFIGURATION.md](docs/CONFIGURATION.md)).
3. Install dependencies: `npm install` (from the repo root — this covers both workspaces).
4. Run the worker dev server: `npm run dev:worker`.
5. Run the app dev server: `npm run dev:app`.

## Running tests

```bash
npm test               # runs worker tests then app tests
npm run test:worker    # worker only
npm run test:app       # app only
npm run typecheck      # TypeScript check for both workspaces
```

Tests must pass before submitting a PR. The CI workflow (`pr-tests.yml`) runs the same checks automatically.

## Commit style

Follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`. Keep the subject under 72 characters.

## Pull requests

- Branch from `master`.
- Keep PRs focused — one logical change per PR.
- Include tests for any new behaviour.
- Do not commit secrets, patient data, or personal information.

## Code of conduct

Be kind. This project is used by real families to track health information for loved ones. Treat contributors and users with respect.
