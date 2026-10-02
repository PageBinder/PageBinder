# Potential future features

Ideas kept for later consideration. Nothing here is decided or scheduled: each item needs the user's go-ahead before work starts. When one is built, move it into the version section of `DEVELOPMENT_PLAN.md` and delete it here. Estimates are rough and include tests.

## Searching printouts and attachments

Printout text capture for PDFs with a text layer shipped in 1.1.0: each printout page keeps its PDF page's text, search lists it under **In printouts**, the matching picture is outlined, and `page.html` carries the text invisibly. Plain attachments are never searched. These follow-ups build on it:

1. **Highlight the matching words on a printout picture.** Today search outlines the whole printout page. pdf.js also gives each word's position, so the words could be marked on the picture itself. Needs the word boxes stored with the printout (a larger page file) and a highlight layer over the picture. About 1 to 2 days.
2. **Make older printouts searchable.** Printouts made before 1.1.0 have no stored text. When the source PDF is still attached, a one-time step can read its text and add it to the printout pictures; Verify Notebook is the natural place to offer it. About half a day.
3. **Recognise text in scanned PDFs (OCR).** A scanned PDF has no text layer, so its printout stays unsearchable. Tesseract, running locally as Joplin does, could read the text when the printout is made. Costs: a few seconds per page, a larger download, and imperfect text. Stays entirely on the user's computer. About 2 to 3 days.
4. **Printouts of Word documents.** Insert printout currently accepts PDFs only. A .docx has no fixed page layout, so it must be laid out first, either with a JavaScript renderer (fair, not exact fidelity) or through LibreOffice when the user has it. Text capture comes with it. About 2 to 4 days, and complex documents will not match Word exactly.

## Text flowing around pictures (word wrap)

Pictures anchored in text boxes, with text flowing beside them, were built on 2026-09-28 after the user's testing of a first, in-line version, and moving pictures between the page and a text box by cut and paste in 1.1.2. Text on both sides of a picture, and text wrapping around pictures placed on the page, were considered and dropped by the user on 2026-09-30.

## Protecting pages from older versions

- **An older version must not erase content it does not understand** (noted 2026-09-28). Anchored pictures are an optional list that versions 1.1.1 and earlier simply ignore: those versions show the text without its pictures and, if the page is saved there, drop the list. Content types they do not know at all (the in-line pictures made while testing) are worse: their editor (TipTap 3.31) shows the text box empty, and typing in it there replaces its stored text. From now on, a version meeting unknown content could show the text box read-only with a note to update, and never save over it. Versions already published cannot be changed, so until the next version is installed everywhere, pages with pictures in text should be edited only in the newest version. About 1 day.

## Editing

- **Document-wide undo** (suggested 2026-09-27). Today undo follows keyboard focus: with the cursor in a text box, Cmd+Z undoes that box's typing and formatting; anywhere else it undoes page actions (creating, moving, deleting objects, page operations). Word and OneNote keep one undo list for the whole document, so Cmd+Z always reverses the most recent change wherever the user last clicked. PageBinder could do the same by keeping one ordered list of undoable steps, where a text step points to the text box whose own history holds it: undo then takes the latest step of either kind, putting the cursor back in that box when it is a text step. Open questions: whether text steps should survive switching pages (each text box's history is lost when its page closes today) and how redo interleaves. Layout and storage are unaffected, so it raises no compatibility concern. About 2 to 3 days.

## Sharing and export

Reworked 2026-09-29 at the user's request, to replace today's separate commands with one consistent set. On 2026-10-01 the user chose to keep the existing dialog and menus for now; only the HTML option changed, into the web-page package described under 2 below (built in 1.1.3). The rest stays for consideration.

**Today.** The File menu has *Export This Page as PDF…* (the open page, straight to a file) and *Export Pages…* (Cmd+Shift+E: a dialog choosing this page, its section, its group, or the whole notebook, as one PDF or one HTML file). Print (Cmd+P) can also save a PDF through the system dialog. The PDF is self-contained but carries attachments only as cards. The HTML export links to pictures and attachments in the notebook, by relative paths when saved inside the notebook and by absolute paths on this computer otherwise, so it breaks when sent to anyone else. Each page's own `page.html` backup shows only what prints.

