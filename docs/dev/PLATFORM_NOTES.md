# Platform notes

What each platform has taught us, so the next machine does not relearn it. Add to this file in `/handoff` whenever something platform-specific is found.

## Windows
- **Briefly locked files.** Virus scanners, the search indexer, and backup tools hold files open for a moment. Every rename goes through `renameDurable` in `src/main/storage/atomic.ts`, which retries for about 3 seconds. Never use a bare `fs.rename`.
- **Long paths.** Paths over 260 characters work. Pictures at long paths are read directly from disk, and Verify Notebook warns when a path passes 240 characters.
- **Foreign lock files.** A `.lock` copied from another computer, for example in a NAS backup taken while the notebook was open, must not stop the notebook opening.
- **Files Windows adds by itself.** Verify Notebook ignores `Thumbs.db` and `desktop.ini`.
- **Forbidden file names.** Tests and sample data must not use `< > : " / \ | ? *`, trailing dots or spaces, or reserved names such as `CON` and `NUL`.
- **Exported HTML** must link pictures with URL-style forward slashes.
- **Wording.** The right-click menu says "Show in Explorer" on Windows and "Show in Finder" on macOS.
- **Installer.** The installer is per-user, with no administrator rights, and covers x64 and ARM. Being unsigned, it triggers SmartScreen's "Run anyway". `build/installer.nsh` records the installation time, which is how a new installation is recognised.
- **CI runners** start at 1024×768. The workflow sets 1920×1080 before the window tests.
- **npm 11 on a local Windows machine** may block `electron-winstaller`'s install script. If `npm run dist:win` fails, approve it with `npm install-scripts approve electron-winstaller`, and commit the `allowScripts` change only after checking it.

## macOS
- **Unsigned apps.** The app has an ad-hoc signature, so the first launch needs System Settings > Privacy & Security > Open Anyway. The app bundle's creation time identifies a new installation.
- **Harmless message during development:** `sandbox_extension_issue_file ... Operation not permitted`.
- **Homebrew PATH.** With Node from Homebrew, non-login shells need `/opt/homebrew/bin` on PATH.
- **Icons.** `npm run icons` uses `sips` and `iconutil`, so run it on a Mac. Commit the regenerated files in `build/`, `resources/`, and `src/renderer/src/assets/`.
- **Full screen from a background window.** macOS ignores a full-screen request from a window that is not the active one. When someone uses the Mac while the window tests run, the phase 8 suite checks the single Toggle Full Screen item but skips the toggle itself, rather than pulling the test window to the front.
- **Small screens.** A 1024×768 screen broke a drag test. The window tests scroll objects into view before dragging.
- **Electron binary.** If `npx electron --version` fails after `npm ci`, run `node node_modules/electron/install.js`.

## Everywhere
- **Declare every runtime library** in `dependencies`. The installer leaves out anything undeclared. `happy-dom` was missing once and the installed app crashed on launch.
- **Playwright `app.evaluate`:** use no named inner functions, because tsx's `__name` helper does not exist inside the app.
- **A key pressed right after a click (tests only).** For a plain click, the editor lets the browser place the cursor and reads it a moment later. If a key arrives first, and the editor still holds an older selection that the key would not change (for example Select All while everything is still selected from before), the late report of the click then collapses the selection. It takes a few milliseconds and shows only on slow machines such as the GitHub runners, on Mac and Windows alike; no person types that fast. Tests wait until the editor has registered the click (its selection is empty) before pressing a key. This, not the ribbon, explains the Windows line-spacing failures of 27 September.
- **Timing.** Tests must wait for a condition, not for a fixed delay. The crash test and a restored-title check failed on slow machines until they did.
- **Linux (cloud sessions and CI):** window suites need a display, so run them with `xvfb-run -a npm run e2e`.
- **Every npm and npx command runs inside `app/`.** The repository root holds only the README, the licence, `CLAUDE.md`, and the `docs/` folder.

- **GitHub macOS runner screens are small.** An element near the top of a text box can sit under the toolbar there, so a mouse press at its coordinates hits the toolbar instead. Bring it into view with Playwright's `hover()` (which scrolls and checks what is on top) before a raw `mouse.down()`, and compare positions relative to a moved element rather than to the screen, since that scroll moves everything.
