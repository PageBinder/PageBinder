# PageBinder development plan

Features and changes phase by phase, with the commands and file layout for working on the code. For what the program is and how to install it, see [README.md](README.md). The full design is in [PROGRAM_DESCRIPTION.md](PROGRAM_DESCRIPTION.md).

This build covers phases 1 to 8: **Foundation**, **Documents**, **Attachments**, **Search**, **History and verification**, **Templates and copy or move**, **Scale**, and **Windows and installers**.

## What phase 1 includes

- Notebook, section group, section, and page folders with permanent IDs and metadata files
- Atomic, fsynced writes for every file the app creates
- Page checksums, a history snapshot before every save, autosave drafts, and automatic recovery of a damaged page
- Notebook tree with breadcrumb, section tabs (groups appear as tabs with a folder icon), and a page list
- Blank freeform canvas with movable, resizable text containers and Letter-size sheet outlines that grow with the content
- Pages are named in the page list: a new page opens an inline rename, and double-click renames later
- Basic text formatting: bold, italic, strikethrough, headings, bulleted and numbered lists, quotes, code blocks

## What phase 2 adds

- Tables (insert, add and remove rows and columns, header row, merge cells) and to-do lists. Table works even with nothing focused: it starts a new container holding the table
- Pictures as canvas objects: insert from a file, paste, or drop; drag to move, corner handle to resize; Delete removes. Right-click a picture to show it as an attachment card instead, and back
- Page setup per page with a notebook default: Letter, Tabloid, Legal, A4, A3, or custom, portrait or landscape, margins, and optional page numbers
- Snap to margins, to other objects' edges, and center to center, with alignment guides; optional grid (View > Toggle Grid)
- `page.html` written beside `page.json` on every save: a self-contained rendered copy that opens in any browser, paginated into sheets with the page's own paper size
- Print preview, Print, and Export as PDF, all produced from `page.html` so paper output matches the browser copy
- Text formatting: font, size, colour, highlight, underline, and left, centre, or right alignment
- Table toolbar that appears whenever the cursor is in a table: rows and columns above, below, left, and right, delete row or column, merge and split, header row and column, cell fill colour, delete table. Tab moves between cells and adds a row at the end
- Page numbers drawn in the lower right of each sheet in the editor, exactly where they print

## What phase 3 adds

- Attach any file: Attach file in the toolbar, Insert > File Attachment, drop from Finder or Explorer, or paste files copied there. Files are copied into the page's `attachments` folder under the naming rules; on APFS the copy is an instant clone
- Attachment cards show the name and size. Emails (`.eml`, `.msg`) show subject, sender, and date. Videos play inline on the card. Double-click opens the file in its default application; right-click offers Open, Show in Finder, and Delete
- Pictures dropped with Alt held become attachment cards instead of rendered pictures
- Integrity check on open: any referenced file that is missing or the wrong size is flagged in a notice and on its card, and the rest of the page loads normally
- Selection and deletion for every object: click a card or picture, or a text box's top bar, then press Delete or Backspace. Escape inside a text box selects the box. Backspace in an empty text box removes it. Cmd+Shift+Backspace deletes the current text box from inside it. Edit > Delete Selected Object does the same from the menu
- Undo and redo for object operations: creating, deleting, moving, resizing, and page setup. Inside a text box Cmd+Z undoes typing as before; anywhere else it undoes the last object operation. A drag is one step
- Zoom: Ctrl+wheel or a trackpad pinch, Cmd+= and Cmd+-, or the toolbar buttons; the toolbar shows the level and clicking it resets to 100%
- Table rows resize by dragging their bottom edge, as columns do by their right edge. New tables are plain, with no header row and no fill

## What phase 4 adds

- Full-text search over page text, page and section names, and attachment names, including the bodies of attached emails. The index is SQLite FTS5 using the SQLite built into Electron's Node runtime, so nothing native needs building
- Type-ahead: results appear as you type, grouped into titles, page text with highlighted snippets, and attachments. Cmd+F focuses the box; arrow keys and Enter choose
- Choosing a result opens the page, switches the section and group, and highlights every match on the page with next and previous
- Scope: this notebook or the current section
- The index lives in `.index/search.sqlite`, is excluded from backups, is verified on open, and is rebuilt automatically if damaged or outdated. Pages are re-indexed on save; on open, only pages whose files changed are re-read, in the background, with progress shown in the search box

## What phase 5 adds

