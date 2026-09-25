# Handoff notes

Each Claude Code session ends a task with `/handoff`, which adds a note at the **top** of this file (`docs/dev/HANDOFF.md`). Each session starts with `/sync`, which pulls and reads the newest notes. Keep the 20 most recent entries; git history keeps older ones.

Notes are public. Write about the code, never about people: no names, emails, machine owners, or credentials.

Entry format:

```
## <YYYY-MM-DD> · <machine role> (<platform>) · <branch>
**Changed:** what was done, with the commit range.
**Found:** anything learned that others need (bugs, surprises, flaky tests).
**Checked:** what was run and the result (be exact; say what was not run).
**Next platform must check:** concrete steps for the other machines, or "nothing".
**Open:** unfinished work or questions for the user.
```

---

## 2026-09-25 · lead (macOS, Apple silicon) · main
**Changed:** Help documents for end users. Help > Program description now shows a new `docs/PROGRAM_OVERVIEW.md`: what the program does, how notes are organised, printing, editing, search, history, templates, where notes live, and what it does not do, with no development history. The developer specification moved to `docs/dev/PROGRAM_DESCRIPTION.md` (kept out of the package). Getting started no longer has an Installing section; the README keeps the install steps.
**Found:** Nothing new.
**Checked:** Type check and unit tests from `app/`. The package job of this push's workflow run verifies the docs-bundle.
**Next platform must check:** Nothing.
**Open:** Unchanged.

## 2026-09-25 · lead (macOS, Apple silicon) · main
**Changed:** Repository layout, so the GitHub front page shows a short list before the README. The program moved into `app/` (run every npm and npx command there), user documents into `docs/`, and developer notes (this file, the decision log, platform notes, the development plan, the CLAUDE.local example) into `docs/dev/`. Only `README.md`, `LICENSE`, and `CLAUDE.md` stay at the root. The packaged app now receives its help documents from `docs/` as `resources/docs-bundle` (electron-builder `extraResources`), and `app/src/main/about.ts` reads them from there when packaged and from the repository root in development. `app/scripts/check-package.ts` checks that bundle. Workflows run every command in `app/`, and artifact paths are prefixed `app/`. `/sync`, `/handoff`, and `CLAUDE.md` use the new paths.
**Found:** Nothing new.
**Checked:** From `app/`: type check clean, 72 unit tests pass, production build succeeds, phase 1 end-to-end suite passes. `npm run dist:mac` built both Mac installers, and the package check passed with the docs-bundle present and `docs/dev` and `docs/images` absent. The macOS and Windows workflow run for this push is the proof for CI.
**Next platform must check:** On every machine, after `/sync`: `cd app` before any npm command, and move any local `node_modules`, `out`, `out-e2e`, and `test-notebooks` folders into `app/` (or just run `npm ci` there). Nothing else changes.
**Open:** Unchanged.

## 2026-09-25 · lead (macOS, Apple silicon) · main
**Changed:** Notes only. Recorded that the OneNote importer will be a separate helper app, not a core feature (see `docs/DECISIONS.md`).
**Found:** The draft v1.1.0 `PageBinder-1.1.0-arm64.dmg` was downloaded and installed on a real Apple silicon Mac by the user with no issue. The first push-triggered macOS and Windows run on the recreated repository passed every job, including both installers and the cross-platform notebook checks.
**Checked:** Nothing run locally for this note.
**Next platform must check:**
- **Windows machine (fresh session, `/sync` first):** download and install the draft `PageBinder-Setup-1.1.0.exe`; confirm it starts and asks Keep or Start fresh only when earlier settings exist. Then the major test: **drag and drop emails from Outlook** onto a page (single and several at once, with the native drop helper). Also run `npx tsx scripts/cross-platform.ts check <folder>` on a notebook made on the Mac.
**Open:** The draft v1.1.0 release stays unpublished until the Windows installer has been tried. Outlook drag-and-drop remains unverified.

## 2026-09-25 · lead (macOS, Apple silicon) · main
**Changed:** The GitHub repository was deleted and recreated with the same name, settings, `main`, and `rev1` tag, to remove superseded commits from before the history cleanup that GitHub still served by commit code. The commit codes on `main` are unchanged, so existing clones keep working with no action. Actions run history restarted, and the draft v1.1.0 release was rebuilt by the Release workflow.
**Found:** Rewriting history does not remove old commits from GitHub. They stay downloadable by code, and the repository's public activity feed lists those codes. Only deleting the repository, or a GitHub Support purge, removes them.
**Checked:** None of the 15 superseded commits is served any more; every commit in the new repository is authored by the PageBinder noreply address; the macOS and Windows run and the Release run started from the new repository.
**Next platform must check:** Never push branches or tags from an old clone made before 2026-09-25 that still holds pre-cleanup history. If unsure, clone fresh. Nothing else.
**Open:** Nothing new.

## 2026-09-25 · lead (macOS, Apple silicon) · main
**Changed:** Multi-machine workflow. Git is the shared state and every Claude Code session is a disposable worker. Added the working-across-machines rules to `CLAUDE.md`, this file, `docs/DECISIONS.md`, `docs/PLATFORM_NOTES.md`, `docs/CLAUDE.local.example.md`, and the `/sync` and `/handoff` commands in `.claude/commands/`. `CLAUDE.local.md` is now ignored by git. The macOS and Windows workflow runs on every push to `main` and to `fix/**` branches, skipping pushes that change only Markdown, `docs/`, or `.claude/`.
**Found:** This Mac's clone predated the cloud session's history rewrite; it was reset to `origin/main`. Locally, `node_modules/electron/install.js` had to be run by hand after `npm ci` before Electron would start.
**Checked:** Type check clean, 72 unit tests pass, production build succeeds, phase 1 end-to-end suite passes (11 steps). The workflow file was validated as YAML; its first push-triggered run starts with this commit.
**Next platform must check:**
- **Windows machine:** create `CLAUDE.local.md` from `docs/CLAUDE.local.example.md`, run `/sync`, then install the draft v1.1.0 `PageBinder-Setup-1.1.0.exe`. Confirm it starts, and that it asks Keep or Start fresh only when earlier settings exist. Run `npx tsx scripts/cross-platform.ts check <folder>` on a notebook made on the Mac.
- **Mac (any):** install the draft v1.1.0 `.dmg` and confirm the Keep or Start fresh question appears over an earlier installation.
**Open:** The draft v1.1.0 release is unpublished until both installers have been tried on real machines. Outlook email drag-and-drop is still unverified.
