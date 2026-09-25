---
description: Start a task — pull the latest work, read the handoff notes, and report what changed and what this machine should check
argument-hint: "[optional: the task you are about to start]"
---

Start-of-task sync for PageBinder. Git is the shared state between machines; do not rely on memory of earlier sessions. Make no code changes in this command.

1. **Know this machine.** Read `CLAUDE.local.md`. If it is missing, ask the user whether this machine is the lead Mac or a platform machine and what platform it is, then create `CLAUDE.local.md` from `docs/CLAUDE.local.example.md` (it is git-ignored; never commit it).
2. **Check the working tree.** Run `git status`. If there are uncommitted changes or unpushed commits, stop and report them; ask the user whether to commit, stash, or discard before pulling. Never discard work without an explicit yes.
3. **Pull.** Note the current commit (`git rev-parse HEAD`), then `git fetch --prune origin` and fast-forward the current branch (`git pull --ff-only`). If it cannot fast-forward, stop and report; do not merge, rebase, or reset without the user's go-ahead.
   - On a `fix/*` branch, also report how far it is behind `origin/main` (`git rev-list --count HEAD..origin/main`) and recommend rebasing onto `main` before more work.
   - A lead machine should be on `main`; a platform machine should not start work on `main` (see CLAUDE.md, "Working across machines").
4. **If `package-lock.json` changed** since the noted commit, run `npm ci` (then `node node_modules/electron/install.js` if Electron is missing).
5. **Read what happened elsewhere:** the newest entries in `HANDOFF.md` (at least all entries newer than the noted commit), `git log --oneline <noted commit>..HEAD`, and any changes to `docs/DECISIONS.md` and `docs/PLATFORM_NOTES.md` in that range.
6. **Check CI:** `gh run list --workflow platforms.yml --limit 3` and, if the latest run on this branch failed, `gh run view <id> --log-failed | tail -60`.
7. **Report briefly, in plain language:** what changed since this machine last synced, CI state, anything in the handoff notes addressed to this machine's platform or role, and open items. If the user named a task ($ARGUMENTS), say how the notes affect it and, for a platform machine, suggest the branch name `fix/<platform>-<topic>`.