- Page History (File menu, Cmd+Shift+H, or a page's right-click menu): every saved version listed newest first, with a preview. Restore this version makes it current and keeps the replaced version; Copy to new page makes a separate page from it
- Pruning keeps history in check: every version for a day, one per day for a month, one per week beyond. The policy is stored per notebook and applied after each save
- Recycled Pages (File menu): deleted pages keep their whole folder plus a note of where they came from. Restore puts a page back in its section; entries older than 30 days are removed on open
- Verify Notebook (File menu): quick or full check of every page document, referenced file, unused file, rendered copy, history, and leftover temp file. Every finding has a Repair; repairs never delete a source file. Rebuild search index is there too
- Command-line export: `npm run export -- "<folder>" --combine out.html` regenerates every page.html under a notebook, group, section, or page folder and writes one HTML file with all pages in order; `--pdf out.pdf` writes a single PDF
- [RECOVERY.md](RECOVERY.md), the recovery guide for users
- Right-click a table cell for row height, column width, and row and column operations; with several cells highlighted, the sizes apply to all of them. The same two size buttons are in the table toolbar
- Undo inside an untouched text box now reaches the page history, and redo no longer moves the cursor into a recreated box
- Empty table rows are now the same height in the editor and in print; the editor view and the printed page match
- Verify Notebook offers Show file, Preview or Open, and named repairs such as Move to recycle folder, so an unused file can be inspected before anything is done with it
- File > Export Pages exports this page, the section, the group, or the whole notebook as one PDF or one HTML file, from inside the app
- Help menu (and About PageBinder on macOS): About with version and build time, getting started, keyboard shortcuts, how history and verification work, the recovery guide, the program description, dependencies with licences, and uninstall instructions, all readable inside the app

## What phase 6 adds

- Templates: right-click a page > Save as template, into this notebook's library (`templates/` in the notebook folder) or the global library (in the app's settings folder). Templates may hold text, tables, and pictures only. Placeholders `{{date}}`, `{{time}}`, `{{section}}`, `{{notebook}}`, and `{{title}}` are filled in when a page is made
- The + button in the page list offers New page and every template; right-click a section tab to set its default template, which the plain Add page then uses
- Move or copy: right-click a page or a section tab > Move or copy… and pick the destination. Copies are independent duplicates with new IDs, attachments included, and no history
- Drag a page onto a section tab to move it; hold Alt to copy
- Delete section or group moves it, with everything inside, to the recycle folder; File > Recycled Pages restores it
- The Templates notebook is a system notebook on the switch screen, above Recent. It shows every template as a page, in one section per notebook that has templates plus Global templates. Edit a template there to change every page made from it later; rename it from the list; drag it to the other tab to change where it is available; delete it to remove it from the templates offered
- Rubber-band selection: drag on empty canvas to select every object the box touches; shift-click adds or removes one. A selected group moves together and Delete removes it together, as one undo step
- Undo and redo also cover creating, deleting, moving, and copying pages, in the same history as object operations
- Table rows are 25 px by default and can be set as low as 10 px, in the editor and in print alike
- A page made from a template is named after the template
- Templates is a system notebook on the switch screen, listed above Recent, with one section per notebook that has templates plus Global templates; the toolbar's notebook menu offers only Switch notebook
- Help > Getting Started is a user guide: first steps, where notebooks live on disk and why you might open them without the app, what not to do inside a notebook folder, and how to set up backups with Time Machine, File History, a NAS copy job, cloud drives, or third-party backup software

## Version 1.0

The program reached a functional level with phases 1 to 7 and is now version 1.0.0. Changes in this release beyond the phases above:

- Right-click anywhere on the page to insert a text box, table, picture, picture as attachment, or file attachment at that spot, or to start drawing. Left-clicking empty canvas no longer creates a text box; it only clears the selection, and drag-select still works. Clicking an object activates it: a text box takes the cursor, a picture or card is selected
- The ribbon no longer holds Table, Picture, or Attach file; table editing lives entirely in the cell right-click menu, including fill colour and borders, so nothing moves under the cursor when a table is selected
- Ribbon groups wrap as whole groups on narrow windows instead of splitting mid-group
- Table borders like a spreadsheet: highlight a cell or a group of cells, right-click, and choose all, outside, inside, top, bottom, left, right, or none, at thin, medium, or thick weight. Borders print exactly as shown
- Drawing: Draw in the ribbon (or the canvas menu) arms a line, arrow, rectangle, or ellipse; drag on the page to draw it. Lines and arrows snap to horizontal or vertical when close. Shapes move, resize, and have draggable end points; the text colour and highlight tools set a selected shape's line and fill colours, with a no-fill option that leaves the shape see-through. Shapes print and appear in page.html
- Page setup margins offer Standard, Narrow, Wide, and Custom
- The switch screen scrolls, and each recent notebook has a remove button; the Templates notebook's hint no longer stretches the tab row
- Insert > Text Box in the app menu (Cmd+Shift+X) for keyboard users
- Colour picker everywhere a colour is chosen (text, highlight, cell fill, shape line and fill): a 40-colour palette, a Custom… entry that opens the system colour picker, and a Recent row that remembers the last ten colours picked
- Cycling a border weight or a shape's line weight keeps the menu open and updates the label
- Line snapping is half as eager, so shallow angles stay as drawn
- Drawing tools live only in the page right-click menu; Page setup and Print are only in the File menu; the ribbon shows "Drawing: … · Esc to stop" while a shape tool is armed
- Picture… inserts a rendered picture; to show a picture as a card, right-click it and choose Show as attachment, or use File attachment…
- Copy and paste objects: right-click any object > Copy (or Cmd+C with objects selected), then right-click the page > Paste at that spot, or Cmd+V. Works on the same page and between pages of the same notebook; pictures and attachments are copied into the destination page's folder
- Copy and paste pages: right-click a page > Copy page, go to the section you want, and choose Paste page here from the + menu. Page move is gone; pages are copied and the original deleted when needed
- Pasting table cells copies their content, with its text formatting, into the target table's cells; the target table keeps its own column widths, fills, and borders. Highlight cells with shift-click, Cmd+C, click a cell in the other table, Cmd+V
- Insert signature in a text box's right-click menu puts the account's full name and the date and time at the cursor in the current font
- Tab behaves like a word processor: a half-inch tab stop in text, indent and outdent in lists, next cell in tables. 
- Checked to-do items keep their text style; Wingdings 2 is in the font list
- Colour menus for shapes and cells open one picker at a time through Fill colour and Line colour submenus
- Exporting a section or notebook to PDF no longer inserts a blank sheet after each page
- The View menu has a Toggle Full Screen item (Ctrl+Cmd+F on macOS, F11 elsewhere)
- Right-click a PDF attachment > Insert printout of this PDF renders its pages as pictures below the card, sized to the printable width and scalable like any picture (up to 50 pages). Other document types open in their own application
- Renderer errors are caught: the window shows what happened and offers Continue or Reload, and the error is written to renderer-errors.log in the settings folder

## Version 1.0.1

Progress marker for user testing before further phases. Fixes since 1.0.0:

- Tab with several list items highlighted moves them all to the right by one tab stop, bullets or numbers unchanged, instead of erasing them; Shift+Tab moves them back. With the cursor in a single item, Tab nests it under the item above (a sub-list), or shifts it right when it is the first item. The shift is stored on each item, so page.html and printouts show it too
- Lines and arrows have no fill, so their right-click menu shows only Line colour, and the ribbon's fill colour leaves them alone
- The View menu has one full-screen item, Toggle Full Screen; the extra one macOS adds to View menus is switched off
- Automated test windows open on the second display (`PAGEBINDER_TEST_DISPLAY`), leaving the main display free
- The program is renamed from DigiNote to PageBinder, and the project folder with it. Its icon and logo come from `resources/logo-artwork.jpg`: `npm run icons` cuts the badge out with transparent corners and writes the window and Dock icons, the in-app logo on the Welcome and About screens, and the macOS and Windows installer icons in `build/`
- The settings folder follows the name (`~/Library/Application Support/PageBinder`). On first start the old `diginote` folder, with the recent-notebooks list and the global template library, is copied across; notebooks themselves are unaffected because nothing in them depends on the program's name. Environment variables are now `PAGEBINDER_OPEN` and so on, and the export command is `scripts/pagebinder-export.ts`

## Phase 7: scale

The notebook tree is now served from the search index and maintained in place: every create, rename, move, copy, or delete refreshes only the section or group it touched, and the folder scan runs in the background after open to catch changes made outside the app. Index writes are batched in transactions and text entries are addressed by row, which turned the first full-text build of 50,000 pages from seven minutes into five seconds. Folder scans read files in parallel. A busy cursor shows whenever a request to the main process takes more than a moment.

Measured on a 50,000-page notebook (`npx tsx scripts/make-scale.ts`, `npx tsx scripts/measure-scale.ts`) on an Apple Silicon Mac with an SSD:

