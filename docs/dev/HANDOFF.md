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

## 2026-10-01 · lead (macOS, Apple silicon) · main (later)
**Changed:** Page border and grid are saved with each page (`pageBorder`, `pageGrid`, optional); View > Toggle Page Border and Toggle Grid change only the open page; with the border off the editor shows one endless canvas (no sheet-break gaps), while printing is unchanged; templates carry both settings. The v1.1.3 draft was rebuilt from this commit at the user's request.
**Found:** Nothing new.
**Checked:** Type check; 94 unit tests; every end-to-end suite on this Mac (phase 5 needed a rerun after a one-off closed window).
**Next platform must check:** Windows, in addition to the earlier note: on a page with text past the first sheet, turn the border off (the gap closes, text runs on), turn the grid on, switch pages and back (each page keeps its own); Print Preview still shows separate sheets; a page made from a borderless template starts borderless.
**Open:** v1.1.3 stays a draft until the user says to publish.

## 2026-10-01 · lead (macOS, Apple silicon) · main
**Changed:** Version 1.1.3 work so far, pushed with a draft release (v1.1.3, not published): Paste picture on a text box's right-click menu; File > Export Pages > "Web page with attachments (.zip)" writes one shareable zip (HTML plus every picture and attachment, relative links; `exportHtmlPackage` in `app/src/main/export.ts`, new dependency `fflate`); the Export dialog explains each format and its drop-downs fit. Future features: infinite canvas with the page border off, and border and grid stored per page (decisions recorded).
**Found:** The installed 1.1.2 on the lead Mac was the Intel build (`-x64.dmg`) running under Rosetta, which caused macOS's "will not open in macOS 28" warning; the release log shows both Mac installers were built from the right app.
**Checked:** Type check; 93 unit tests; every end-to-end suite on this Mac.
**Next platform must check:** Windows (the user continues there on a `fix/windows-…` branch): the user suspects problems with cut, paste, and undo when moving pictures in and out of text boxes; also try Export Pages > Web page on Windows, unzip the result, and open the HTML (pictures shown, attachment cards open their files). When the Windows work is merged, the v1.1.3 draft is rebuilt from the new commit by moving the v1.1.3 tag (a draft only; ask the user before moving or deleting any tag).
**Open:** v1.1.3 is a draft; not to be published until the user says so.

