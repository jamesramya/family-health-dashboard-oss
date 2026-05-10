# Contributing

Thanks for contributing!

## Before opening a PR

1. Open an issue first for non-trivial changes.
2. Avoid committing secrets, personal data, or deployment identifiers.
3. Keep changes scoped and include tests when behavior changes.

## Local workflow

```bash
npm ci
npm test
```

## Security & privacy expectations

- Never commit `.dev.vars`, API tokens, private keys, account IDs, or patient-identifying information.
- Use placeholders like `your-username`, `example.com`, and fake IDs in examples.
- If you find a vulnerability, use GitHub private vulnerability reporting as documented in `SECURITY.md`.

## Pull request checklist

- [ ] Change is documented if setup/config behavior changed
- [ ] Tests run locally (or explain why not)
- [ ] No secrets/PII included
