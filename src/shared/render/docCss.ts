/**
 * Styles for document content. Injected into the app and embedded in
 * page.html so the canvas and the printed page look the same.
 */
export const DOC_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

export const docCss = `
.tiptap { outline: none; min-height: 1.5em; line-height: 1.5; font-size: 14px; font-family: ${DOC_FONT}; color: #2c2c2a; word-wrap: break-word; white-space: pre-wrap; tab-size: 48px; -moz-tab-size: 48px; }
.tiptap > * + * { margin-top: 0.5em; }
.tiptap p { margin: 0; min-height: 1.5em; }
.tiptap h1 { font-size: 22px; margin: 0; font-weight: 600; }
.tiptap h2 { font-size: 18px; margin: 0; font-weight: 600; }
.tiptap h3 { font-size: 15px; margin: 0; font-weight: 600; }
.tiptap ul, .tiptap ol { padding-left: 22px; margin: 0; }
.tiptap li > p { margin: 0; }
.tiptap li + li { margin-top: 2px; }
.tiptap blockquote { border-left: 3px solid #b9b7af; margin: 0; padding-left: 10px; color: #5f5e5a; }
.tiptap pre { background: #f8f7f4; border: 1px solid #d9d7d0; border-radius: 4px; padding: 8px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; margin: 0; white-space: pre-wrap; }
.tiptap code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; background: #f8f7f4; padding: 1px 3px; border-radius: 3px; }
.tiptap hr { border: none; border-top: 1px solid #d9d7d0; margin: 8px 0; }
.tiptap a { color: #185fa5; }
.tiptap s { text-decoration: line-through; }

.tiptap table { border-collapse: collapse; table-layout: fixed; width: 100%; margin: 0; overflow: hidden; }
.tiptap table td, .tiptap table th { border: 1px solid #b9b7af; padding: 2px 8px; vertical-align: top; position: relative; min-width: 1em; box-sizing: border-box; }
.tiptap table tr[data-height] > td, .tiptap table tr[data-height] > th { padding-top: 0; padding-bottom: 0; overflow: hidden; }
.tiptap table tr[data-height] p { min-height: 0; line-height: 1.15; }
.tiptap table th { font-weight: 600; text-align: left; }
.tiptap table p { margin: 0; min-height: 1.5em; }
.tiptap .selectedCell::after { content: ''; position: absolute; inset: 0; background: rgba(55, 138, 221, 0.15); pointer-events: none; }
.tiptap .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: #378add; pointer-events: none; }
.tiptap .tableWrapper { overflow-x: visible; }

.tiptap ul[data-type="taskList"] { list-style: none; padding-left: 2px; }
.tiptap ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 6px; }
.tiptap ul[data-type="taskList"] li > label { flex: 0 0 auto; margin-top: 3px; }
.tiptap ul[data-type="taskList"] li > div { flex: 1 1 auto; }
.tiptap ul[data-type="taskList"] input[type="checkbox"] { margin: 0; width: 14px; height: 14px; }

/* Canvas objects share their box metrics between the app and page.html. */
.text-container { position: absolute; border: 1px solid transparent; border-radius: 4px; box-sizing: border-box; }
.text-container .editor { padding: 12px 10px 8px; }
.image-object { position: absolute; box-sizing: border-box; }
.image-object img { display: block; width: 100%; height: 100%; object-fit: fill; }
.file-card { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: 8px 12px; border: 1px solid #d9d7d0; border-radius: 6px; background: #f8f7f4; font-family: ${DOC_FONT}; font-size: 13px; color: #2c2c2a; text-decoration: none; }
.file-card.missing { border-color: #e24b4a; background: #fcebeb; }
.file-card .file-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.file-card .file-icon { flex: 0 0 auto; width: 30px; height: 36px; border: 1.5px solid #8a8983; border-radius: 3px; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: #5f5e5a; letter-spacing: 0.02em; }
.file-card .file-icon.mail::before { content: '\\2709'; font-size: 17px; font-weight: 400; }
.file-card .file-icon.video::before { content: '\\25B6'; font-size: 13px; }
.file-card .file-icon.image::before { content: '\\25A3'; font-size: 15px; font-weight: 400; }
.file-card .file-ext { display: block; }
.file-card .file-name { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-card .file-sub { display: block; color: #5f5e5a; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-card .file-meta { display: block; color: #8a8983; font-size: 11px; }
.file-card video { display: block; width: 100%; border-radius: 4px; background: #000; }
.shape-object { position: absolute; box-sizing: border-box; }
.shape-object .shape-body, .shape-object svg { display: block; overflow: visible; }
.page-number { position: absolute; font-family: ${DOC_FONT}; font-size: 10px; color: #8a8983; text-align: right; }
.file-card .file-icon { width: 28px; height: 34px; border: 1.5px solid #8a8983; border-radius: 3px; position: relative; flex: 0 0 auto; background: #fff; }
.file-card .file-icon::after { content: ''; position: absolute; right: -1.5px; top: -1.5px; width: 9px; height: 9px; background: #f8f7f4; border-left: 1.5px solid #8a8983; border-bottom: 1.5px solid #8a8983; }
.file-card .file-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-card .file-meta { color: #8a8983; font-size: 11px; }
`