## 2026-09-30 · lead (macOS, Apple silicon) · main
**Changed:** Version 1.1.2, published as a pre-release: Outlook email bodies stored only as HTML or compressed RTF are searchable (index version 5, so every notebook re-indexes once); new pages start with a title block (name in bold 20 px, creation date and time); format painter; the last notebook and page reopen at start (remembered in the app's settings); small remove button on recent notebooks; narrow margins for new notebooks only; the page.html backup and Page History show the whole canvas while printing and Print Preview use the sheets; cut and paste moves pictures between the page and text boxes, and page objects can be cut; File > Notebook Properties (last edit with the account name, now recorded as `modifiedBy` on each save; size and files; history; large attachments); Verify Notebook explains its checks, buttons, and findings.
**Found:** Opening a page must not wait on the settings write (it made a quick undo and redo race), but quitting must: on Windows CI a quit right after opening a page lost the remembered page, so `before-quit` now waits for pending writes (`recentWritesPending` in `recent.ts`); the platforms test now expects the last notebook to reopen at start; page picture objects are not listed in `manifest.images` (existing quirk, worked around when pasting into a box); a test's Cmd+V does not trigger the Edit menu's paste, so phase 8 dispatches the paste event itself.
**Checked:** Type check; 92 unit tests; every end-to-end suite on this Mac. The user tried each feature in the running app.
**Next platform must check:** Windows: install PageBinder-Setup-1.1.2.exe; drag an Outlook email onto a page and search for a word from its body (the HTML/RTF fix has only unit tests); check Notebook Properties shows the Windows account name; open a page.html backup in a browser (whole canvas) and print it (sheets only); cut a picture on the page and paste it into a text box.
**Open:** Nothing.

## 2026-09-29 · lead (macOS, Apple silicon) · main
**Changed:** Since the last note: pictures in text boxes resize from any corner and also arrive by drop, paste, or Insert > Picture while the cursor is in a box; four alignment buttons with drawn symbols (Justify added, no selected highlight); a click outside a text box clears its highlight; heading buttons and shortcuts removed (the heading node stays for existing pages; `@tiptap/extension-heading` is now a direct dependency). At the user's explicit, confirmed request the published v1.1.1 pre-release was deleted and rebuilt from this code as 1.1.1, with the 1.1.1 and 1.1.2 revision-log sections merged; the version then moves to 1.1.2.
**Found:** A copy of the old 1.1.1 (28 September build) may exist on some machines under the same number. It does not know pictures in text boxes: do not edit such pages with it.
**Checked:** Type check; unit tests; every end-to-end suite after the highlight fix. The heading removal was checked by the user in the running app; its phase 2 test change has not been run yet.
**Next platform must check:** Windows: install the new PageBinder-Setup-1.1.1.exe; check the alignment buttons, that no heading buttons show, and that a page with pictures in a text box prints as shown.
**Open:** Nothing. Afterwards the phase 8 picture step failed on the GitHub macOS runner only: its smaller screen left the text box's move bar under the toolbar, so the drag missed it. The test now hovers the bar into view, checks it is uncovered, and measures the picture relative to the box (commits `a2e70b8`, `17b4227`). CI passes on macOS and Windows, and phase 2 passes locally with the heading change.

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** Word wrap reworked after the user's testing: pictures are now anchored in a text box (the box's `pictures` list) at a spot the user chooses, a fixed pixel size, text flowing down beside them. Drag to move, corner to resize, Delete to remove, Insert picture at the right-clicked spot. Shared float layout in `app/src/shared/render/anchoredPictures.ts`, editor widgets in `app/src/renderer/src/anchoredPicturesView.ts`. New standing rule: the user tests new features before anything is pushed (`CLAUDE.md`).
**Found:** The first version (a picture inside a line) resized with the box, could not be placed freely, and wrapped in line rather than beside the text.
**Checked:** Type check; 78 unit tests (new: float layout); phase 8's rewritten picture step (placed at the click, three or more lines beside it, corner resize keeps shape, box resize keeps its size, drag lands exactly, moves with the box, same spot in page.html, copied to another page with its file, Delete) and every other suite. Waiting for the user's hands-on test before pushing.
**Next platform must check:** After approval: Windows, insert and drag a picture in a text box and compare with Print Preview.
**Open:** Text flows down one side of a picture only.

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** New rule: once a version is released, development moves to the next number immediately. The version is now 1.1.2 (in development); the revision log and development plan sections for pictures in text are headed 1.1.2.
**Found:** Nothing new.
**Checked:** Version fields in `package.json` and `package-lock.json`.
**Next platform must check:** Nothing.
**Open:** Unchanged.

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** Pictures inside text (word wrap option 1): Insert picture… in a text box's right-click menu; Wrap (in line, left, right), Size (25, 50, 75, 100 per cent), and Remove picture on a picture's right-click menu. Stored as a `textImage` node naming a file in the page's images folder, listed in the manifest. Page breaks count an in-line picture as part of its line. The app keeps its own manifest when the canvas reports a change. Recorded under "Next version" in the revision log and development plan; the version number is unchanged until the next release.
**Found:** Inserting a picture into text lost its manifest entry, because the canvas's change carried a file list a moment old; fixed in `onPageChange`. Versions 1.1.1 and earlier do not know the new content: they show such a text box empty, and typing in that box there replaces its stored text (checked in TipTap 3.31's content loading; noted in FUTURE_FEATURES.md).
**Checked:** Type check; 77 unit tests (new: picture rendering, name listing and renaming); phase 8's new step (insert, stored and listed, loads, prints, wraps with text beside it, sizes to a quarter, copies with its text box to another page, removes); every other window suite rerun. Screenshots of the editor and page.html match.
**Next platform must check:** Windows: insert a picture into text, wrap it left, and check the screen against Print Preview.
**Open:** Release the next version when the user asks; until it is installed everywhere, do not edit pages with pictures in text in 1.1.1 or 1.1.0.

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** Version 1.1.1 (line-by-line page breaks, line spacing, the Order menu, editor and print alignment), to be published as a pre-release. Added `docs/REVISION_LOG.txt`, a plain-text description of every version for users; `release.yml` now attaches it to every release as `PageBinder-revision-log.txt` and puts the version's own section in the release notes. The development plan has a Version 1.1.1 section. The user asked for exactly two published pre-releases (1.1.0 and 1.1.1) and nothing else, so the duplicate v1.1.0 draft is deleted.
**Found:** GitHub's "latest release" link skips pre-releases; with only pre-releases, the README's download link lands on the Releases page, which lists them, so it still works.
**Checked:** The notes extraction was run locally against the log for 1.1.1 and 1.0.1. See the commit's workflow run, the 1.1.1 release run, and the final release list.
**Next platform must check:** Windows: install PageBinder-Setup-1.1.1.exe over 1.1.0 and confirm the Keep or Start fresh question and that notebooks open unchanged.
**Open:** Word wrap choice; tall tables across page breaks; document-wide undo (all in FUTURE_FEATURES.md).

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** New standing rule: a published release is never overwritten (see `CLAUDE.md`, "Published releases"). `release.yml` gained a first job that checks for a published release of the version: when publishing a draft created the tag, the run stops quietly; when started by hand for a published version, it fails and asks for a new version number. Builds no longer run in either case.
**Found:** v1.1.0 was published as a pre-release on 27 September from `e88dbee` (printout search). Publishing created the `v1.1.0` tag, which started `release.yml` and produced a second, identical v1.1.0 draft. Nothing public was replaced; the extra draft is still there.
**Checked:** The workflow parses; its release query, run against the repository, finds one published v1.1.0 release and none for v1.2.0. The first run of the changed workflow will be the proof.
**Next platform must check:** Nothing.
**Open:** The changes since `e88dbee` (line-by-line page breaks, line spacing, the Order menu, editor/print alignment) need a new version number (for example 1.1.1 or 1.2.0) to reach a new draft. The duplicate v1.1.0 draft can be deleted if the user wants.

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** Removed the ribbon's "restore the last selection" workaround (`Toolbar.tsx`); the dropdowns apply straight to the editor's selection again. Phase 8's line-spacing step clicks into the text box, waits until the editor has registered the click, and only then presses Select All.
**Found:** The Windows failures of the ribbon line-spacing check were a test race, not a Windows or ribbon bug. Reproduced on this Mac by slowing the browser to CI speed and logging every editor transaction: an earlier Select All left the editor holding "everything selected"; the test clicked and pressed Select All within milliseconds, before the editor had read the click; Select All was then a no-op, and the late report of the click collapsed the selection. With the wait, 12 of 12 slowed runs pass. The earlier note blaming Windows dropdown focus was wrong and is corrected in `docs/dev/PLATFORM_NOTES.md`.
**Checked:** Type check; phase 8 suite; see the commit's workflow run for macOS and Windows.
**Next platform must check:** Nothing new.
**Open:** Unchanged.

