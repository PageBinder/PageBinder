# PageBinder: program description

Name: **PageBinder**, renamed on 24 September 2026 from the working name DigiNote. The project folder is `PageBinder`, and the program icon is generated from `resources/logo-artwork.jpg`.
Status: version 1.0.1 (the 1.0.0 feature set plus the fixes listed under Version 1.0.1 in README.md; this revision is the marker for user testing before further phases). Phases 1 to 7 (Foundation, Documents, Attachments, Search, History and verification, Templates and copy or move, Scale) built on 24 September 2026. Phase 7 results and the 1.0 interface changes are recorded in README.md. The native Outlook drop helper is the one phase 3 item still to be verified against a real Outlook drag; see section 7.2. See README.md for how to run it.
Date: 22 September 2026.

## 1. Purpose

PageBinder is a desktop note-taking application modelled on the classic desktop version of Microsoft OneNote (2010 to 2016 era), before cloud features were added. It stores every notebook as a plain folder structure on the local disk, has no online or cloud component of any kind, and is built so that a regular file-level copy to a NAS is a complete backup.

The primary use is producing neatly formatted, printable documents made of text, tables, and images, with the ability to attach large supporting files such as videos, LiDAR scans, and long documents alongside the written notes.

## 2. Goals and non-goals

### Goals

- Notebook, section group, section, and page hierarchy that behaves like classic OneNote.
- Rich text editing with tables, images, lists, headings, checkboxes, and tags.
- Print to paper and export to PDF with output that looks like a finished document.
- Attachments of any size stored beside the page that owns them.
- Instant type-ahead search across all open notebooks.
- Local revision history for every page, similar to the version history OneDrive once provided for OneNote.
- Page templates and page copy or move between sections and notebooks.
- Storage that is plain files, human-readable where practical, and safe to copy with ordinary tools at any time. Every page can be read and printed from a browser without the app.
- Comfortable operation at 50,000 pages and 500 GB per notebook.
- A freeform canvas with visible page and margin guides, so documents can be laid out by hand and still print predictably.

### Non-goals

- No cloud sync, accounts, sharing, or collaboration.
- No mobile or web version.
- No stylus ink fidelity. A basic mouse-drawn drawing layer exists but is not a focus.
- No encryption of notebooks.
- No OneNote import. It was researched and found feasible, but it is not to be developed at this time. Section 19 keeps the findings for reference only.

## 3. Target platforms and technology

| Item | Choice |
|---|---|
| Primary platform | macOS |
| Secondary platform | Windows. Linux should work but is untested. |
| Language | TypeScript |
| Application shell | Electron |
| Editor | TipTap, built on ProseMirror, one instance per text container on the canvas |
| Printing and PDF | Chromium's print engine via Electron, styled with print CSS |
| Search index | SQLite with FTS5 through the `node:sqlite` module built into Electron's Node runtime (no native module to build) |
| Drawing layer | HTML canvas, mouse input only |
| Video playback | Chromium's built-in video element |
| Native drop helper | Small native Node module per platform for Outlook and Office drag formats |

Reasons for this stack: the web editor ecosystem gives the strongest tables, images, and document model available; Chromium produces reliable paginated print output; Node provides direct access to the folder structure; and one codebase covers Mac and Windows.

## 4. Notebook structure

A notebook contains section groups and sections. Section groups can be nested and contain sections and further section groups. Sections contain pages. Pages can have subpages, which are ordinary pages marked as children of the page above them for display and indentation only.

Each notebook is independent. It carries its own templates, its own search index cache, and all of its own attachments, so a notebook folder can be copied to another machine and opened with nothing missing.

Multiple notebooks can be open at once. Search can span all of them.

## 5. User interface

### 5.1 Window layout

The default layout is the classic arrangement:

- **Toolbar** across the top: notebook selector, formatting controls, insert controls (table, image, attachment), print, and the search box on the right.
- **Breadcrumb** beneath the toolbar showing the notebook and the current section group path, with an up arrow. Only the current location in the hierarchy is shown.
- **Section tabs** in a single horizontal row showing only the sections in the current section group. Each tab carries its section color as a colored top edge. Nested section groups appear in the same row as a tab with a folder icon; clicking one descends a level and adds a crumb to the breadcrumb. The row never grows beyond one line no matter how deep the nesting.
- **Page list** as a vertical panel on the right, showing the pages of the current section with last edited date, subpages indented, and an add page control. Long lists scroll.
- **Page canvas** filling the remaining space. Everything in the canvas is printable content; everything above and beside it is chrome and never prints.

