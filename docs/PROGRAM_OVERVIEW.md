# What PageBinder is

PageBinder is a note-taking program for your desktop, in the style of the classic desktop OneNote. It is made for notes that end up as neat, printable documents: text, tables, and pictures, with any supporting files kept alongside, including large ones such as videos, scans, and long PDFs.

Everything stays on your own computer or your own network drive. PageBinder has no accounts, sends nothing anywhere, and never needs an internet connection.

## How notes are organised

- A **notebook** holds everything on one subject. You can have as many notebooks as you like, anywhere on your disk.
- Inside a notebook, **sections** are the coloured tabs across the top. Related sections can be gathered into a **section group**, which appears as a tab with a folder icon.
- Each section holds **pages**, listed down the right-hand side.

A page is a blank canvas. Click anywhere to start a text box, and place text boxes, tables, pictures, shapes, and attached files wherever you want them. The page grows as far as you place things.

## Pages that print

A page is laid out on sheets of paper from the moment you start. The page border and a dashed line for the margins show what will print, and a page can run over as many sheets as it needs. Anything placed outside the printable area stays on the page but does not print, and print preview shows it dimmed so nothing goes missing unnoticed. A text box that runs past the bottom of a sheet continues at the top of the next sheet's printable area, on screen exactly as on paper; a paragraph never splits across two sheets.

- **Paper.** Letter is the default. Tabloid (11 × 17), Legal, A4, and A3 are available, portrait or landscape, with margin presets. The choice can be made for one page or for the whole notebook, and page numbers can be printed in the footer.
- **Printing.** File > Print Preview shows exactly what will print. Print a page, a section, a section group, or a whole notebook.
- **Export.** File > Export Pages writes any of those as a single PDF or a single HTML file.

## Writing and editing

- **Text.** Fonts, sizes, colours, highlighting, bold, italic, underline, and alignment. Bulleted, numbered, and to-do lists. Tab works as in a word processor: a tab stop in text, indent in lists, next cell in tables.
- **Tables.** Add and remove rows and columns, set row heights and column widths, fill cells with colour, and choose borders for any cell or group of cells, all from the cell's right-click menu. Copying cells from one table into another brings the content and keeps the target table's look.
- **Pictures.** Insert, paste, or drop them onto the page, then move and resize them. Very large pictures, and formats a browser cannot display, appear as a card instead, and a right-click switches between the two.
- **Shapes.** Lines, arrows, rectangles, and ellipses, drawn from the right-click menu, with colour and line weight.
- **Files.** Drop any file onto the page, or use Insert > File Attachment. The file is copied into the page and shown as a card with its name and size. Double-click the card to open the file in its own application. An attached PDF can also be inserted as a printout of its pages, and the text on those pages can then be found by search.
- **Emails.** A saved email (`.eml` or `.msg`) shows its subject, sender, and date on its card, and its text can be searched.
- **Signature.** Insert signature puts your name with the date and time at the cursor.
- **Stacking.** Where objects overlap, right-click any of them and choose Order to bring it to the front, send it to the back, or move it one step forward or back.
- **Undo.** Undo and redo cover typing as well as creating, moving, resizing, and deleting objects and pages.

## Search

Press Cmd+F (Ctrl+F on Windows) and start typing. Results appear as you type, covering page names, section names, page text, attachment names, the text of attached emails, and the text of PDF printouts. Only printouts are searched this way: a PDF or other document that is simply attached is found by its name, not its contents. A scanned PDF has no text to find. Choosing a result opens the page with every match highlighted. Search stays fast even in a notebook of tens of thousands of pages.

## Saving, history, and safety

- **Saving is automatic.** A draft is kept moments after you stop typing, and the page is saved fully when you switch pages, leave the window, or press Cmd+S.
- **Every version is kept.** File > Page History lists earlier versions of a page. Preview any of them, restore one, or copy it to a new page. Older versions are thinned out over time so the history never grows without limit: every version from the last day, one a day for the last month, one a week beyond that.
- **Deleted pages can come back.** File > Recycled Pages holds deleted pages, sections, and groups for 30 days.
- **Damage repairs itself.** Every page is checked when it opens, and a damaged page is restored from its last good version. File > Verify Notebook checks the whole notebook and offers repairs. The Recovery guide in this Help menu explains each case.
- **The same notebook is never opened twice.** A second copy of PageBinder is refused, so two windows cannot overwrite each other's work.

## Templates and copying

- **Templates.** Save any page as a template, for this notebook or for every notebook. Templates hold text, tables, and pictures, but no attached files. The + menu in the page list creates a page from any template, and a section can be given a default template. The Templates entry on the notebook switch screen shows every template as an editable page.
- **Copying pages.** Right-click a page, choose Copy page, then Paste page here in another section's + menu, in this notebook or another. A copy is complete and independent, including every attached file.

## Where your notes live

A notebook is an ordinary folder, and everything inside it is an ordinary file:

- every section and section group is a folder
- every page is a folder ending in `.page`, holding the note itself (`page.json`), a copy you can open in any web browser (`page.html`), and the page's pictures and attached files
- earlier versions of a page are in its `.history` folder

Because of this, a notebook can be copied, backed up, or moved with any tool that copies folders, and it opens on a Mac or a Windows PC without conversion. The `.index` folder inside a notebook is a search cache that PageBinder rebuilds whenever it is missing, so it can be left out of backups. The Getting started guide covers backups and what not to do inside a notebook folder by hand.

## What PageBinder does not do

- No cloud service, accounts, sharing, or collaboration. Nothing leaves your computer.
- No phone, tablet, or web version.
- No encryption. Protect a notebook the way you protect any folder.
- No pen or stylus drawing.
- No import from OneNote.

## Requirements

- macOS 12 (Monterey) or later, on Apple silicon or Intel.
- Windows 10 or 11, 64-bit.
