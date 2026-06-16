# empire-builder

Design your model railroad empire — a web app for laying out and planning model
railroad track on an HTML5 canvas.

## Tech stack

TypeScript (strict) · Vite · Paper.js · gts (Google TypeScript Style) · Vitest.

## Getting started

```bash
npm install     # install dependencies
npm run dev     # start the dev server (Vite prints a local URL)
```

## Checks

Run these before considering a change done; all three must pass clean:

```bash
npm run lint    # gts / ESLint + Prettier (Google TypeScript Style Guide)
npm test        # Vitest
npm run build   # type-check (tsc --noEmit) + production build
```

`npm run format` auto-fixes lint/formatting issues.

## Layout

- `src/domain/` — track/segment/layout types and geometry (pure, no Paper.js)
- `src/main.ts` — app entry; Paper.js canvas setup and rendering (the edge)