An alternative layout with pages as a third horizontal tab strip (section groups, sections, pages stacked) is available as a setting. Both layouts use the same data and can be switched at runtime.

### 5.2 Page canvas

A page is a freeform canvas, as in OneNote. Text containers, tables, images, attachment cards, and drawings can be placed anywhere on the canvas by dragging, including outside the printable area. The canvas grows as far as content is placed in any direction. The canvas is blank: it carries no title block or date line. The page name lives in the page list, where a new page opens an inline rename as soon as it is created and any page can be renamed by double-clicking it. Created and modified times are shown in the page list and the page's details, and can be printed in the header or footer (section 9) when wanted.

**Printable area.** Each page has a paper size, orientation, and margins (section 9). The canvas shows two guides, each switchable from the View menu and remembered per notebook:

- **Page border**: the outline of the sheet, with the canvas beyond it lightly shaded so it is obvious what is off the paper.
- **Margins**: a dashed rectangle inside the border showing the printable region.

Both guides can be hidden for a clean OneNote-style canvas. Content that sits outside the printable area stays on the page but does not print. Print preview shows it dimmed so nothing goes missing unnoticed. A page is a document and is not limited to one sheet. The canvas draws a sheet outline for every sheet the content occupies, stacked vertically with a page-break line between them, each with its own margins and a sheet number. Content that runs past the bottom of one sheet continues on the next, so a long page prints as several sheets and the on-screen outlines show exactly where the breaks fall.

**Page sizes.** Letter 8.5 x 11 in is the default. Tabloid 11 x 17 in, Legal, A4, A3, and custom sizes are available, each in portrait or landscape. The size and orientation are set as a notebook default and can be overridden per page.

**Layout aids.** Snap-to-grid, alignment guides between containers, and an optional rule line or grid background help keep documents tidy when placing objects by hand. A simple drawing layer allows mouse-drawn annotations over any region.

### 5.3 Search box

Typing in the search box shows results in a dropdown below it as you type, with no need to press Enter. Results are grouped:

1. Matching section group, section, and page titles.
2. Matching page text, each with a highlighted snippet.
3. Matching attachment filenames.

A scope control selects this section, this notebook, or all open notebooks. Choosing a result opens the page with all matches highlighted and next and previous navigation. See section 10 for how this stays fast.

## 6. Editing features

- Text formatting: bold, italic, underline, strikethrough, highlight, font family, size, and color.
- Paragraph styles: headings, body text, quotes, and code blocks.
- Lists: bulleted, numbered, and nested; checkbox to-do items.
- Tables: insert, add and remove rows and columns, merge and split cells, column widths and row heights by dragging or by value, cell fill, and per-side borders (none, thin, medium, thick) for a cell or a highlighted group of cells. All table editing is in the cell right-click menu. New tables are plain with no header row.
- Images: insert from file, paste from clipboard, or drag and drop; resize, align, and caption.
- Image display mode: every image is either rendered in place or shown as an attachment card. Common browser-displayable formats default to rendered; very large images and formats browsers cannot show, such as TIFF, HEIC, and RAW camera files, default to a card. Right-click switches an image between the two at any time without touching the file on disk. A notebook setting chooses the default for dropped images, and a modifier key held during a drop forces the other mode.
- Links to other pages within the same or another notebook, and to external URLs.
- To-do checkboxes. Paragraph tags were built and then removed at the owner's request on 22 September 2026.
- Attachments: see section 7.
- Undo and redo: text edits within each text box, and a page-level history for creating, deleting, moving, resizing, and page setup, one step per drag.
- Keyboard shortcuts matching OneNote where practical.

## 7. Attachments

An attachment is any file inserted into a page that is not rendered inline. Typical examples are videos, LiDAR point clouds, CAD files, PDFs, and spreadsheets.

