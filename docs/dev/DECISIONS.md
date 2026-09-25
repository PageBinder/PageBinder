# Decisions

Choices that should outlive any one session. Add a line when a decision is made (`/handoff` does this); change an entry only when the user changes the decision, and say so. Newest sections last.

## Product (from the program description, September 2026)
- **Local only.** Notebooks are plain folders on the local disk or a NAS, never a cloud service. No encryption.
- **Folder layout is the format.** Notebook > section group > section > page folder (`<title>.page/`). Everything can be copied with ordinary file tools; `.index/` is a rebuildable cache and is excluded from copies.
- **Durability first.** Atomic writes (temporary file, fsync, rename via `renameDurable`), checksummed `page.json`, history snapshots, drafts, recycle bin, and Verify Notebook with repairs. A feature that weakens recoverability needs the user's approval.
- **Freeform pages.** A canvas with a visible page border and margins; objects may sit outside the printable area; a page prints across as many sheets as it needs. Letter is the default paper; Tabloid (11×17) and others, portrait or landscape.
- **`page.html` beside every page.** A rendered copy that opens in any browser without the app.
- **Templates** hold text, tables, and inline pictures only, never attachments; pictures are duplicated, not referenced. Templates appear as a system notebook on the switch screen, one section per notebook plus Global templates.
- **Copies are complete.** Copying a page duplicates its attachments in full. Pages move by copy and paste; there is no page move command.
- **No OneNote import in PageBinder itself.** Researched and deliberately kept out of the core program. A limited-use importer for a modern Microsoft 365 OneNote notebook is being developed separately as a helper app (decided 2026-09-25); it is not a core feature and lives outside this repository's application code.
- **Search** is SQLite FTS5 in `.index/search.sqlite`, type-ahead, sized for 50,000 pages and 500 GB. The notebook tree is served from the index and corrected by a background folder scan.
- **No stylus or ink.** The app is for printable documents with text, tables, pictures, and large attachments.

## Engineering
- **The program name never appears in notebook files**, and image URLs (`pagebinder://`) are built at run time, so a rename never breaks notebooks. (Renamed from DigiNote to PageBinder on 2026-09-24.)
- **The renderer never imports `src/shared/render/renderPage.ts`.** Page HTML is rendered in the main process.
- **Window tests run from `out-e2e/`**, never `out/`, so a running dev watcher cannot overwrite them.
- **Development and installed copies keep separate settings** (`PageBinder Dev` and `PageBinder`). A new installation that finds earlier settings asks Keep or Start fresh, never keeps them silently. `app/scripts/check-package.ts` keeps development data out of every package.
- **Repository layout** (2026-09-25): the program is in `app/`, user documents in `docs/`, developer notes in `docs/dev/`, and only `README.md`, `LICENSE`, and `CLAUDE.md` sit at the root, so the GitHub front page stays short. The packaged app receives the documents from `docs/` as `resources/docs-bundle`.
- **Installers are unsigned** for now: macOS ad-hoc signature, no Windows certificate.

## Repository and workflow
- **The repository is public** under the MIT licence, and commits are authored `PageBinder <4245724+PageBinder@users.noreply.github.com>` with no Co-Authored-By or Claude-Session lines. No personal names, emails, or credentials anywhere in the repository.
- **Git is the shared state** between machines (2026-09-25). Sessions are disposable: start each task in a fresh session, run `/sync` first and `/handoff` last.
- **This Mac is the lead** (2026-09-25). Core, platform-neutral work happens there, on `main`. Other machines and cloud sessions work on short-lived `fix/<platform>-<topic>` branches that are merged back to `main` within the task and then deleted.
- **The macOS and Windows workflow runs on every push** to `main` and `fix/**` (2026-09-25), because Actions minutes are free while the repository is public. If the repository ever becomes private again, return the workflow to start-by-hand first: private Mac minutes count ten times against a 2,000-minute month.
