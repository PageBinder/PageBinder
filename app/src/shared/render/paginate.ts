/**
 * Script embedded in page.html. It measures the rendered canvas, moves any line
 * of text that would straddle a sheet boundary down to the next sheet (splitting
 * the paragraph there), then builds one clipped sheet per page of paper for
 * viewing and printing.
 *
 * Kept as a string so the same code ships inside every page.html.
 */
export const paginateScript = `
(function () {
  var body = document.body;
  var W = +body.dataset.paperW, H = +body.dataset.paperH;
  var mt = +body.dataset.mt, mr = +body.dataset.mr, mb = +body.dataset.mb, ml = +body.dataset.ml;
  var printableH = H - mt - mb;
  var source = document.getElementById('canvas');
  if (!source) return;
  source.style.width = W + 'px';

  // Sheet breaks, line by line. Keep this in step with app/src/renderer/src/sheetBreaks.ts, which
  // applies the same rule in the editor so the screen matches the paper.
  //  - A line of text that would cross the bottom of a sheet's printable area, or that starts in a
  //    sheet's top margin, moves to the top of the next printable area. The paragraph splits there:
  //    a spacer is inserted before that line.
  //  - When it is a block's first line, the whole block moves instead (with its bullet or checkbox).
  //  - Tables, rules, and empty paragraphs move whole; a table taller than a page is left as it is.
  var EPS = 0.5;
  function bandTop(i) { return i * H + mt; }
  function bandBottom(i) { return (i + 1) * H - mb; }
  function sheetOf(y) { return Math.max(0, Math.floor(y / H)); }
  // Measured again before every decision, in case adding space moved the page on screen.
  var canvasTop = source.getBoundingClientRect().top;
  function remeasure() { canvasTop = source.getBoundingClientRect().top; }
  function y(v) { return v - canvasTop; }
  var CANDIDATES = 'p, h1, h2, h3, h4, h5, h6, pre, hr, table';
  var TEXTBLOCK = /^(P|H[1-6]|PRE)$/;

  // The lines of a text block: where each starts, and the top and bottom of its characters.
  function linesOf(block) {
    var out = [], prev = null, cur = null, range = document.createRange();
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      var text = n.data;
      for (var k = 0; k < text.length; k++) {
        var c = text.charAt(k);
        if (c === '\\n' || c === '\\r') continue;
        range.setStart(n, k);
        range.setEnd(n, k + 1);
        var r = range.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (!prev || r.left < prev.left - EPS || r.top >= prev.bottom - EPS) {
          cur = { node: n, offset: k, top: y(r.top), bottom: y(r.bottom) };
          out.push(cur);
        } else {
          cur.top = Math.min(cur.top, y(r.top));
          cur.bottom = Math.max(cur.bottom, y(r.bottom));
        }
        prev = r;
      }
    }
    return out;
  }

  // What moves when a block's first line moves: the list item or quote it opens, if any.
  function pushTarget(el) {
    var t = el;
    for (;;) {
      var p = t.parentElement;
      if (!p || p.classList.contains('tiptap')) return t;
      var first = p.firstElementChild;
      if (p.tagName === 'LI') {
        if (first === t || (first && first.tagName === 'LABEL' && first.nextElementSibling === t)) { t = p; continue; }
        return t;
      }
      if ((p.tagName === 'BLOCKQUOTE' || (p.tagName === 'DIV' && p.parentElement && p.parentElement.tagName === 'LI')) && first === t) { t = p; continue; }
      return t;
    }
  }

  function pushBlock(el, dest) {
    var t = pushTarget(el);
    var shift = dest - y(t.getBoundingClientRect().top);
    if (shift <= EPS) return false;
    t.style.marginTop = ((parseFloat(getComputedStyle(t).marginTop) || 0) + shift) + 'px';
    t.setAttribute('data-sheet-break', '');
    return true;
  }

  function splitBefore(line, dest) {
    var spacer = document.createElement('span');
    spacer.setAttribute('data-sheet-spacer', '');
    spacer.style.display = 'block';
    spacer.style.height = '0px';
    var r = document.createRange();
    r.setStart(line.node, line.offset);
    r.collapse(true);
    r.insertNode(spacer);
    remeasure();
    var h = dest - y(spacer.getBoundingClientRect().top);
    if (h <= EPS) { spacer.parentNode.removeChild(spacer); return false; }
    spacer.style.height = h + 'px';
    return true;
  }

  // One change to a block, or false when it needs none.
  function step(el) {
    remeasure();
    var rect = el.getBoundingClientRect();
    if (rect.height <= 0) return false;
    var top = y(rect.top), bottom = y(rect.bottom), i = sheetOf(top);
    if (top >= bandTop(i) - EPS && bottom <= bandBottom(i) + EPS) return false;
    var ls = TEXTBLOCK.test(el.tagName) ? linesOf(el) : [];
    if (!ls.length) {
      if (el.tagName === 'TABLE' && rect.height > printableH) return false;
      return pushBlock(el, top < bandTop(i) - EPS ? bandTop(i) : bandTop(i + 1));
    }
    for (var k = 0; k < ls.length; k++) {
      var L = ls[k], j = sheetOf(L.top), dest = -1;
      if (L.top < bandTop(j) - EPS) dest = bandTop(j);
      else if (L.bottom > bandBottom(j) + EPS) dest = bandTop(j + 1);
      if (dest < 0) continue;
      if (k === 0 ? pushBlock(el, dest) : splitBefore(L, dest)) return true;
    }
    return false;
  }

  var roots = source.querySelectorAll('.tiptap');
  for (var q = 0; q < roots.length; q++) {
    var blocks = roots[q].querySelectorAll(CANDIDATES);
    for (var b = 0; b < blocks.length; b++) {
      var el = blocks[b];
      // Text inside a table moves with its table.
      if (el.parentElement && el.parentElement.closest('td, th')) continue;
      for (var tries = 0; tries < 400 && step(el); tries++) {}
    }
  }

  // Content extent after pushing.
  var objs = source.children, maxBottom = 0;
  for (var j = 0; j < objs.length; j++) {
    var o = objs[j].getBoundingClientRect();
    maxBottom = Math.max(maxBottom, o.bottom - canvasTop);
  }
  var sheets = Math.max(1, Math.ceil((maxBottom + mb) / H));
  body.dataset.sheets = String(sheets);

  var host = document.getElementById('sheets');
  var showNums = body.dataset.footerNums === '1';
  for (var s = 0; s < sheets; s++) {
    var sheet = document.createElement('section');
    sheet.className = 'sheet';
    sheet.style.width = W + 'px'; sheet.style.height = H + 'px';
    var clip = document.createElement('div');
    clip.className = 'clip';
    clip.style.left = ml + 'px'; clip.style.top = mt + 'px';
    clip.style.width = (W - ml - mr) + 'px'; clip.style.height = printableH + 'px';
    var copy = source.cloneNode(true);
    copy.removeAttribute('id');
    copy.style.transform = 'translate(' + (-ml) + 'px,' + (-(s * H + mt)) + 'px)';
    clip.appendChild(copy);
    sheet.appendChild(clip);
    if (showNums) {
      var foot = document.createElement('div');
      foot.className = 'band footer';
      foot.style.left = ml + 'px'; foot.style.width = (W - ml - mr) + 'px'; foot.style.height = mb + 'px'; foot.style.top = (H - mb) + 'px';
      foot.textContent = 'Page ' + (s + 1) + ' of ' + sheets;
      sheet.appendChild(foot);
    }
    host.appendChild(sheet);
  }
  source.parentNode.style.display = 'none';
  body.classList.remove('unpaginated');
  body.classList.add('paginated');
})();
`
