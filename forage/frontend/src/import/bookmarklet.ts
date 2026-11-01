// The Forage import bookmarklet (#706), for sites that refuse Forage's own
// fetch. Run on a recipe page, it copies the page's Recipe JSON-LD blocks and
// the page URL to the clipboard as `{"forage":1,"url":…,"blocks":[…]}`, which
// the import sheet's paste box recognises. It is ES5, because it runs in
// whatever browser the page is open in.

export const BOOKMARKLET_SOURCE = `(function () {
  function isRecipe(d) {
    if (!d || typeof d !== 'object') return false;
    if (Object.prototype.toString.call(d) === '[object Array]') {
      for (var i = 0; i < d.length; i++) if (isRecipe(d[i])) return true;
      return false;
    }
    var t = d['@type'];
    if (t === 'Recipe' || (t && typeof t !== 'string' && t.indexOf && t.indexOf('Recipe') !== -1)) return true;
    return isRecipe(d['@graph']);
  }
  var nodes = document.querySelectorAll('script[type="application/ld+json"]');
  var blocks = [];
  for (var i = 0; i < nodes.length; i++) {
    var s = nodes[i].textContent || '';
    var ok = false;
    try { ok = isRecipe(JSON.parse(s)); } catch (e) { ok = /"Recipe"/.test(s); }
    if (ok) blocks.push(s);
  }
  if (!blocks.length) { alert('Forage: no recipe found on this page.'); return; }
  var text = JSON.stringify({ forage: 1, url: location.href, blocks: blocks });
  function done() { alert('Forage: recipe copied. Go back to Forage and paste it.'); }
  function fallback() {
    var a = document.createElement('textarea');
    a.value = text;
    document.body.appendChild(a);
    a.select();
    document.execCommand('copy');
    document.body.removeChild(a);
    done();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
})();`;

/** The bookmark's href. */
export const BOOKMARKLET = `javascript:${encodeURIComponent(BOOKMARKLET_SOURCE.replace(/\n\s*/g, ' '))}`;