- Inserting an attachment copies the file into the page's attachments folder. The app never references a file at its original location.
- The page shows an attachment card with icon, filename, size, and an open action. Video cards play inline. PDFs open in the default application.
- Double-click, or Open in the card's right-click menu, launches the system's default application for that file type. Show in Finder or Explorer reveals the file.
- Each attachment's size and content hash are recorded in the page document. On opening a page, the app checks that every attachment exists and matches its recorded size, and warns if a file is missing or truncated. The hash is used for integrity, never for sharing or deduplication.
- On paper and in PDF, an attachment prints as its card.
- There is no size limit beyond available disk space.

### 7.1 Drag, drop, and paste

- Files dropped from Finder or Explorer onto the canvas are copied into the page's attachments folder and placed as cards at the drop point. Several files at once produce several cards. A drop onto a text container inserts at that point in the text. Large copies show progress.
- Pasting behaves the same way: an image on the clipboard becomes an inline image, and files copied in Finder or Explorer become attachments.
- Images dragged from a browser are downloaded into the page folder, never linked.
- Dragging a card or image between pages in the app moves or copies the file between page folders.

### 7.2 Emails from Outlook

Dragging a message out of Outlook does not provide a file path. On Windows, Outlook offers the message through Office-specific clipboard formats (a file descriptor plus a data stream), and on the Mac through a deferred file promise. Chromium exposes neither, so a plain Electron drop target receives nothing. Dragging the message to Explorer first is not a reliable workaround, because Outlook names the file after the subject line and Explorer rejects names that are too long or contain characters such as colons, slashes, or question marks.

The app therefore includes a **native drop helper**, a small platform-specific module that:

- reads the Windows file descriptor and data stream, or the macOS file promise, directly from the drag
- writes the message into the page's attachments folder as a `.msg` or `.eml` file
- names the file itself using the rules in section 7.3, so Outlook's subject-derived name never reaches the file system
- hands the resulting files to the ordinary attachment path, so the rest of the app does not know the drop was special

The same helper also covers Outlook attachments dragged out of an open message and files dragged from other Office applications that use the same formats.

Once in the page folder, an email gets a mail card showing sender, subject, and date read from the file, with the message body indexed for search. The app reads `.eml` directly and `.msg` through a small parsing library. Double-clicking the card opens the message in Outlook or the default mail application.

### 7.3 Filename rules

Every file entering a page folder, whether dropped, pasted, or created by the helper, is renamed by the app before it is written:

- Characters that are invalid on Windows or macOS are replaced, and leading or trailing spaces and dots are removed.
- Names are cut to a fixed length, 100 characters including the extension, with a short hash appended when cutting would cause a collision.
- Emails are named from the date and the subject, for example `2026-09-14 Ridge Road survey quote.msg`.
- The original name as it arrived is kept in the page document's manifest and shown on the card, so nothing the user sees is lost by the rename.
- Folder names for pages, sections, and groups are capped at 60 characters. On Windows the app enables long path support so deeply nested notebooks stay well clear of the legacy 260-character path limit, and Verify Notebook warns when any path approaches that limit for the benefit of older backup tools.

## 8. Storage format

### 8.1 Folder layout

```
Farm records 2026/                    notebook folder
  notebook.json                       notebook id, name, settings, section order
  templates/                          page templates (see section 12)
    Survey page.template/
      page.json
      images/
  .index/                             rebuildable cache, excluded from backup
    search.sqlite
  Site surveys/                       section group
    group.json
    North Field/                      section
      section.json                    color, page order, default template
      Lidar pass.page/                page folder
        page.json                     the page document (source of truth)
        page.html                     rendered copy, opens in any browser
        images/                       inline images
        attachments/                  large files
        .history/                     revision snapshots of page.json
          2026-09-14T09-42-11.json
          2026-09-14T11-05-30.json
```

- Every page folder is self-contained. Nothing outside the folder is needed to open, print, or restore that page.
- Folder names are derived from titles, sanitised for the file system, and made unique with a numeric suffix when needed. Every notebook, group, section, and page also has a permanent random ID stored in its JSON file, so renaming a folder never breaks links or history.
- The page document holds a top-level metadata block (page ID, title, created and modified timestamps, tags, parent page for subpages, paper size, orientation, and margins) followed by a list of canvas objects. Each object records its position and size on the canvas and its content: a text container holds the editor's JSON document model, and images, tables, attachment cards, and drawings hold their own data. An attachment and image manifest with sizes and hashes completes the file.
- Every JSON file carries a format version so later releases can migrate old notebooks.
- **Rendered companion file.** On every save the app also writes `page.html` beside the page document: a self-contained rendering of the note with the same layout and print styling the app uses. It references images by relative path and shows each attachment as a card linking to the file in the attachments folder. Double-clicking it opens the note in any browser, where it can be read and printed without the app. It is derived from `page.json`, never edited directly, and regenerated whenever it is missing or older than the page document. It is written with the same atomic rename as every other file and travels to the NAS with the rest of the page folder.

### 8.2 Write safety

Section 15 covers durability and recovery in full. In brief:

- Every save writes to a temporary file in the same folder and then renames it over the old file. A backup or NAS copy running at the same moment sees either the old file or the new one, never a partial file.
- Attachments and images are written the same way, then verified against their hash before the page document is updated to reference them.
- A notebook holds a lock file while open so that a second instance opens it read-only.

### 8.3 No shared storage

There is no notebook-level attachment store and no deduplication. Two pages with the same file hold two copies. This costs disk space and buys durability: deleting a page can never break another page, and a single page folder restored from backup is complete.

## 9. Printing and PDF export

- Print any page, a selection of pages, a section, a section group, or a whole notebook.
- Page setup: paper size (Letter default, Tabloid 11 x 17, Legal, A4, A3, custom), portrait or landscape, margins, and scale, saved per notebook with a per-page override.
- Only content inside the printable area prints. Print preview dims anything outside it (section 5.2).
- Optional page numbers in the footer. Nothing else prints in the margin bands.
- Print preview before printing.
- Export to PDF using the same layout as paper, as a single file per page or one combined file per section.
- Print CSS keeps tables from splitting rows across pages where possible, repeats table headers on each new page, and prevents images from being cut in half.

## 10. Search

### 10.1 Index

- A SQLite database in the notebook's `.index` folder holds an FTS5 full-text table of page text, page titles, section and group titles, and attachment filenames, plus tables of the notebook tree: every section and group with its name, colour, parent, and order, and every page with its title, section, order, and modification time. The window draws the tree from these tables, in milliseconds at any size, and a folder scan runs in the background after open to correct them. Every change made in the app refreshes only the section or container it touched.
- The index is a cache. It can be deleted at any time and the app rebuilds it from the page files. It is excluded from NAS copies.
- Only the text a reader would see is indexed, not JSON structure or formatting.
- Attached emails contribute sender, subject, and body text to the index. Other attachments contribute their filename and original name only.
- FTS5 prefix indexes for two and three character prefixes are enabled so the first keystrokes are as fast as later ones.

### 10.2 Keeping it current

- Every save in the app updates that page's index entry.
- On opening a notebook, the app compares each page's file modification time against the index and reindexes what changed. This catches edits made outside the app and restores from the NAS. The app does not rely on recursive file watching, which is unreliable at 50,000 folders.
- First indexing of a large notebook runs in a background worker with a progress indicator. Search works on what has been indexed so far.

### 10.3 Performance targets

| Measure | Target |
|---|---|
| Type-ahead query, 50,000 pages | Under 20 ms (measured: 7 ms median) |
| First index of 50,000 pages | Under 5 minutes, in the background (measured: 5 seconds) |
| Startup with an existing index | Under 2 seconds to a usable window (measured: 1.1 seconds; 3.2 seconds on the very first open, which also builds the index) |
| Results returned per query | Top 200 with snippets, more on scroll |

## 11. Revision history

- Every save that changes the page document first copies the previous version into the page's `.history` folder, named by timestamp.
- A history panel lists versions with time and a short summary of what changed. Any version can be previewed side by side with the current page, restored as the current version, or copied to a new page.
- Snapshots contain only the page document. Images and attachments are never modified in place; replacing one writes a new file with a new name and the old file is kept while any snapshot still references it. Any snapshot can therefore be reopened with the images it had at the time.
- Pruning keeps the history from growing without limit: every version for the last day, one per day for the last month, one per week beyond that. The policy is adjustable per notebook and pruning can be disabled.
- Deleted pages move to a per-notebook recycle folder and can be restored for a configurable period before being removed.

## 12. Templates

- Any page can be saved as a template with a name and description. The template is stored in the notebook's templates folder as a copy of the page document and its inline images.
- A template may contain only text, tables, and inline images intended to print with the document. Saving as a template refuses if the page has any files in its attachments folder, naming the files in the message.
- Duplicating a template copies its images into the new page. Every page owns its own copy, so editing or deleting a template never changes pages already made from it.
- New page from template is available in every section's add page menu.
- Each section can set a default template so the plain add page action produces that layout.
- Templates can contain placeholders for the date, section name, notebook name, and page title that are filled in when a page is created from them.
- Templates belong to the notebook and travel with it when the folder is copied. The Templates notebook, reached from the notebook menu, shows every template as an editable page in one section per library; editing a template there changes pages made from it afterwards, and dragging a template between the sections changes which library holds it.
- **Global template library.** A second templates folder, in the user's application data folder by default and relocatable to any path such as a NAS share, uses the identical format. The new page menu lists notebook templates first and global templates beneath them. Save as template asks which library to use. Because both libraries are the same folder layout read by the same code, the global library adds one settings entry and one extra folder to scan, and nothing else.

## 13. Copy and move

- Drag a page onto a section tab to move it. Hold a modifier key while dropping to copy it.
- A Move or Copy dialog from the page's context menu shows a tree of all open notebooks, groups, and sections for targets that are not on screen.
- Move is a folder rename. It is instant and history moves with the page.
- Copy duplicates the whole page folder, including every attachment regardless of size, then assigns a new page ID and starts with empty history. On APFS the copy uses file cloning so it completes instantly and consumes extra space only when a copy is later modified. On other file systems it is a full copy with a progress indicator and a cancel option. In both cases the result is an independent duplicate, never a reference.
- Sections and section groups can be moved and copied the same way.

## 14. Backup and NAS operation

- A notebook is backed up by copying its folder. Any file-level tool works: rsync, Time Machine, Synology Drive, robocopy, or a scheduled copy job. The app does not perform network operations itself.
- The `.index` folder should be excluded from copies. Everything else must be included.
- Because attachments are named files that never change in place, incremental copy tools transfer each one once.
- A notebook restored from the NAS opens directly. The app rebuilds the index on first open. Section 15 covers what happens when individual files are damaged or missing.
- A notebook can be opened read-only straight from a NAS share for reference, but editing is intended to happen on the local disk.
- History pruning is what keeps the file count manageable for backup tools. At 50,000 pages, unlimited history would mean millions of small files.

## 15. Durability and recovery

This section has priority over convenience and performance. The design goal is that no single corrupted or lost file can affect more than one page, that every file the app creates for its own use can be regenerated, and that a notebook remains readable without the app.

### 15.1 Principles

- **Plain files are the only source of truth.** Page content, images, attachments, templates, and history are ordinary files. Nothing the user wrote lives only in a database.
- **Everything the app generates for itself is a cache.** The search index and the tree cache can be deleted at any time and are rebuilt from the files. Their loss costs time, never content.
- **Nothing is modified in place.** Every save writes a new file and renames it over the old one. Images and attachments are written once and never edited. A crash or a backup job running mid-write can only ever see a complete old file or a complete new file.
- **Every page folder stands alone.** No page depends on any other page or on any shared store, so damage to one folder cannot spread.
- **Damage is detected and reported, never hidden.** The app checks what it opens and tells the user what it found and what it did about it.
- **Loss is bounded to one editing session.** Every save first snapshots the previous version, and an autosave draft covers the time between saves.

### 15.2 File classification

| File | Kind | Loss affects | Recovery |
|---|---|---|---|
| Page document (`page.json`) | Source | One page | Latest history snapshot, then autosave draft, then NAS |
| Rendered copy (`page.html`) | Derived, kept | Nothing | Regenerated from `page.json` on next save or by Verify Notebook |
| Inline images and attachments | Source | One object on one page | NAS copy; page shows a missing-file card with expected name, size, and hash |
| History snapshots (`.history/`) | Source, redundant | Older versions of one page | None needed; current page is unaffected |
| Autosave draft (`page.json.autosave`) | Transient | Unsaved edits of one page | None needed after a clean save |
| Section, group, and notebook metadata files | Source, small | Order, colors, names, default template of one level | Regenerated from the folder layout with defaults; only ordering and colors are lost |
| Templates | Source | One template | NAS copy |
| Recycle folder | Source | Deleted pages awaiting purge | NAS copy |
| Search index and tree cache (`.index/`) | Cache | Nothing | Rebuilt automatically |
| Lock file | Transient | Nothing | Removed automatically when stale |
| Application preferences | Cache-like | Window layout, recent notebooks | Defaults |

### 15.3 Write safety

- Every write goes to a temporary file in the same folder, is flushed to disk with fsync, and is then renamed over the target. The folder entry is flushed too, so the rename survives power loss.
- Before the page document is overwritten, the previous version is copied into the history folder. A save is therefore never the only copy of a page's previous state.
- New images and attachments are written and hash-verified before the page document that references them is saved. A crash between the two steps leaves an unreferenced file, which the verification tool reports and can remove, never a reference to a missing file.
- Every page document includes a checksum of its own content. On open, a mismatch is treated as corruption and recovery starts immediately rather than loading damaged data.
- Autosave writes a draft file beside the page document every few seconds while editing. It is deleted on a clean save. If the app finds a draft on open, it offers to restore it and shows the difference from the saved version.
- Format migrations write new files and keep the old ones under a versioned name until the user confirms the notebook opens correctly.

### 15.4 Automatic recovery

- **Corrupt page document.** The app renames the damaged file with a `.corrupt` suffix, restores the newest history snapshot that parses and passes its checksum, opens it, and shows a notice naming the version it recovered. If a newer autosave draft exists it is offered as well. If no snapshot exists, the page opens empty with the notice and the damaged file is kept for manual inspection.
- **Missing or mismatched attachment or image.** The page opens normally. The object is shown as a missing-file card with the expected filename, size, hash, and last known date so the user can find it on the NAS. Nothing else on the page is affected.
- **Missing metadata file.** Section, group, and notebook metadata is regenerated from folder names with default order and colors, and a notice says what was rebuilt.
- **Corrupt or missing search index.** The app runs SQLite's integrity check on open. On any failure it deletes the index and rebuilds it in the background. Search works on what has been indexed so far and shows a progress indicator. A partial rebuild interrupted by a crash is detected by a completion marker and restarted.
- **Stale lock file.** A lock older than the process that created it is removed automatically.
- **Page folder deleted outside the app.** The tree cache notices on the next open and drops the page. Recovery is from the recycle folder if the app deleted it, or from the NAS otherwise.

### 15.5 Verify and repair command

A Verify Notebook command in the File menu walks the whole notebook and reports:

- page documents that fail to parse or fail their checksum
- referenced images or attachments that are missing or have the wrong size
- files present in a page folder that no page references
- metadata files that are missing or invalid
- history folders exceeding the pruning policy
- rendered copies that are missing or older than their page document

A quick check compares names and sizes only and finishes in minutes on a large notebook. A full check also hashes every file and is meant to run overnight on a 500 GB notebook. Every finding has a repair action: restore from history, remove an orphaned file, regenerate metadata, or rebuild the index. Repairs never delete a source file without moving it to the recycle folder first.

### 15.6 Reading a notebook without the app

- Every page folder contains `page.html`, a rendered copy of the note that opens in any browser with images shown in place and attachments linked. It can be read and printed on any machine with no software installed. Changes made in a browser are not written back; editing still requires the app or a text editor on the JSON.
- Page documents are JSON with a documented schema. Images and attachments are ordinary files with their real extensions. A page folder is readable with a text editor and a file browser.
- The app ships a short recovery guide and a standalone command-line script that regenerates `page.html` for a notebook, section, or page folder and can combine pages into a single HTML or PDF file. It uses the same renderer as the app and has no dependency on the search index.
- Exporting a whole notebook to PDF is available as a second, format-independent durable copy for the NAS.

### 15.7 Search index specifics

- The index lives in the notebook's `.index` folder, is excluded from backups, and is stamped with the app's format version. A version mismatch triggers a rebuild rather than an attempt to reuse it.
- SQLite runs in write-ahead logging mode with synchronous writes off, since durability of a cache is not needed and this makes indexing faster.
- A Rebuild Index command is always available in the File menu and never touches any source file.
- If the index cannot be created at all, for example on a read-only volume, the app still opens the notebook with search disabled and a notice, rather than refusing to open.

### 15.8 Recovery procedures for the user

These steps are also shipped as a recovery guide with the app.

1. **Page will not open.** Open the page folder, look in `.history` for the newest snapshot, and copy it over `page.json`. The app does this automatically, so this is only needed if the app itself cannot run.
2. **Search is wrong or slow.** Use Rebuild Index, or delete the `.index` folder while the app is closed.
3. **A file shows as missing.** Read the expected name and size from the missing-file card and copy the file from the NAS into the page's `images` or `attachments` folder.
4. **Section or notebook settings look reset.** A metadata file was rebuilt. Reapply order and colors, or copy the metadata file from the NAS.
5. **Restoring a whole notebook.** Copy the notebook folder from the NAS, open it, and let the index rebuild.
6. **App will not run at all.** Open any page's `page.html` in a browser to read or print it, or use the command-line script to regenerate rendered copies. No content is locked inside the app.

## 16. Scale and performance

Design targets per notebook:

| Measure | Target |
|---|---|
| Pages | 50,000 |
| Total size including attachments | 500 GB |
| Sections in a group, pages in a section | No fixed limit; lists scroll |
| Single attachment | Limited by disk only |
| Rendered copies, 50,000 pages | Under 1 GB in total |

To meet them, the app never lists all page folders to draw the tree, never loads a page until it is opened, indexes in the background, and reads modification times rather than file contents to detect outside changes.

## 17. Security and privacy

- All data stays on the local machine. The app makes no network requests.
- Electron is configured with context isolation, no Node access in the renderer, and a strict content security policy, since it renders user content and embedded files.
- Attachments open through the operating system, so the app never executes attached files itself.

## 18. Development phases

Work proceeds in eight phases. Each phase ends with a working build that can be used for real notes, so the app is usable from phase 2 onward and every later phase adds to a stable base. Durability is built in phase 1, not added later.

### Phase 1: Foundation

Builds: folder format, permanent IDs, atomic writes with fsync, page checksums, history snapshot on every save, autosave drafts, corrupt-page recovery, notebook and section metadata, notebook tree with breadcrumb and section tabs, page list, page open and save, freeform canvas with text containers, basic text formatting and lists.

Done when: a notebook can be created, pages written and saved, the app killed mid-save without losing more than the current edit, and a deliberately corrupted page recovers from history.

### Phase 2: Documents

Builds: tables, images rendered in place, headings, tags, page border and margin guides, page sizes and orientation, snap and alignment aids, print preview, print, PDF export, and the rendered `page.html` companion written on save using the same renderer as print.

Done when: a page with text, a table, and images prints neatly on Letter and Tabloid in both orientations, and the same page opens correctly in a browser from its `page.html`.

### Phase 3: Attachments

Builds: attachment insertion, drag and drop and paste from Finder and Explorer, filename rules, attachment cards, image display modes, mail cards, inline video and PDF preview, integrity checks on open, and the native drop helper for Outlook on Windows and macOS.

Done when: an email dragged straight from Outlook lands on the canvas as a mail card with the correct sender, subject, and date, and a multi-gigabyte file attaches with progress and verifies on reopen.

### Phase 4: Search

Builds: SQLite FTS5 index, tree cache, background initial indexing, modification-time reconciliation on open, type-ahead dropdown with grouped results, scope control, in-page match highlighting, email body indexing, integrity check and automatic rebuild.

Done when: type-ahead returns in under 20 milliseconds on a 50,000 page test notebook and the index rebuilds itself after being deleted or corrupted.

### Phase 5: History and verification

Builds: history panel with preview, restore, and copy to new page, pruning policy, recycle folder, Verify Notebook command with quick and full modes and repair actions, the command-line script for regenerating rendered copies and combining pages to HTML or PDF, and the shipped recovery guide.

Done when: every failure listed in section 15.4 is reproduced deliberately and recovers as described.

### Phase 6: Templates and copy or move

Builds: notebook and global template libraries, save as template with the no-attachments rule, default template per section, placeholders, Move or Copy dialog, drag and drop between sections, section and group move and copy, APFS cloning for copies.

Done when: a page with large attachments copies to another notebook as a fully independent duplicate and a template produces a correctly filled page in any section.

### Phase 7: Scale testing

Builds: a generator for a 50,000 page, 500 GB test notebook, and measurement of every target in sections 10 and 16.

