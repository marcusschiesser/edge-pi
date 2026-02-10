# Development Rules

## First Message

If the user did not give you a concrete task in their first message,
read README.md, then ask which module(s) to work on. Based on the answer, read the relevant README.md files in parallel.

- packages/env/package.json
- packages/coding-agent-sdk/package.json
- packages/coding-agent/README.md

## Code Quality

- No `any` types unless absolutely necessary
- Check node_modules for external API type definitions instead of guessing
- **NEVER use inline imports** - no `await import("./foo.js")`, no `import("pkg").Type` in type positions, no dynamic imports for types. Always use standard top-level imports.
- NEVER remove or downgrade code to fix type errors from outdated dependencies; upgrade the dependency instead
- Always ask before removing functionality or code that appears to be intentional
- Never hardcode key checks with, eg. `matchesKey(keyData, "ctrl+x")`. All keybindings must be configurable. Add default to matching object (`DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS`)

## Commands

- After code changes (not documentation changes): `npm run check` (get full output, no tail). Fix all errors, warnings, and infos before committing.
- Note: `npm run check` does not run tests.
- NEVER run: `npm run dev`, `npm run build`, `npm test`
- Only run specific tests if user instructs: `npm test -- test/specific.test.ts`
- When writing tests, run them, identify issues in either the test or implementation, and iterate until fixed.
- NEVER commit unless user asks

## GitHub Issues

When reading issues:

- Always read all comments on the issue
- Use this command to get everything in one call:
  ```bash
  gh issue view <number> --json title,body,comments,labels,state
  ```

When creating issues:

- Add `pkg:*` labels to indicate which package(s) the issue affects
  - Available labels: `pkg:env`, `pkg:coding-agent-sdk`, `pkg:coding-agent`
- If an issue spans multiple packages, add all relevant labels

When closing issues via commit:

- Include `fixes #<number>` or `closes #<number>` in the commit message
- This automatically closes the issue when the commit is merged

## PR Workflow

- Analyze PRs without pulling locally first
- If the user approves: create a feature branch, pull PR, rebase on main, apply adjustments, commit, merge into main, push, close PR, and leave a comment in the user's tone
- You never open PRs yourself. We work in feature branches until everything is according to the user's requirements, then merge into main, and push.

## Tools

- GitHub CLI for issues/PRs
- Add package labels to issues/PRs: pkg:env, pkg:coding-agent-sdk, pkg:coding-agent

## Testing pi Interactive Mode with tmux

To test pi's TUI in a controlled terminal environment:

```bash
# Create tmux session with specific dimensions
tmux new-session -d -s pi-test -x 80 -y 24

# Start pi from source
tmux send-keys -t pi-test "cd /Users/badlogic/workspaces/pi-mono && ./pi-test.sh" Enter

# Wait for startup, then capture output
sleep 3 && tmux capture-pane -t pi-test -p

# Send input
tmux send-keys -t pi-test "your prompt here" Enter

# Send special keys
tmux send-keys -t pi-test Escape
tmux send-keys -t pi-test C-o  # ctrl+o

# Cleanup
tmux kill-session -t pi-test
```

## Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text
- Technical prose only, be kind but direct (e.g., "Thanks @user" not "Thanks so much @user!")

## Examples

- Prefer streaming (`agent.stream()` + `for await ... of result.textStream`) in examples so users see incremental output.
- Only use non-streaming (`agent.generate()`) when the example specifically needs a final aggregated result object.

## Changelog

Location: `packages/*/CHANGELOG.md` (each package has its own)

### Format

Use these sections under `## [Unreleased]`:

- `### Breaking Changes` - API changes requiring migration
- `### Added` - New features
- `### Changed` - Changes to existing functionality
- `### Fixed` - Bug fixes
- `### Removed` - Removed features

### Rules

- Before adding entries, read the full `[Unreleased]` section to see which subsections already exist
- New entries ALWAYS go under `## [Unreleased]` section
- Append to existing subsections (e.g., `### Fixed`), do not create duplicates
- NEVER modify already-released version sections (e.g., `## [0.12.2]`)
- Each version section is immutable once released

### Attribution

- **Internal changes (from issues)**: `Fixed foo bar ([#123](https://github.com/marcusschiesser/edge-pi/issues/123))`
- **External contributions**: `Added feature X ([#456](https://github.com/marcusschiesser/edge-pi/pull/456) by [@username](https://github.com/username))`

## Adding a New LLM Provider

Adding a new provider requires changes in `packages/coding-agent-sdk` and `packages/coding-agent`:

### 1. Model Registry (`packages/coding-agent-sdk/src/core/model-registry.ts`)

- Add the provider to the model registry
- Map to the standardized `Model` interface

### 2. Model Generation (`packages/coding-agent/scripts/generate-models.ts`)

- Add logic to fetch/parse models from provider source
- Generate model definitions

### 3. Coding Agent (`packages/coding-agent/`)

- `README.md` and `docs/providers.md`: Add provider setup instructions
- `CHANGELOG.md`: Add entry under `## [Unreleased]`

## Releasing

**Lockstep versioning**: All packages always share the same version number. Every release updates all packages together.

**Version semantics** (no major releases):

- `patch`: Bug fixes and new features
- `minor`: API breaking changes

### Steps

1. **Update CHANGELOGs**: Ensure all changes since last release are documented in the `[Unreleased]` section of each affected package's CHANGELOG.md

2. **Run release script**:
   ```bash
   npm run release:patch    # Fixes and additions
   npm run release:minor    # API breaking changes
   ```

The script handles: version bump, CHANGELOG finalization, commit, tag, publish, and adding new `[Unreleased]` sections.

## **CRITICAL** Tool Usage Rules **CRITICAL**

- NEVER use sed/cat to read a file or a range of a file. Always use the read tool (use offset + limit for ranged reads).
- You MUST read every file you modify in full before editing.

## **CRITICAL** Git Rules for Parallel Agents **CRITICAL**

Multiple agents may work on different files in the same worktree simultaneously. You MUST follow these rules:

### Committing

- **ONLY commit files YOU changed in THIS session**
- NEVER use `git add -A` or `git add .` - these sweep up changes from other agents
- ALWAYS use `git add <specific-file-paths>` listing only files you modified
- Before committing, run `git status` and verify you are only staging YOUR files
- Track which files you created/modified/deleted during the session

### Forbidden Git Operations

These commands can destroy other agents' work:

- `git reset --hard` - destroys uncommitted changes
- `git checkout .` - destroys uncommitted changes
- `git clean -fd` - deletes untracked files
- `git stash` - stashes ALL changes including other agents' work
- `git add -A` / `git add .` - stages other agents' uncommitted work

### Safe Workflow

```bash
# 1. Check status first
git status

# 2. Add ONLY your specific files
git add packages/coding-agent-sdk/src/core/ai-types.ts
git add packages/coding-agent-sdk/CHANGELOG.md

# 3. Commit
git commit -m "fix(ai): description"

# 4. Push (pull --rebase if needed, but NEVER reset/checkout)
git pull --rebase && git push
```

### If Rebase Conflicts Occur

- Resolve conflicts in YOUR files only
- If conflict is in a file you didn't modify, abort and ask the user
- NEVER force push
