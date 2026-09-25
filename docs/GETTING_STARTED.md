# Getting started

## Installing

- **macOS**: open `PageBinder-<version>-arm64.dmg` (Apple Silicon) or `-x64.dmg` (Intel) and drag PageBinder to Applications. The app is not yet signed with an Apple Developer ID, so the first time, right-click PageBinder in Applications and choose Open, then Open again.
- **Windows**: run `PageBinder-Setup-<version>.exe`. It installs for the current user without administrator rights unless you choose all users, and adds Start menu and desktop shortcuts. The installer is not yet code-signed, so Windows SmartScreen may say it protected your PC: choose More info, then Run anyway.

The first time PageBinder starts, the Welcome screen has a short Getting started note. Create notebook suggests your Documents folder.

PageBinder keeps notes the way classic desktop OneNote did: notebooks, section groups, sections, and pages, all stored as ordinary folders and files on your own disk. Nothing is sent anywhere.

## The first five minutes

1. **Create a notebook.** File > New Notebook, choose a folder to hold it, and give it a name. A notebook is a folder; you can put it anywhere, including a folder that another program backs up.
2. **Add a section.** Click + in the tab row. Sections are the coloured tabs. Right-click a tab to rename it, change its colour, or make a section group to keep related sections together.
3. **Add a page.** Click + in the page list on the right and type a name. Pages are listed by name; double-click a name to rename it later.
4. **Write.** Click anywhere on the page to start a text box, then type. The toolbar has fonts, sizes, colours, alignment, lists, and tables. Drag a text box by the bar along its top edge. Escape selects the box so Delete removes it.
5. **Add pictures and files.** Drop a picture or any file onto the page, paste one, or use Insert > Picture or Insert > File Attachment. Pictures show on the page; other files show as cards that open in their own application.

Everything is saved for you: a draft moments after you stop typing, and a full save when you switch pages, leave the window, or press Cmd+S.

## Printing and sharing

Pages are laid out on sheets of paper from the start. The dashed lines are the printable area; page numbers appear where they will print. File > Page Setup chooses the paper size and orientation for a page or the whole notebook. File > Print Preview shows exactly what will print, and File > Export Pages writes a page, a section, a group, or the whole notebook as one PDF or one HTML file.

## Where your notebooks are on disk

A notebook is a folder with the name you gave it, in the location you chose when creating it. Help > About PageBinder shows the app's own folders; your notebooks are wherever you put them, and File > Open Notebook shows recent ones.

Inside a notebook, every section is a folder, every section group is a folder of sections, and every page is a folder ending in `.page` holding:

- `page.json`, the note itself
- `page.html`, a copy you can open in any browser
- `images` and `attachments`, the files on the page
- `.history`, earlier versions of the page

You might open a notebook folder without the app to:

- copy an attachment out, or check what a page holds, from a machine without PageBinder
- read or print a page by double-clicking its `page.html`
- recover a page after a problem, following the Recovery guide in the Help menu
- confirm your backup is complete by comparing folders

## What not to do inside a notebook folder

- **Do not rename or move the `.page`, section, or group folders by hand while the notebook is open in PageBinder.** Do it in the app, or close the notebook first. The app renames folders itself when you rename pages and sections.
- **Do not edit `page.json` by hand** unless you are following the Recovery guide. It carries a checksum; a hand edit will be treated as damage and the last good version will be restored instead.
- **Do not put your own files loose inside a page folder.** Use Insert > File Attachment so the page knows about them. Loose files are reported as unused by Verify Notebook.
- **Do not open the same notebook in two copies of PageBinder at once.** The second one is refused, on purpose.
- **Do not let a sync tool write into a notebook that is open.** Sync in one direction only, from the notebook to the backup. Two-way sync into an open notebook can undo saves.
- The `.index` folder is a search cache and can be deleted at any time. `.recycle` holds deleted pages for 30 days. Everything else is your content.

## Backing up

A backup is a copy of the notebook folder. Any tool that copies folders works. Exclude `.index` (a search cache) and `.lock` (marks the notebook as open), include everything else, and prefer a schedule that runs when you are not editing.

- **macOS, Time Machine**: keep notebooks anywhere under your home folder and Time Machine backs them up hourly to an external drive or a network share. Add `.index` to its exclusion list in System Settings > General > Time Machine > Options.
- **Windows, File History**: keep notebooks under Documents or add their folder in Settings > Update & Security > Backup, pointed at an external or network drive.
- **Network drive (NAS) with a scheduled copy**: on macOS, a scheduled `rsync -a --delete --exclude .index --exclude .lock` job; on Windows, `robocopy "C:\Notebooks" "\\nas\Notebooks" /MIR /XD .index /XF .lock`, run by Task Scheduler. A Synology or QNAP NAS can run its own sync client for the same purpose.
- **Cloud drives** such as iCloud Drive, Google Drive, OneDrive, or Dropbox work as a backup destination when they sync from a separate copy, not from the live notebook folder. Point them at a backup copy made by one of the methods above rather than keeping the notebook itself inside their synced folder.
- **Third-party backup software** such as Backblaze, Carbon Copy Cloner, Arq, or Macrium Reflect can back up the notebook folder like any other folder.

Whatever you use, test it once: restore a notebook from the backup to a new location, open it in PageBinder, and check a page or two.

## Finding things

Cmd+F searches page names, section names, page text, attachment names, and the text of attached emails as you type. Choosing a result opens the page and highlights every match. The search index rebuilds itself if it is ever missing.

## When something goes wrong

File > Page History shows every saved version of a page and lets you restore one. File > Recycled Pages holds deleted pages, sections, and groups for 30 days. File > Verify Notebook checks the whole notebook and offers repairs. The Recovery guide in the Help menu covers each case.
