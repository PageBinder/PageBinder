# Uninstalling PageBinder

Your notebooks are ordinary folders that PageBinder never moves. Uninstalling the app leaves every notebook exactly where it is, readable through each page's `page.html` in any browser.

## macOS

1. Quit PageBinder.
2. Drag PageBinder from the Applications folder to the Trash.
3. Optionally remove the app's settings folder, which holds only the recent-notebooks list and the global template library: `~/Library/Application Support/PageBinder`.

## Windows

1. Quit PageBinder.
2. Settings > Apps > Installed apps > PageBinder > Uninstall (on Windows 10: Settings > Apps > Apps & features). This removes the program files and the Start menu and desktop shortcuts.
3. Optionally remove `%APPDATA%\PageBinder`, which holds only the recent-notebooks list and the global template library.

## What is safe to delete inside a notebook

- `.index` at the notebook root is a search cache and can always be deleted.
- `.recycle` holds deleted pages and unused files for 30 days; deleting it removes them for good.
- Everything else is your content.
