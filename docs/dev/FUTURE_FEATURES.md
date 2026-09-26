# Potential future features

Ideas kept for later consideration. Nothing here is decided or scheduled: each item needs the user's go-ahead before work starts. When one is built, move it into the version section of `DEVELOPMENT_PLAN.md` and delete it here. Estimates are rough and include tests.

## Searching printouts and attachments

Printout text capture for PDFs with a text layer shipped in 1.1.0: each printout page keeps its PDF page's text, search lists it under **In printouts**, the matching picture is outlined, and `page.html` carries the text invisibly. Plain attachments are never searched. These follow-ups build on it:

1. **Highlight the matching words on a printout picture.** Today search outlines the whole printout page. pdf.js also gives each word's position, so the words could be marked on the picture itself. Needs the word boxes stored with the printout (a larger page file) and a highlight layer over the picture. About 1 to 2 days.
2. **Make older printouts searchable.** Printouts made before 1.1.0 have no stored text. When the source PDF is still attached, a one-time step can read its text and add it to the printout pictures; Verify Notebook is the natural place to offer it. About half a day.
3. **Recognise text in scanned PDFs (OCR).** A scanned PDF has no text layer, so its printout stays unsearchable. Tesseract, running locally as Joplin does, could read the text when the printout is made. Costs: a few seconds per page, a larger download, and imperfect text. Stays entirely on the user's computer. About 2 to 3 days.
4. **Printouts of Word documents.** Insert printout currently accepts PDFs only. A .docx has no fixed page layout, so it must be laid out first, either with a JavaScript renderer (fair, not exact fidelity) or through LibreOffice when the user has it. Text capture comes with it. About 2 to 4 days, and complex documents will not match Word exactly.

## Text flowing around pictures (word wrap)

Options set out on 2026-09-26, awaiting a choice:

1. **Pictures inside a text box.** A picture becomes part of the text: in line with a line of text, or floated left or right with the text wrapping beside it. Moves with its paragraph and prints identically, because the same HTML and CSS lay it out in both places. About 2 to 3 days.
2. **Top and bottom wrap around pictures on the canvas.** Where a text box overlaps a picture, the lines that would cover it skip past it, as at a page break. Reuses the sheet-break mechanism. About 1 to 2 days.
3. **Square wrap around pictures on the canvas.** Text flows down the side of an overlapping picture, as in Word. Needs the picture's shape carved out of each text box it overlaps, in the editor and in page.html alike. About 4 to 6 days, and the hardest to keep identical on screen and paper.

## Gaps noted in the feature comparison

From `docs/PageBinder-feature-comparison.xlsx`, features most other note-taking programs have and PageBinder does not. Listed for consideration only; some may not suit a program built around printable documents.

- **Tags** on pages, with search by tag.
- **Math formulas** in text boxes.
- **Code blocks** with syntax highlighting.
- **Markdown export** of pages, sections, and notebooks.
- **Markdown import** of files and folders.
