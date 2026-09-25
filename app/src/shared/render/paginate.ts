/**
 * Script embedded in page.html. It measures the rendered canvas, pushes any
 * block that would straddle a sheet boundary down to the next sheet, then
 * builds one clipped sheet per page of paper for viewing and printing.
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

  function bandTop(i) { return i * H + mt; }
  function bandBottom(i) { return (i + 1) * H - mb; }
  function sheetOf(y) { return Math.max(0, Math.floor(y / H)); }
  var canvasTop = source.getBoundingClientRect().top;

  // Push blocks that straddle a sheet boundary onto the next sheet.
  var blocks = source.querySelectorAll('.tiptap > *, .tiptap li, .tiptap table, .tiptap blockquote > *');
  var guard = 0;
  for (var k = 0; k < blocks.length && guard < 10000; k++, guard++) {
    var el = blocks[k];
    if (el.querySelector && el.querySelector('table') && el.tagName !== 'TABLE') continue;
    var r = el.getBoundingClientRect();
    var top = r.top - canvasTop, bottom = r.bottom - canvasTop, h = r.height;
    if (h <= 0 || h > printableH) continue;
    var i = sheetOf(top);
    if (top < bandTop(i)) { el.style.marginTop = (parseFloat(getComputedStyle(el).marginTop) || 0) + (bandTop(i) - top) + 'px'; continue; }
    if (bottom > bandBottom(i)) {
      var shift = bandTop(i + 1) - top;
      el.style.marginTop = (parseFloat(getComputedStyle(el).marginTop) || 0) + shift + 'px';
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
