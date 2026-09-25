# PageBinder recovery guide

Everything you wrote is stored as plain files inside the notebook folder. Nothing is locked inside the app, and nothing depends on an online service. This guide covers what to do when something goes wrong.

## What is in a notebook folder

```
My notebook/
  notebook.json          name, order of sections, paper and history settings
  Section name/
    section.json         name, colour, page order
    Page name.page/
      page.json          the note itself (source of truth)
      page.html          rendered copy: opens in any browser
      images/            pictures on the page
      attachments/       files attached to the page
      .history/          earlier versions of page.json, one per save
  .index/                search index: a cache, safe to delete
  .recycle/              deleted pages, kept for 30 days
  templates/             page templates
```

## A page will not open, or looks wrong

PageBinder does this automatically: a damaged `page.json` is renamed with a `.corrupt-<time>` suffix and the newest good version from `.history` takes its place. You see a notice on the page saying which version was restored.

If the app itself cannot run:

1. Open the page folder in Finder or Explorer.
2. Open `.history` (a hidden folder: press Cmd+Shift+. in Finder to show hidden files).
3. Copy the newest file whose date looks right over `page.json`.

To read or print a page without the app, double-click `page.html`.

## Unsaved changes after a crash

Reopen the page. If a draft newer than the saved page exists, a blue bar offers Restore or Discard.

## Search is wrong, slow, or missing results

File > Verify Notebook > Rebuild search index. Or, with the app closed, delete the `.index` folder. The index is rebuilt from the pages on the next open.

## A picture or attachment shows as missing

The card shows the expected file name and size. Copy the file from your backup into the page's `images` or `attachments` folder and reopen the page.

## I deleted a page by mistake

File > Recycled Pages, then Restore. Deleted pages are kept for 30 days.

## I want an earlier version of a page

File > Page History. Pick a version to preview it, then Restore this version or Copy to new page. The current version is kept in history when you restore.

## Section or notebook settings look reset

A metadata file was missing and was rebuilt with defaults. Reapply order and colours, or copy `section.json` or `notebook.json` from your backup.

## Checking a whole notebook

File > Verify Notebook. Quick checks names and sizes; Full also verifies every file's content hash. Every finding has a Repair button. Repairs never delete a source file: unused files go to `.recycle/orphaned files`, and damaged pages are restored from history with the damaged file kept beside them.

## Restoring a whole notebook from the NAS

Copy the notebook folder back. Open it. The search index rebuilds in the background. Skip `.index` and `.lock` when copying to or from the NAS; everything else must be included. A notebook made on a Mac opens on Windows and the other way round, with no conversion: the files are identical on both. A `.lock` left in a copy from another computer is ignored and replaced.

## Reading everything without the app

```
npx tsx scripts/pagebinder-export.ts "/path/to/My notebook" --combine notebook.html
```

regenerates every `page.html` and writes one HTML file holding all pages in order. Add `--pdf notebook.pdf` for a single PDF.
