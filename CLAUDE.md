# CLAUDE.md

Guidance for Claude when working in this repository. Keep it concise and factual; update it whenever a convention changes or a recurring correction is needed.

## Project

**Empire Builder** — a web app for designing model railroad layouts. Users draw and edit track plans (build their "empire") on an HTML5 canvas.

## Prime directive: write good code

Working code is not enough. The goal is code that is correct, clear, and that the next person (or the next session) can understand and change safely.

- Favor clarity over cleverness. Code is read far more than it is written.
- Keep functions small and single-purpose; keep names honest about what they do.
- A name must be exactly what the thing is, not approximately — a heading is not a pose; a route section is not a "piece". Rename when a name could mislead, even late and even across a directory.
- Model the domain explicitly (tracks, segments, connections, layouts) rather than passing around loose primitives.
- Handle the unhappy path. Validate inputs, surface errors, don't swallow them.
- No dead code, no commented-out blocks, no `any` as a shortcut. Delete instead of disabling.
- Write comments for the long term, following John Ousterhout's *A Philosophy of Software Design*: capture what the code cannot say for itself — intent, rationale, units, invariants — at the right level of abstraction. No point-in-time breadcrumbs ("for now", "newly added", "this will change when…", "temporary", "provisional").
- **A comment states what the code *is* and *why*, never what it *is not*, *was*, or *might become*.** This is a recurring mistake, so check for it deliberately: before keeping any comment, scan it for a negation of identity ("not a ray", "isn't a tree"), a contrast with something unbuilt ("we don't use X here", "unlike a list"), or a future tense ("will later", "eventually") — and delete that clause. "An infinite line, not a ray" → "an infinite line". The only allowed contrast is the rationale for a choice the code actually made between real options, with its reason ("stored on the section rather than the arc, so it stays serializable"); a bare contrast carrying no "why" is not.
- Leave the code better than you found it, but keep refactors separate from feature changes.
- If a requirement is ambiguous or a design choice has real trade-offs, stop and ask rather than guessing.
- The best code is no code. Find ways to solve problems without writing code.
- Push back on requirements. If a behavior-preserving change introduces significant complexity, maybe the behavior should not be preserved.

## Tech stack

- **Language:** TypeScript, `strict` mode. No `any` without a written justification.
- **Package manager:** npm.
- **Build/dev:** Vite.
- **Canvas/graphics:** Paper.js — chosen for its vector path model, which fits track geometry (curves, segments, connected paths) well.
- **Lint/format:** gts (Google TypeScript Style) — bundles ESLint + Prettier configured to the Google TypeScript Style Guide.
- **Testing:** Vitest.

## Style guide

We follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html). Anything in it that can be enforced mechanically must be — that is the job of gts (ESLint + Prettier) and `tsc` in strict mode. Prefer adding or tightening a lint rule over relying on people to remember a convention. When the style guide and a lint rule disagree, fix the config so the tooling reflects the guide.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start the Vite dev server
- `npm run build` — type-check (`tsc --noEmit`) and produce a production build
- `npm run lint` — run gts (ESLint + Prettier, Google style)
- `npm run format` — auto-fix lint/formatting issues (`gts fix`)
- `npm test` — run the test suite (Vitest)

**Before considering any task done:** `npm run lint` and `npm test` must pass, and `npm run build` must type-check clean. Fix violations rather than suppressing them.

## Conventions

- Use American English ("passing siding", not "passing loop"; "neighbor", not "neighbour").
- TypeScript strict mode; prefer explicit types at module boundaries, let inference handle locals.
- Named exports only; avoid default exports.
- Keep Paper.js / canvas concerns separate from domain logic. Domain types (track, segment, layout) should not depend on Paper.js so they stay testable in isolation.
- Pure functions for layout/geometry math where possible; keep side effects (rendering, DOM) at the edges.
- Model domain types as plain, immutable data (interfaces/types) operated on by free functions, not classes with methods. Plain data stays trivially serializable (import/export, US-10/US-11) and easy to test; reach for a class only when identity or encapsulated mutable state genuinely calls for it.
- Model variants as discriminated unions with an explicit `kind`, and branch with exhaustive `switch` statements ending in `assertNever` — adding a variant should fail to compile until every site handles it. Don't infer the variant from the presence of an optional field.
- Use `const` by default; reach for `let` only when reassignment is real.
- File and directory names in `kebab-case`; types and classes in `PascalCase`; variables and functions in `camelCase`.

## Workflow

- **Plan before building.** For any non-trivial change, propose the approach and wait for sign-off before writing code.
- **Work iteratively.** Build thin vertical slices end-to-end; get one solid before widening. Avoid big-bang changes.
- **Test alongside features.** Geometry and domain logic should have unit tests; a passing suite is what makes iterative changes safe. Leave no module untested.
- **Write tests that can fail for the right reason.** Use non-trivial, non-zero inputs (so a defaulted or hard-coded value can't pass), cover several cases (e.g. all quadrants for geometry), and pin boundaries exactly (the value that just fits vs. the one that just doesn't) rather than only gross failures. Express inputs in domain units (`feet(2)`, not `100`).
- **Run the checks** (lint, test, build) before reporting work as complete.
- **Respond to all code review conversations.** Allow the reviewer to resolve the conversation.

## Structure

- `src/domain/` — track/section/layout types and geometry logic (no Paper.js); pure and unit-tested
- `src/render/` — stateless Paper.js drawing given data, plus the domain↔canvas transform. `draw*` draws one shape; `render*` composes a layer from data.
- `src/editor/` — the interactive controller: editor state (`state.ts`, pure) and the Paper.js event/orchestration edge (`editor.ts`). `refresh*` re-syncs the canvas from current state by calling `render/`'s `render*`.
- `src/main.ts` — entry point; builds the default space and starts the editor
- `index.html` — Vite entry document
- Tests live next to the code they cover as `*.test.ts`

> `src/ui/` is reserved for HTML controls (toolbars, panels, the app shell) when we have them; canvas interaction lives in `src/editor/`, not `src/ui/`. Keep domain logic free of Paper.js throughout.
