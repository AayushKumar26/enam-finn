/* FINN web search — free, no key, no AI quota: Google News RSS for news, DuckDuckGo for the open web.
   Runs through the app's native HTTP bridge (these sites don't allow browser cross-site requests). */
(function (FINN) {
  'use strict';

  function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

  async function news(q, max) {
    const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-IN&gl=IN&ceid=IN:en';
    const xml = await FINN.http('GET', url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' }, timeout: 12000 });
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return Array.from(doc.querySelectorAll('item')).slice(0, max || 6).map((it) => {
      const src = it.querySelector('source');
      let title = txt(it.querySelector('title'));
      const publisher = txt(src);
      if (publisher && title.endsWith(' - ' + publisher)) title = title.slice(0, -(publisher.length + 3));
      return { title, uri: txt(it.querySelector('link')), publisher, date: Date.parse(txt(it.querySelector('pubDate'))) || null, snippet: '', kind: 'news' };
    }).filter((r) => r.title && r.uri);
  }

  async function web(q, max) {
    const html = await FINN.http('GET', 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q) + '&kl=in-en', { headers: { Accept: 'text/html' }, timeout: 12000 });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('.result')).map((r) => {
      const a = r.querySelector('a.result__a');
      if (!a) return null;
      let href = a.getAttribute('href') || '';
      const m = href.match(/[?&]uddg=([^&]+)/);
      if (m) href = decodeURIComponent(m[1]);
      if (href.indexOf('//') === 0) href = 'https:' + href;
      if (!/^https?:/.test(href) || /duckduckgo\.com\/y\.js/.test(href)) return null;
      return { title: txt(a), uri: href, snippet: txt(r.querySelector('.result__snippet')), publisher: '', date: null, kind: 'web' };
    }).filter(Boolean).slice(0, max || 5);
  }

  // Search for a question. Portfolio-wide news questions fan out per holding (newest first).
  async function forQuestion(question, ctx) {
    const q = String(question);
    const wantsNews = /news|today|latest|this week|recent|why .*(move|up|down|fall|rise|jump|drop)|happen|announce|event|update/i.test(q);
    const out = [];
    const tasks = [];
    const nameOf = (sym) => { const c = FINN.state && FINN.state.companies[sym]; return c ? c.name.replace(/\s+(Ltd|Limited)\.?$/i, '') : sym; };
    if (ctx && ctx.kind === 'company') {
      tasks.push(() => news(nameOf(ctx.sym) + ' share', 6));
      tasks.push(() => web(nameOf(ctx.sym) + ' ' + q.replace(new RegExp(ctx.sym, 'ig'), ''), 4));
    } else if (ctx && ctx.kind === 'portfolio' && wantsNews && /hold|portfolio|my stocks|my companies/i.test(q)) {
      (ctx.focus || []).slice(0, 8).forEach((sym) => tasks.push(() => news(nameOf(sym) + ' share', 2)));
    } else {
      if (wantsNews) tasks.push(() => news(q, 6));
      tasks.push(() => web(q, 5));
    }
    await FINN.pool(tasks, 4, async (t) => { try { (await t()).forEach((r) => out.push(r)); } catch (e) { /* skip a failed source */ } });
    const seen = {};
    const week = Date.now() - 10 * 86400000;
    return out.filter((r) => (seen[r.uri] || seen[r.title] ? false : (seen[r.uri] = seen[r.title] = true)))
      .filter((r) => !r.date || r.date > week || r.kind === 'web')
      .sort((a, b) => (b.date || 0) - (a.date || 0))
      .slice(0, 10);
  }

  FINN.webSearch = { news, web, forQuestion };
})(window.FINN = window.FINN || {});