| Measure | Before | After, first open (no index yet) | After, later opens |
|---|---|---|---|
| Window usable with the tree | 8.4 s | 3.2 s | 1.1 s |
| Background full-text index of all pages | about 7 min | 5 s | 2.5 s check |
| Type-ahead query, median | | 7 ms | 7 ms |
| Add page | over 30 s | 0.3 s | 0.3 s |
| Open a group or section | | 50 ms | 40 ms |

The spec's targets were under 2 s to a usable window with an existing index, under 20 ms per type-ahead query, and under 5 minutes for the first index. All three are met.

## Phase 8: Windows and installers (version 1.1.0)

- **Installers.** `npm run dist:mac` on a Mac builds `dist/PageBinder-1.1.0-arm64.dmg` and `-x64.dmg` (plus zips). `npm run dist:win` on Windows builds `dist/PageBinder-Setup-1.1.0.exe`, one installer for x64 and ARM PCs. It installs per user by default, needs no administrator rights, lets the user pick the folder, and adds Start menu and desktop shortcuts. The configuration is `electron-builder.yml`, and the icons come from `build/`. Neither installer is signed yet: macOS gets an ad-hoc signature, which Apple Silicon requires, and Windows SmartScreen asks once before the first run. The Help menu documents are packaged inside the app.
- **Checked on real Windows and macOS machines.** `.github/workflows/platforms.yml` runs when started by hand from the Actions tab (it uses about 200 of the free plan's 2,000 monthly minutes, so it is run before a release rather than on every push). On `windows-latest` and `macos-latest` it runs the type check, the unit tests, the crash test, and every end-to-end suite, then builds both installers and attaches them to the run for download. It also runs the acceptance check below in both directions. The Windows side installs the real installer silently and opens the Mac's notebook in the installed app, and the Mac side does the same with a notebook made on Windows.
- **Acceptance check (Mac notebook opens on Windows from a copy, no differences).** `scripts/cross-platform.ts make <folder>` builds a notebook and records the size and SHA-256 of every file. `check <folder>`, run on the other system against a copy, confirms these points:
  - the same files arrive with the same bytes;
  - every page's checksum holds, and rendering here gives a byte-identical `page.html`;
  - a full Verify Notebook is clean;
  - the app shows every section, page, picture, and attachment;
  - after all that, not one file has changed.
  The notebook uses accented names, emoji, characters Windows forbids (`:`, `?`, `<`, `"`), a reserved name (`CON`), two sections whose names differ only in case, history, a picture, and a PDF.
- **Saves on Windows.** There, a rename fails for a moment while another program has the file open: a virus scanner, the search indexer, a backup job, or Explorer's preview pane. Every rename in the storage layer (atomic saves, page folder renames, moves, recycling) now retries for up to about three seconds on Windows before reporting a failure. macOS behaviour is unchanged.
- **Long paths.** The app reads and writes paths past Windows' 260-character limit. Pictures, attachments, and rendered pages with a full path of 250 characters or more are served straight from disk rather than through Chromium's file loader, and video can still seek. Verify Notebook reports a **Long file path** warning for any page with a file whose full path is over 240 characters, because older programs, backup tools included, stop at 260.
- **Notebook copied with a lock.** A `.lock` written on another computer, for example in a NAS copy taken while the notebook was open, is ignored and replaced. Before, its process number was checked against this computer's processes and could refuse to open the notebook. The lock now records the computer's own name, so a window started from the Dock or Start menu and one started from a terminal agree.
- **Files the system adds.** Verify Notebook no longer reports `Thumbs.db`, `desktop.ini`, or the macOS `Icon` file as unused page files. Explorer and Finder create these in picture folders, and they travel with NAS copies.
- **Exports on Windows.** A combined HTML export saved outside the notebook links pictures as `file:///C:/...`. Before, the drive letter made those links unusable.
- **First run.** With no recent notebooks, the Welcome screen shows a short Getting started note: a notebook is a folder, pages save themselves with history, and a backup is a copy of the folder. It also links to the full guide, and Create notebook suggests the Documents folder. The Getting Started guide now opens with installation steps for both systems.
- **Windows details.** The right-click item is labelled **Show in Explorer** on Windows, and the taskbar groups the running window with its Start menu shortcut.
- Backup instructions now leave out `.lock` as well as `.index`.
- **Clean installs, and a choice on every installation.** The installed app and the development build no longer share a settings folder: the development build (`npm run dev`, `npx electron .`) keeps its recent-notebooks list, global templates, and browser storage in `PageBinder Dev`, and an installed copy uses `PageBinder`, so nothing from development shows in an installed copy. Every installation has an ID: on Windows the installer writes the installation time beside the app (`build/installer.nsh`), and on macOS it is the app bundle's creation time. The first time a new installation starts (a first install, a reinstall, or an update) and finds earlier settings, it asks: **Keep my settings** or **Start fresh**. Start fresh moves the recent list and templates into an `Earlier settings <date>` folder beside them; nothing is deleted, and notebooks are never affected. With no earlier settings it starts clean without asking. `scripts/check-package.ts`, run by both build workflows, fails the build if a package holds anything but the program, its help documents, and its libraries.
- **README and releases.** `README.md` is now the front page for GitHub: what the program does, a screenshot, and how to download, install, update, and uninstall it. The phase-by-phase notes moved to this file, `DEVELOPMENT_PLAN.md`. `.github/workflows/release.yml` builds both installers from a version tag (or by hand from the Actions tab) and attaches them to a draft release, which is published from the Releases page.
- **The installed app starts.** Built into an installer, the app stopped at launch: `happy-dom`, which `@tiptap/html` needs to write `page.html`, was only a peer dependency, so the installer left it out. It is now a declared dependency. The development build and every test suite had it, which is why only the installed app showed the fault; the cross-platform check now starts the installed app on every run.
- **Page list shows a new title straight away.** Saving, renaming, restoring a version, or creating a page from a template now finishes updating the search index before the page list is refreshed. Before, the list could keep showing the old title; the Mac and Windows test runs caught this.

## Commands

The program lives in `app/`; run every command there (`cd app`). User documents are in `docs/` and developer notes in `docs/dev/`.

```bash
npm install          # first time only
npm run dev          # run the app; UI hot-reloads, main process restarts on change
npm run build        # production build into out/
npm start            # run the production build
npm test             # storage layer unit tests
npm run typecheck    # TypeScript checks for main, preload, and renderer
npm run crash-test   # kill a saving process 30 times and prove nothing is lost
npm run icons        # rebuild every icon and the in-app logo from resources/logo-artwork.jpg
npm run e2e          # build to out-e2e/ and drive the real window through every suite
npm run dist:mac     # macOS installers into dist/ (run on a Mac)
npm run dist:win     # Windows installer into dist/ (run on Windows)
npx tsx scripts/cross-platform.ts make|check <folder>   # phase 8 acceptance check across two computers
npx tsx scripts/make-medical.ts <notebook> [groups]   # fill a notebook with people, pets, and visit pages for usability testing
npx tsx scripts/make-scale.ts <parent> [pages]        # build a large notebook for scale testing
npx tsx scripts/measure-scale.ts <notebook>           # measure open, index, search, and add-page times through the real window
npm run export -- <folder> [--combine out.html] [--pdf out.pdf]   # regenerate page.html files and combine pages
npx tsx scripts/make-sample.ts   # create test-notebooks/Farm records 2026
npx tsx scripts/readme-screenshot.ts <notebook> ../docs/images/pagebinder.png   # retake the README screenshot (after build:e2e)
```

To open a notebook automatically at startup, set `PAGEBINDER_OPEN` to the notebook folder:

```bash
PAGEBINDER_OPEN="$PWD/test-notebooks/Farm records 2026" npx electron .
```

## Layout

```
src/main/            Electron main process
src/main/storage/    folder format, atomic writes, checksums, history, recovery
src/preload/         bridge exposing window.pagebinder to the renderer
src/renderer/        React user interface
src/shared/          data model shared by main and renderer
test/                vitest unit tests for the storage layer
scripts/             crash test and sample notebook generator
```

## Files in a page folder

```
page.json      the note: paper settings, print settings, canvas objects, file manifest, checksum
page.html      rendered copy, regenerated on every save and whenever it is missing or stale
images/        pictures placed on the page
attachments/   files attached to the page
.history/      one snapshot of page.json per save
```

## Saving behaviour

- Every keystroke marks the page dirty. A draft is written 1.5 s after the last change.
- A full save, which first snapshots the previous version into `.history`, happens on Cmd+S, when switching pages, when the window loses focus, and after 20 s without edits.
- A page that fails to parse or fails its checksum is renamed with a `.corrupt-<time>` suffix and the newest valid snapshot is restored, with a notice shown in the window.