## 2026-09-27 · lead (macOS, Apple silicon) · main
**Changed:** Page breaks now move text line by line (`app/src/shared/render/paginate.ts` for print, `app/src/renderer/src/sheetBreaks.ts` for the editor, kept in step). A long paragraph fills the sheet and continues at the top of the next printable area; a block whose first line would cross moves whole with its bullet, checkbox, or quote; tables, rules, and empty paragraphs move whole. The editor now wraps text exactly as page.html does (ProseMirror's `break-spaces` and disabled ligatures are overridden) and no longer adds a gap above tables. The in-app server renders page.html fresh for Print, Print Preview, and PDF export.
**Found:** (1) The editor had always wrapped long paragraphs slightly differently from the printout because of ProseMirror's stylesheet; fixed on the editor side so printed wrapping is unchanged. (2) Adding space can make the browser adjust the scroll position, so both implementations measure the canvas again before every decision; without that, a scrolled editor pushed a paragraph far down the page. (3) Printing loaded the stored page.html, so a page saved by an older version would print with its old layout. (4) The phase 8 table-paste step could click Bold before the selection registered; it now waits.
**Checked:** Type check clean; unit tests; every window suite. Phase 8's page-break step now covers a paragraph split at two boundaries (each sheet filled to its last line, continuation at the top of the next printable area), a list whose crossing item moves whole, the stored paragraph staying whole, and editor-versus-print agreement on every margin and split, at standard, double, and 1.15 spacing.
**Next platform must check:** Windows: a long paragraph across a page break splits at the same line on screen and in Print Preview.
**Open:** Tables taller than a sheet still run through the margins (no row splitting). Word wrap choice still open.

## 2026-09-27 · lead (macOS, Apple silicon) · main
**Changed:** Line spacing. A paragraph attribute (`lineHeight`: 1, 1.15, 2, 2.5, or 3; none means the standard 1.5) set from a new ribbon control beside the font size or from Line spacing in a text box's right-click menu, for every paragraph the selection touches (`app/src/shared/render/lineHeight.ts`). The same menu has Default for new text boxes, kept per computer in window storage (`app/src/renderer/src/textDefaults.ts`) and written into each new text box and table, so pages look the same everywhere. TextStyleKit's own character-level line height is switched off to avoid a second, conflicting kind.
**Found:** TextStyleKit ships a character-level `lineHeight` command; the paragraph command is named `setParagraphSpacing` to keep them apart.
**Checked:** Type check clean; 75 unit tests pass (new: page.html line spacing). Phase 8 gained a step: right-click spacing on highlighted text, ribbon spacing, the default for a new box and its next paragraph, and editor-versus-print page breaks at double and 1.15 spacing. All window suites rerun on this change.
**Found (after push):** On GitHub's Windows machine, the ribbon's spacing dropdown applied only to the paragraph with the cursor: choosing from a dropdown moved focus and Chromium on Windows collapsed the highlight. The ribbon now restores the last selection made in the text before any dropdown command (font, size, spacing). Also, the phase 8 full-screen toggle is skipped when the test window is not the active one (someone using the Mac), checking only the single menu item then.
**Next platform must check:** Windows: line spacing from the ribbon and the right-click menu; a long double-spaced text box across a page break looks the same on screen and in Print Preview.
**Open:** Word wrap option still to be chosen.

## 2026-09-26 · lead (macOS, Apple silicon) · main
**Changed:** (1) Text boxes that cross a page break now look in the editor as they print: `app/src/renderer/src/sheetBreaks.ts` applies the print script's push rule live as node decorations, recalculated on edit, move, resize, paper change, and zoom. (2) Order submenu (bring to front, bring forward, send backward, send to back) on every object's right-click menu and on multi-selections; objects stack in list order everywhere, so it reorders the page's object list. (3) Word wrap options written up in `docs/dev/FUTURE_FEATURES.md`, awaiting the user's choice.
**Found:** Printing had always pushed blocks past sheet boundaries; the editor never did, which is why the two differed. Pictures and attachments placed across a page break are deliberately not handled, as agreed with the user.
**Checked:** See the commit: unit tests, and the window suites including two new phase 8 steps (editor and page.html push the same lines by the same amounts; Order commands, their stacking in the editor and page.html, and undo).
**Next platform must check:** Windows: a long text box across a page break looks the same on screen and in Print Preview; Order works on overlapping objects.
**Open:** Choice of word wrap option.

## 2026-09-25 · lead (macOS, Apple silicon) · main
**Changed:** Printout text is searchable (version stays 1.1.0; the draft release is rebuilt). `renderPdfPages` reads each PDF page's text layer while rendering; `insertPrintout` stores it on each printout picture as `printout: { source, page, text }`. The index gained a `printouts` column (INDEX_VERSION 4, so every notebook rebuilds its index on first open), and search returns a `printouts` group shown as **In printouts**. In the app the text sits invisibly inside the picture, so page search counts it and outlines the picture with the current match; `page.html` lays it transparently over the picture. Added `docs/dev/FUTURE_FEATURES.md` with the follow-ups (word highlighting, older printouts, OCR, Word printouts) and the gaps from the feature comparison.
**Found:** Nothing new.
**Checked:** Type check clean; 74 unit tests pass (new: printout indexing, page.html overlay); phase 1, 3, 4, 5, and 8 window suites pass, phase 8 now checks the stored text, the search group, the outlined picture, and that a plain PDF attachment is not searchable.
**Next platform must check:** Windows: insert a printout of a PDF with text, search for a word from it, and confirm the page appears under In printouts and the picture is outlined.
**Open:** Draft v1.1.0 is being rebuilt with this change.

## 2026-09-25 · lead (macOS, Apple silicon) · main
**Changed:** Added `docs/PageBinder-feature-comparison.xlsx`, a feature-by-feature comparison of PageBinder with Joplin, Obsidian, Logseq, Trilium Notes, SiYuan, AFFiNE, AppFlowy, Anytype, Notesnook, Zim Desktop Wiki, and Xournal++ (sheets: PageBinder at a glance, Comparison, Summary, Sources). Every derived value is a formula. The README links it. The packaged app excludes `.xlsx` files from the docs-bundle, and `check-package.ts` checks that.
**Found:** Nothing new.
**Checked:** LibreOffice recalculated all 734 formulas with no errors, and the pattern lists matched an independent count. The workflow run for this push covers the packaging change.
**Next platform must check:** Nothing.
**Open:** Entries marked * in the spreadsheet rest on general knowledge of a project rather than a page read on the date; re-check them when the comparison is next updated.

## 2026-09-25 · lead (macOS, Apple silicon) · main
**Changed:** Help documents for end users. Help > Program description now shows a new `docs/PROGRAM_OVERVIEW.md`: what the program does, how notes are organised, printing, editing, search, history, templates, where notes live, and what it does not do, with no development history. The developer specification moved to `docs/dev/PROGRAM_DESCRIPTION.md` (kept out of the package). Getting started no longer has an Installing section; the README keeps the install steps.
**Found:** The first push failed the phase 5 suite on both platforms: the test build is launched from `app/out-e2e/main`, and the app looked for its Help documents only one level above its app path. `about.ts` now tries the app path and the working folder with up to three parent levels each. In a real installation the documents come from `docs-bundle`, which was never affected.
**Checked:** Type check and unit tests from `app/`; phase 5 suite passes locally after the fix. The workflow run for the fix commit is the proof on CI.
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
