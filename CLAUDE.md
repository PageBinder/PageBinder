# PageBinder: notes for Claude

Local-only, folder-based notebook app in the style of classic desktop OneNote (formerly DigiNote). Electron 44, electron-vite 5, React 19, TypeScript 5.9, TipTap 3, SQLite FTS5 via `node:sqlite`. Layout: the program is in `app/` (run every npm and npx command there), user documents in `docs/`, developer notes in `docs/dev/`, and only `README.md`, `LICENSE`, and this file at the root, so the GitHub front page stays short. The full spec is `docs/dev/PROGRAM_DESCRIPTION.md` (developers only; `docs/PROGRAM_OVERVIEW.md` is the end-user version shown in Help), and features and changes by phase are in `docs/dev/DEVELOPMENT_PLAN.md`; `README.md` is the user-facing front page on GitHub. Recovery design is in `docs/RECOVERY.md`. Lasting choices are in `docs/dev/DECISIONS.md`, platform lessons in `docs/dev/PLATFORM_NOTES.md`, and the latest work from every machine in `docs/dev/HANDOFF.md`.

## Status
- rev1 = version 1.0.1 (git tag `rev1`), the version the user tested by hand.
- Phases 1 to 8 are built; version 1.1.0 adds phase 8 (Windows build, installers, long paths, first run). `.github/workflows/platforms.yml` tests on real macOS and Windows runners, builds both installers, and runs `scripts/cross-platform.ts` across the two. It runs on every push to `main` and `fix/**`, except pushes that change only Markdown, `docs/`, or `.claude/`, and can also be started by hand. This is free only while the repository is public; if it ever becomes private, return the workflow to start-by-hand first (private macOS minutes count ten times against 2,000 a month). `release.yml` builds a draft release from a `v*` tag.
- Branches: the lead Mac works on `main`; every other machine and cloud session works on a short-lived `fix/<platform>-<topic>` branch, merged back into `main` within the task and then deleted. See "Working across machines".
- The repository is meant to be public. Commit as `PageBinder <4245724+PageBinder@users.noreply.github.com>`. Commit messages carry no `Co-Authored-By` or `Claude-Session` lines, and the owner's personal name and email appear nowhere in the repository. Installers are unsigned (macOS ad-hoc, no Windows certificate).
- Unverified: the native Outlook email drag-and-drop helper (the user cannot test it yet).

## Commands
All of these run inside `app/` (`cd app` first).
```
npm ci                 # install (Electron downloads its binary)
npm run dev            # run the app with hot reload (restart it after config or main-process changes)
npm run typecheck      # main, preload, and renderer
npm test               # vitest unit tests (72)
npm run e2e            # build to out-e2e/ and drive the real window through every suite (needs a display; use xvfb-run on Linux)
npm run dist:mac       # macOS dmg and zip into dist/ (on a Mac); npm run dist:win for the Windows installer (on Windows)
npx tsx scripts/cross-platform.ts make|check <folder>   # notebook made on one OS must open on the other with no differences
npm run icons          # rebuild all icons and the in-app logo from resources/logo-artwork.jpg (macOS: uses sips and iconutil)
npx tsx scripts/make-medical.ts "<parent>/Medical Records" 500   # regenerate the usability-test notebook (not in git)
```

## Conventions that matter
- Durability first: every write is atomic (tmp, fsync, rename), and page.json is checksummed with history snapshots. Never write notebook files any other way. Use `renameDurable` from `atomic.ts`, never a bare `fs.rename`, because Windows needs the retry. See `src/main/storage/`.
- Notebook files never contain the program name or the `pagebinder://` scheme. Image URLs are built at run time, so renames stay safe.
- The renderer must never import `src/shared/render/renderPage.ts`, which is server-only. Shared helpers live in `src/shared/format.ts` and `shapeSvg.ts`.
- End-to-end tests launch `out-e2e/`, never `out/`, so a running dev watcher cannot overwrite them. Test hooks are the `PAGEBINDER_OPEN`, `PAGEBINDER_TEST_PICK_FILES`, `PAGEBINDER_TEST_SAVE_PATH`, and `PAGEBINDER_TEST_DISPLAY` environment variables.
- In Playwright `app.evaluate` callbacks, avoid named inner functions, because tsx injects a `__name` helper that the app cannot see.
- Automated test windows open on a second display when there is one (`PAGEBINDER_TEST_DISPLAY`), so the user's main display stays free.
- Settings folders: the development build uses `<appData>/PageBinder Dev`, an installed copy `<appData>/PageBinder` (see `src/main/settingsFolder.ts`). Every new installation (reinstall or update) that finds earlier settings asks Keep or Start fresh; never keep them silently. Nothing from development may reach an installed copy or a package; `app/scripts/check-package.ts` guards the package, including the help documents copied in from `docs/`. Test seams: `PAGEBINDER_TEST_PACKAGED=1`, `PAGEBINDER_TEST_SETTINGS_CHOICE=keep|fresh`.

## Working across machines
Git is the shared state; each Claude Code session is a disposable worker that takes its context from the repository. Machine-specific details (role, platform, toolchain, local test data) live in `CLAUDE.local.md` in the repository root, which is git-ignored; create it from `docs/dev/CLAUDE.local.example.md` if it is missing.
- **Start every task in a fresh session with `/sync`.** It pulls, reads the newest `docs/dev/HANDOFF.md` entries and the git log, and reports what changed. Never work from a stale session or a clone that has not been pulled.
- **End every task with `/handoff`.** It records what changed, what was found and checked, and what the next platform must verify, then commits and pushes. Work is not finished until it is pushed.
- **Roles.** The lead is the user's Mac: core, platform-neutral work (features, `src/shared`, `src/renderer`, storage and index logic) happens there on `main`. Other machines handle their platform's pieces (code behind `process.platform` checks, installer and build configuration, platform tests, real-machine verification) on `fix/<platform>-<topic>` branches. They change shared code only in small, clearly described steps; anything larger goes into a handoff note for the lead.
- **Merging.** Rebase a `fix/*` branch onto `origin/main`, re-run the checks, and fast-forward `main` to it, only with the user's go-ahead. Then delete the branch locally and on GitHub. Never force-push `main`.
- **The user is the dispatcher.** Machines do not talk to each other. Finish and push on one machine, then the user tells the next machine to `/sync` and verify. CI on every push reports whether macOS and Windows still pass.

## Working with the user
- The user tests by hand in the running app and reports numbered issues. Fix all of them, add or adjust an end-to-end check for each, run the affected suites, update the version section of `docs/dev/DEVELOPMENT_PLAN.md`, and finish with `/handoff`.
- Write final reports in plain language: lead with the outcome, and use short sentences and bullets.
