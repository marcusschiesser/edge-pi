---
description: Plan a change before implementing it
---

Create an implementation plan for the requested change. Do NOT make any changes — only read, analyze, and plan.

## Process

1. **Understand the request** — clarify the goal in one sentence.

2. **Scout the codebase:**
   - Find all files relevant to the change
   - Read them to understand current structure, patterns, and conventions
   - Identify dependencies and potential ripple effects

3. **Produce a plan in this format:**

   ## Goal

   One sentence summary of what needs to be done.

   ## Plan

   Numbered steps, each small and actionable:
   1. Step one — specific file/function to modify
   2. Step two — what to add/change
   3. ...

   ## Files to Modify
   - `path/to/file.ts` — what changes
   - `path/to/other.ts` — what changes

   ## New Files (if any)
   - `path/to/new.ts` — purpose

   ## Risks

   Anything to watch out for.

4. **Present the plan** and wait for confirmation before any implementation.

## Guidelines

- Keep steps concrete — the plan should be executable verbatim.
- Prefer editing existing files over creating new ones.
- Flag any ambiguity or trade-offs for the user to decide.
- Consider tests, types, and build impact.

## Request

This is the request:
