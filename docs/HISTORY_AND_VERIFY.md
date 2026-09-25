# How page history and Verify Notebook work

## Page history

Every time a page is saved, the previous version of its `page.json` is copied into the page's `.history` folder first, named by the time of the copy. Only then is the new version written. A save therefore never destroys the earlier state, and a crash during a save can only ever leave the old file or the new file, never a half-written one.

Saves happen when you press Cmd+S, switch pages, leave the window, or stop typing for twenty seconds. Between saves, a draft is written every 1.5 seconds and offered for restore if the app did not exit cleanly.

The history panel (File > Page History) lists the versions newest first. Selecting one shows it exactly as it would print, rendered from the snapshot with the page's current pictures. Restore this version makes it the current page; the version being replaced goes into history like any other save. Copy to new page creates a separate page in the same section holding that version, with its pictures and attachments copied.

Snapshots hold only the page document. Pictures and attachments are never modified in place, so any snapshot can be shown with the files it referred to.

Pruning keeps the folder from growing without limit: every version for the last day, one per day for the last month, and one per week beyond that. Pruning runs after each save and is applied per page.

## Verify Notebook

Verify Notebook (File menu) walks every page in the notebook and reports:

- **Damaged page**: `page.json` does not parse or fails its checksum. If any history snapshot is valid, Restore from history renames the damaged file with a `.corrupt-` suffix and copies the newest good snapshot in its place.
- **Missing or damaged file**: a picture or attachment the page refers to is missing or has the wrong size; a full check also compares each file's content hash. There is no automatic repair because the file is not on this machine; the card shows what to copy back from your backup.
- **Unused file**: a file in `images` or `attachments` that no object on the page uses. Show file reveals it, Preview or Open lets you look at it, and Move to recycle folder moves it to `.recycle/orphaned files` inside the notebook. Nothing is deleted.
- **Rendered copy out of date**: `page.html` is missing or older than the page. Regenerate page.html rewrites it.
- **History beyond policy**: more snapshots than the pruning policy keeps. Remove old snapshots prunes them.
- **Leftover temporary file**: a `.tmp-` file from an interrupted write. Remove temp file deletes it; the real file beside it is intact.
- **Rebuilt metadata**: a section, group, or notebook settings file was missing when the notebook opened and was recreated with defaults. Reapply order and colours, or copy the file back from your backup.

Quick mode checks names and sizes and finishes in minutes on a large notebook. Full mode also hashes every file and is meant to run overnight on a very large notebook.

Rebuild search index deletes the search database in `.index` and rebuilds it from the pages. The database is a cache and holds nothing that is not in the page files.
