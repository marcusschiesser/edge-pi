---
description: Commit the current state with a fitting commit message
---
Create a git commit for the current changes with a well-crafted commit message.

## Process

1. **Check current state:**
   ```bash
   git status
   git diff --staged
   git diff
   ```

2. **Stage relevant changes:**
   - Stage all related changes (do NOT stage unrelated work-in-progress)
   - If nothing is staged, stage the unstaged changes that form a coherent unit

3. **Analyze the changes and craft a commit message:**
   - Use conventional commit format: `type(scope): description`
   - Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`, `perf`
   - Scope: the package or area affected (e.g. `edge-pi-cli`, `edge-pi`)
   - Description: imperative mood, lowercase, no period, max ~72 chars
   - Add a body if the "why" isn't obvious from the description

4. **Commit:**
   ```bash
   git commit -m "type(scope): description"
   ```

5. **Confirm** by showing the resulting `git log --oneline -1`.

## Examples

- `feat(edge-pi-cli): add clipboard image support`
- `fix(edge-pi): handle non-Error objects in stream error handler`
- `refactor(edge-pi-cli): extract model selector into separate module`
