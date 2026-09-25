---
description: End a task — record what changed and what the next machine must check, then commit and push
argument-hint: "[optional: a one-line summary of the task]"
---

End-of-task handoff for PageBinder. The next session, on this or another machine, starts from what you write here and from git, not from this conversation.

1. **Know this machine** from `CLAUDE.local.md` (role and platform). If it is missing, ask the user and create it from `docs/dev/CLAUDE.local.example.md`.
2. **Verify before recording.** If code changed in this task, run `npm run typecheck` and `npm test` inside `app/`, plus the end-to-end suites the change touches. Record exactly what ran and the results; never claim a check that did not run.
3. **Write the note** at the top of `docs/dev/HANDOFF.md`, below the `---` line, in the entry format that file shows. Title it with today's date, this machine's role and platform, and the branch. Use $ARGUMENTS as the gist if given. Cover what changed (with the commit range), what was found, what was checked, what the next platform must check, and what is open. Keep only the 20 newest entries.
4. **Record lasting knowledge where it belongs:**
   - A choice that should outlive the session goes in `docs/dev/DECISIONS.md`, as one line under the right heading.
   - A platform-specific lesson goes in `docs/dev/PLATFORM_NOTES.md`.
   - A user-visible change goes in the version section of `docs/dev/DEVELOPMENT_PLAN.md`.
5. **Keep it public-safe.** The repository is public. Before committing, check the staged diff (`git diff --cached`) for personal names, email addresses other than the PageBinder noreply address, machine owner details, local absolute paths under a user's home folder, tokens, and passwords. Remove any you find. Never stage `CLAUDE.local.md` or any `PageBinder-*.md` personal file.
6. **Commit and push.**
   - Confirm `git config user.name` is `PageBinder` and `git config user.email` is `4245724+PageBinder@users.noreply.github.com`. If they are not, set them in this clone.
   - Commit with a plain message describing the task. Add no `Co-Authored-By` or `Claude-Session` lines.
   - Pull with `git pull --ff-only` first (on a conflict, stop and ask), then `git push`.
7. **On a `fix/*` branch** whose work is complete and whose checks pass, ask the user whether to merge it into `main` now. On a yes:
   - Rebase onto `origin/main`, and re-run the checks if anything came in.
   - `git switch main && git pull --ff-only && git merge --ff-only <branch> && git push`.
   - Delete the branch locally and on GitHub (`git push origin --delete <branch>`).

   Otherwise leave the branch pushed, and say in the note that it is waiting to merge.
8. **Report** in plain language: what was recorded, the commit and push result, the CI run that the push started (`gh run list --limit 1`), and what the next machine should do.