Done when: all targets are met or the design is revised and the results recorded in this document.

### Phase 8: Windows build and packaging

Builds: Windows build, long path support, installers for macOS and Windows, first-run experience, and a final pass through the recovery procedures on both platforms.

Done when: a notebook created on the Mac opens on Windows from a NAS copy with no differences.

How it is checked: `scripts/cross-platform.ts` builds a notebook on one system and records the SHA-256 of every file. On the other system, it confirms that a copy has the same bytes, that each page renders to a byte-identical `page.html`, that a full Verify is clean, and that the installed app opens every page without changing a file. The `platforms` workflow runs it from macOS to Windows and from Windows to macOS on every push.

## 19. Import from OneNote (deferred, reference only)

Decision on 22 September 2026: this feature is not to be developed at this time. The findings below are kept so the work does not need to be repeated if the decision changes.

### 18.1 Feasibility

Importing existing OneNote notebooks is feasible and moderately difficult. The reasons it is tractable:

- Microsoft publishes the file format. The `.one` section file and `.onetoc2` notebook file are documented in the MS-ONESTORE and MS-ONE specifications.
- An open-source Rust parser, `onenote_parser` by Markus Siemens (Mozilla Public License 2.0), reads both the OneNote desktop format used by OneNote 2016, 2019, and LTSC and the packaging used by files downloaded from OneDrive. Version 2.0.0 was released in August 2026 and the project is maintained for bug fixes and compatibility. Its companion tool `one2html` converts a section or whole notebook to HTML with images and embedded files written out as separate files.
- Joplin ships this same parser compiled to WebAssembly as `@joplin/onenote-converter` and uses it inside its Electron app for OneNote import. That proves the parser runs inside the exact kind of application this project is.
- A second, independent reader exists in Python: Aspose.Note FOSS (MIT licence) reads OneNote 2007 and 2010 section files and extracts text with formatting, tables, images, attachments, and tags. It is a useful fallback for older files.

The estimate for a usable importer is two to four weeks of work once the native page format is stable, most of it in mapping converted HTML onto PageBinder pages and testing against real notebooks.

### 18.2 Where the source files come from

- OneNote 2016 stores local notebooks as a folder of `.one` files with an `Open Notebook.onetoc2` file. Notebooks stored in OneDrive can be downloaded from the OneDrive website as a ZIP of the same layout.
- OneNote's File > Export produces a single `.one` section file or a `.onepkg` notebook package. A `.onepkg` is a Microsoft CAB archive and can be unpacked on any platform.
- OneNote 2016 also keeps automatic backups of every section under the user's local application data folder.
- Sections saved by OneNote 2007 use an older format variant. If the Rust parser rejects one, opening and re-saving it in a newer OneNote, or exporting it, produces a current-format file.

### 18.3 Import process

1. The user chooses a notebook folder, a `.onepkg`, or one or more `.one` files.
2. The app runs the bundled converter on each section to produce one HTML file per page plus its images and embedded files.
3. The app maps the result into its own format: notebook folders and section groups from the directory tree, sections from each `.one` file, pages and subpages from the converter's page list, inline images into the page's images folder, embedded files into its attachments folder.
4. Converted HTML is turned into the editor's document model. The converter preserves each container's position and size, so text boxes, tables, and images land in the same places on the canvas.
5. A report lists every page imported and anything that could not be converted.

### 18.4 Expected fidelity

| Content | Expectation |
|---|---|
| Text, formatting, lists, headings | Good |
| Tables | Good |
| Images | Good |
| Embedded files | Good, become attachments |
| Container positions | Good |
| Tags | Good |
| Ink and drawings | Converted to images, which is acceptable since ink is not a focus |
| Links between pages | Partial, needs a second pass to remap to new page IDs |
| Math equations | Converted to text or images |
| Password-protected sections | Not supported, must be unlocked in OneNote first |
| Page history from OneNote | Not imported |

### 18.5 Alternative for highest fidelity

OneNote 2016 on Windows exposes an automation interface that returns each page as XML with every property intact. A small helper script using that interface can export a notebook with better fidelity than file parsing, but it only runs on Windows with OneNote installed. It is worth keeping as an option for a one-time migration, not as a feature of the app.

## 20. Open questions

- None at present.
