# This machine (copy to CLAUDE.local.md in the repository root; that file is never committed; npm commands run in app/)

- **Role:** lead | platform   <!-- lead: this Mac only. platform: every other machine and cloud sessions -->
- **Platform:** macOS (Apple silicon | Intel) | Windows (x64 | ARM) | Linux
- **Branches:** lead works on `main`; platform machines use `fix/<platform>-<topic>` and merge back within the task.
- **Toolchain:** Node version and where it is installed; anything unusual about PATH.
- **GitHub:** signed in with `gh auth login --web` (yes/no); commit identity set in this clone (yes/no).
- **Displays:** where automated test windows should appear, if it matters.
- **Local test data:** where sample notebooks live on this machine (never committed).
- **Owns:** what this machine is responsible for checking (installers, platform-specific code, cross-platform check).
- **Do not:** anything this machine must never do (for example: publish releases, change shared code without a handoff note).
