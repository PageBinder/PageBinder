# PageBinder: notes for Claude

Local-only, folder-based notebook app in the style of classic desktop OneNote (formerly DigiNote). Electron 44, electron-vite 5, React 19, TypeScript 5.9, TipTap 3, SQLite FTS5 via `node:sqlite`. The full spec is `PROGRAM_DESCRIPTION.md`, and features and changes by phase are in `README.md`. Recovery design is in `RECOVERY.md`, and user docs are in `docs/`.

## Status
- rev1 = version 1.0.1 (git tag `rev1`). The user is testing this version before any further phases.
- Phases 1 to 7 are built. Phase 8 (Windows build, installers for macOS and Windows, recovery pass on Windows) waits for the user's go-ahead. The installer icons are already in `build/`.
- Unverified: the native Outlook email drag-and-drop helper (the user cannot test it yet).

## Commands
```
npm ci                 # install (Electron downloads its binary)
npm run dev            # run the app with hot reload (restart it after config or main-process changes)
npm run typecheck      # main, preload, and renderer
npm test               # vitest unit tests (49)
npm run e2e            # build to out-e2e/ and drive the real window through every suite (needs a display; use xvfb-run on Linux)
npm run icons          # rebuild all icons and the in-app logo from resources/logo-artwork.jpg (macOS: uses sips and iconutil)
npx tsx scripts/make-medical.ts "<parent>/Medical Records" 500   # regenerate the usability-test notebook (not in git)
```

## Conventions that matter
- Durability first: every write is atomic (tmp, fsync, rename), and page.json is checksummed with history snapshots. Never write notebook files any other way. See `src/main/storage/`.
- Notebook files never contain the program name or the `pagebinder://` scheme. Image URLs are built at run time, so renames stay safe.
- The renderer must never import `src/shared/render/renderPage.ts`, which is server-only. Shared helpers live in `src/shared/format.ts` and `shapeSvg.ts`.
- End-to-end tests launch `out-e2e/`, never `out/`, so a running dev watcher cannot overwrite them. Test hooks are the `PAGEBINDER_OPEN`, `PAGEBINDER_TEST_PICK_FILES`, `PAGEBINDER_TEST_SAVE_PATH`, and `PAGEBINDER_TEST_DISPLAY` environment variables.
- In Playwright `app.evaluate` callbacks, avoid named inner functions, because tsx injects a `__name` helper that the app cannot see.
- On the user's Mac, automated windows go on the second display. The user's main display stays free.

## Working with the user
- The user tests by hand in the running app and reports numbered issues. Fix all of them, add or adjust an end-to-end check for each, run the affected suites, and update the README's version section.
- Write final reports in plain language: lead with the outcome, and use short sentences and bullets.
