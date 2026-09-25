# Handoff notes

Each Claude Code session ends a task with `/handoff`, which adds a note at the **top** of this file. Each session starts with `/sync`, which pulls and reads the newest notes. Keep the 20 most recent entries; git history keeps older ones.

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
**Changed:** Multi-machine workflow. Git is the shared state and every Claude Code session is a disposable worker. Added the working-across-machines rules to `CLAUDE.md`, this file, `docs/DECISIONS.md`, `docs/PLATFORM_NOTES.md`, `docs/CLAUDE.local.example.md`, and the `/sync` and `/handoff` commands in `.claude/commands/`. `CLAUDE.local.md` is now ignored by git. The macOS and Windows workflow runs on every push to `main` and to `fix/**` branches, skipping pushes that change only Markdown, `docs/`, or `.claude/`.
**Found:** This Mac's clone predated the cloud session's history rewrite; it was reset to `origin/main`. Locally, `node_modules/electron/install.js` had to be run by hand after `npm ci` before Electron would start.
**Checked:** Type check clean, 72 unit tests pass, production build succeeds, phase 1 end-to-end suite passes (11 steps). The workflow file was validated as YAML; its first push-triggered run starts with this commit.
**Next platform must check:**
- **Windows machine:** create `CLAUDE.local.md` from `docs/CLAUDE.local.example.md`, run `/sync`, then install the draft v1.1.0 `PageBinder-Setup-1.1.0.exe`. Confirm it starts, and that it asks Keep or Start fresh only when earlier settings exist. Run `npx tsx scripts/cross-platform.ts check <folder>` on a notebook made on the Mac.
- **Mac (any):** install the draft v1.1.0 `.dmg` and confirm the Keep or Start fresh question appears over an earlier installation.
**Open:** The draft v1.1.0 release is unpublished until both installers have been tried on real machines. Outlook email drag-and-drop is still unverified.