**Proposal: one Export dialog, two kinds of output.**

- **One command, in the File menu only.** File > *Export…* (Cmd+Shift+E) replaces both menu items. No right-click entry (the user's choice, 2026-09-29). The dialog chooses:
  - *What*: this page (the default), this section, this group, or the whole notebook, as today.
  - *As*:
    1. **PDF: the pages as printed.** One PDF, each page on its own sheets with its own paper size, as now. Self-contained. Attachments stay as cards.
    2. **Web page (zip).** Viewable in any browser without PageBinder: the HTML with its pictures and attachments inside the zip, linked by relative paths, so after unzipping, double-clicking the HTML shows the page and each attachment card opens its file (PDFs and pictures in a tab; other files saved to Downloads, as browsers do). For more than one page: an `index.html` listing the pages in notebook order, with one HTML file per page. On screen it shows the whole canvas, as each page's `page.html` backup does since 1.1.2; printed, it matches PageBinder's printout.
  - The dialog always opens on PDF; it does not remember the last format used (decided with the user, 2026-09-29). File names follow the page, section, or notebook name.
- **Clean output.** No PageBinder internals in any export (`page.json`, history, drafts, the index), and nothing that names the program.
- **Share after saving.** After writing the file, offer *Show in Finder* / *Show in Explorer*, and on macOS the system Share menu (Mail, Messages, AirDrop), which Electron supports there. Windows has no equivalent that Electron can open, so Show in Explorer only.
- **What goes away.** *Export This Page as PDF…* (now Export with "this page" and PDF chosen) and the linked-HTML export, which only works on this computer. Printing, Print Preview, and the system dialog's Save as PDF stay as they are.
- **Settling before building** (the user has no answers yet, 2026-09-29). Whether the zip for a whole notebook should keep the section folders; what happens with very large attachments (a size warning); and whether to add Markdown later (it is listed under the comparison gaps below).
- **Compatibility.** Exports only read the notebook; nothing in the notebook changes. A small pure-JavaScript zip library (for example `fflate`) would be a new dependency. About 2 to 3 days in all.


## Page breaks

- **Split tall tables between rows.** A table that fits on a sheet moves whole to the next sheet, but one taller than a sheet runs through the margins at the page break. Splitting it between rows, perhaps repeating a header row, would complete line-by-line page breaks. About 1 to 2 days.
- **Widow and orphan control.** Word keeps at least two lines of a paragraph together at a page break. Line-by-line breaks currently allow a single line on either side. Small once wanted.
- **A truly infinite canvas when the page border is off; border and grid set per page** (suggested by the user; first recorded 2026-10-01). Two parts:
  1. *No gaps between sheets.* Today View > Toggle Page Border only hides the paper outlines: the editor still pushes text that crosses a sheet boundary down past the bottom and top margins (`sheetBreaks.ts`), so blank gaps stay between the printable areas. With the border off, the editor would skip those sheet breaks and let text run on continuously, so the canvas looks like one endless page. Printing, Print Preview, and PDF export still break the text line by line at each sheet, as now (the print layout is untouched), so with the border off the screen no longer shows where the paper breaks will fall.
  2. *Stored with each page.* The border setting moves from a View-menu switch for the whole app to a setting of each page, saved in `page.json` as a new optional field (for example `pageBorder: false`); pages without the field keep the border, as every page from earlier versions does. View > Toggle Page Border then changes only the page that is open, and other pages keep their own setting. Could also apply to the page's HTML backup copy's screen view.
  - Decided with the user (2026-10-01): new pages start with the border on; a template carries its border setting to the pages made from it; the page grid (View > Toggle Grid) is also stored with each page (for example `pageGrid: true`), off by default and for pages from earlier versions, and carried by templates the same way. A new optional field, so no compatibility concern; older versions ignore it and show the border. About 1 day.

## Gaps noted in the feature comparison

From `docs/PageBinder-feature-comparison.xlsx`, features most other note-taking programs have and PageBinder does not. Listed for consideration only; some may not suit a program built around printable documents.

- **Tags** on pages, with search by tag.
- **Math formulas** in text boxes.
- **Code blocks** with syntax highlighting.
- **Markdown export** of pages, sections, and notebooks.
- **Markdown import** of files and folders.
