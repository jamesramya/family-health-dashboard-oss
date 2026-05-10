# History Cleanup Guide (for first-time OSS maintainers)

If a sensitive file was committed, **deleting it in a later commit is not enough**. You must rewrite or replace history.

## Recommended path (small/new OSS repo)

If your public repo is new and has low traffic, the cleanest option is:

1. Archive/delete the public repo on GitHub.
2. Recreate it from a fresh local clone with a single clean commit.
3. Push using your GitHub noreply email.

### 1) Set noreply email before creating fresh history

```bash
git config --global user.email "<your-id>+<username>@users.noreply.github.com"
git config --global user.name "<your-name>"
```

### 2) Create a clean one-commit history from your current working tree

```bash
# from your local working copy
rm -rf .git
git init
git add .
git commit -m "Initial public release (sanitized)"
git branch -M master
git remote add origin git@github.com:<username>/<repo>.git
git push -u origin master
```

## Alternative path (if you cannot recreate the repo)

Use history-rewrite tooling, then force push:

- `git filter-repo` (recommended)
- BFG Repo-Cleaner

After rewriting history:

1. Force push all refs.
2. Revoke/rotate any tokens used near the incident period.
3. Assume copied/forked data may still exist externally.

## Post-cleanup verification

Run:

```bash
rg -n "<sensitive-string-1>|<sensitive-string-2>|<email-or-id>" .
```

Also search GitHub UI for those strings in:
- default branch
- commit history
- tags/releases

