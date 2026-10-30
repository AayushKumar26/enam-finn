/* FINN data layer: HTTP, caching, screener.in parsing, end-of-day prices. */
(function (FINN) {
  'use strict';

  // ---------- storage ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
    clearPrefix(prefix) {
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(prefix) === 0) keys.push(k); }
        keys.forEach((k) => localStorage.removeItem(k));
      } catch (e) { /* ignore */ }
    },
  };

  function cached(key, maxAgeMs) {
    const c = store.get(key, null);
    return c && Date.now() - c.t < maxAgeMs ? c.d : null;
  }
  function putCache(key, data) {
    if (!store.set(key, { t: Date.now(), d: data })) { store.clearPrefix('finn.c.'); store.set(key, { t: Date.now(), d: data }); }
  }

  // ---------- HTTP ----------
  // Inside the Android app, GETs go through a native bridge (real cookies, Referer, no CORS) —
  // exchange websites need that. Elsewhere (or if the bridge fails) we fall back to XHR.
  const pending = {};
  let seq = 0;
  window.FINNNative_cb = function (id, status, body) {
    const p = pending[id];
    if (!p) return;
    delete pending[id];
    clearTimeout(p.timer);
    if (status >= 200 && status < 300) p.resolve(body);
    else p.reject(Object.assign(new Error(status ? 'HTTP ' + status + (status === 429 ? ' (rate limited)' : '') : 'network: ' + String(body).slice(0, 80)), { status }));
  };
  function b64ToBuffer(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function nativeGet(url, opts) {
    return new Promise((resolve, reject) => {
      const id = 'r' + (++seq);
      pending[id] = { resolve, reject, timer: setTimeout(() => { delete pending[id]; reject(new Error('timeout')); }, (opts.timeout || 25000) + 5000) };
      try { window.FINNNative.request(id, url, JSON.stringify(opts.headers || {}), opts.type === 'arraybuffer'); }
      catch (e) { clearTimeout(pending[id].timer); delete pending[id]; reject(e); }
    }).then((body) => (opts.type === 'arraybuffer' ? b64ToBuffer(body) : body));
  }
  const hasNative = () => !!(window.FINNNative && window.FINNNative.request);
  FINN.hasNative = hasNative;

  async function http(method, url, opts) {
    opts = opts || {};
    if (method === 'GET' && hasNative()) {
      try { return await nativeGet(url, opts); }
      catch (e) { if (e.status) throw e; /* transport failure: try XHR below */ }
    }
    return xhr(method, url, opts);
  }

  const UNSAFE = /^(referer|origin|user-agent|cookie|host|connection)$/i;
  function xhr(method, url, opts) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open(method, url);
      x.responseType = opts.type || 'text';
      x.timeout = opts.timeout || 25000;
      Object.keys(opts.headers || {}).forEach((h) => { if (!UNSAFE.test(h)) x.setRequestHeader(h, opts.headers[h]); });
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) resolve(x.response);
        else {
          let detail = '';
          try { if (x.responseType === '' || x.responseType === 'text') { const j = JSON.parse(x.responseText); detail = (j.error && (j.error.message || j.error.status)) || ''; } } catch (e) { /* not JSON */ }
          reject(Object.assign(new Error('HTTP ' + x.status + (detail ? ': ' + String(detail).slice(0, 160) : '')), { status: x.status }));
        }
      };
      x.onerror = () => reject(new Error('network error'));
      x.ontimeout = () => reject(new Error('timeout'));
      x.send(opts.body || null);
    });
  }

  // ---------- parsing helpers ----------
  function num(s) {
    if (s == null) return null;
    const t = String(s).replace(/[,₹%\s ]/g, '').replace(/Cr\.?$/i, '');
    if (t === '' || t === '-' || t === '--') return null;
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
  }
  function clean(s) {
    return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').replace(/\s*\+\s*$/, '').trim();
  }

  function parseTable(table) {
    if (!table) return null;
    const head = table.querySelector('thead tr') || table.querySelector('tr');
    if (!head) return null;
    const headers = Array.from(head.children).slice(1).map((th) => clean(th.textContent));
    const rows = {};
    const order = [];
    const bodyRows = table.querySelectorAll('tbody tr').length ? table.querySelectorAll('tbody tr') : table.querySelectorAll('tr');
    Array.from(bodyRows).forEach((tr) => {
      const cells = Array.from(tr.children);
      if (cells.length < 2 || cells[0].tagName === 'TH' && tr === head) return;
      const label = clean(cells[0].textContent);
      if (!label || rows[label]) return;
      rows[label] = cells.slice(1).map((td) => num(td.textContent));
      order.push(label);
    });
    return order.length ? { headers, rows, order } : null;
  }

  // Find a row by any of several label prefixes (handles banks: "Revenue", "Financing Profit", ...)
  function row(t) {
    if (!t) return null;
    const names = Array.prototype.slice.call(arguments, 1);
    const keys = Object.keys(t.rows);
    for (let i = 0; i < names.length; i++) {
      const n = names[i].toLowerCase();
      const k = keys.find((key) => key.toLowerCase().indexOf(n) === 0);
      if (k) return t.rows[k];
    }
    return null;
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // "28 Oct", "28 Oct 2025", "Today", "Yesterday" -> timestamp (ms)
  function parseDocDate(s) {
    if (!s) return null;
    const t = s.trim().toLowerCase();
    const now = new Date();
    if (t.indexOf('today') === 0) return now.getTime();
    if (t.indexOf('yesterday') === 0) return now.getTime() - 86400000;
    const m = t.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?/);
    if (!m) return null;
    const mon = MONTHS.indexOf(m[2]);
    if (mon < 0) return null;
    let year = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    let d = new Date(year, mon, parseInt(m[1], 10), 12);
    if (!m[3] && d.getTime() - now.getTime() > 2 * 86400000) d = new Date(year - 1, mon, parseInt(m[1], 10), 12);
    return d.getTime();
  }

  function parseRanges(section) {
    const out = {};
    if (!section) return out;
    section.querySelectorAll('table.ranges-table').forEach((tb) => {
      const title = clean((tb.querySelector('th') || {}).textContent);
      if (!title) return;
      const vals = {};
      tb.querySelectorAll('tr').forEach((tr) => {
        const td = tr.querySelectorAll('td');
        if (td.length >= 2) vals[clean(td[0].textContent).replace(/:$/, '')] = num(td[1].textContent);
      });
      out[title] = vals;
    });
    return out;
  }

  function docBlock(doc, cls, heading) {
    let el = doc.querySelector('#documents .' + cls) || doc.querySelector('.documents.' + cls);
    if (!el) {
      const h = Array.from(doc.querySelectorAll('#documents h3, #documents h2')).find((x) => clean(x.textContent).toLowerCase().indexOf(heading) === 0);
      el = h ? h.parentElement : null;
    }
    return el ? Array.from(el.querySelectorAll('li')) : [];
  }

  function parseAnnouncements(doc, base) {
    const seen = {};
    const out = [];
    docBlock(doc, 'announcements', 'announcements').forEach((li) => {
      const a = li.querySelector('a');
      if (!a) return;
      const href = absolute(a.getAttribute('href'), base);
      const small = li.querySelector('.smaller, .ink-600, .sub');
      const smallText = small ? clean(small.textContent) : '';
      let title = clean(a.textContent);
      if (smallText && title.indexOf(smallText) >= 0) title = clean(title.replace(smallText, ''));
      let summary = smallText;
      let dateStr = '';
      const re = /^(today|yesterday|\d{1,2}\s+[A-Za-z]{3}[a-z]*\.?(?:\s+\d{4})?)\s*[-–:]\s*/i;
      let m = summary.match(re);
      if (m) { dateStr = m[1]; summary = summary.slice(m[0].length); }
      else if ((m = title.match(re))) { dateStr = m[1]; title = title.slice(m[0].length); }
      if (!title && summary) { title = summary; summary = ''; }
      const key = href || title;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ title, summary, dateStr, date: parseDocDate(dateStr), href });
    });
    return out;
  }

  function parseConcalls(doc, base) {
    return docBlock(doc, 'concalls', 'concalls').map((li) => {
      const first = li.firstElementChild;
      const label = first ? clean(first.textContent) : '';
      const links = {};
      li.querySelectorAll('a').forEach((a) => {
        const k = clean(a.textContent).toLowerCase();
        const href = absolute(a.getAttribute('href'), base);
        if (k.indexOf('transcript') >= 0) links.transcript = href;
        else if (k.indexOf('ppt') >= 0) links.ppt = href;
        else if (k.indexOf('rec') >= 0) links.rec = href;
      });
      return { label: /^[A-Z][a-z]{2} \d{4}$/.test(label) ? label : clean(li.textContent).slice(0, 8), transcript: links.transcript || null, ppt: links.ppt || null };
    }).filter((c) => c.transcript || c.ppt);
  }

  function parseLinks(doc, cls, heading, base) {
    return docBlock(doc, cls, heading).map((li) => {
      const a = li.querySelector('a');
      return a ? { text: clean(a.textContent), href: absolute(a.getAttribute('href'), base) } : null;
    }).filter(Boolean).slice(0, 6);
  }

  function absolute(href, base) {
    if (!href) return null;
    if (/^https?:/i.test(href)) return href;
    if (href.indexOf('//') === 0) return 'https:' + href;
    return base + (href[0] === '/' ? '' : '/') + href;
  }

  const SCREENER = 'https://www.screener.in';

  function parseCompany(html, sym, path) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const sec = (id) => doc.getElementById(id);
    const tableIn = (el) => (el ? el.querySelector('table.data-table') || el.querySelector('table') : null);

    const ratios = {};
    doc.querySelectorAll('#top-ratios li').forEach((li) => {
      const n = li.querySelector('.name');
      const k = clean(n ? n.textContent : '');
      const nums = Array.from(li.querySelectorAll('.number')).map((e) => num(e.textContent));
      if (k) ratios[k] = nums.length ? nums : [num(clean(li.textContent).replace(k, ''))];
    });

    const idEl = doc.querySelector('[data-company-id]');
    const h1 = doc.querySelector('#top h1') || doc.querySelector('h1');
    const shpEl = doc.getElementById('quarterly-shp') || sec('shareholding');
    const about = doc.querySelector('.company-profile .about') || doc.querySelector('.about');

    return {
      sym,
      path,
      url: SCREENER + path,
      name: clean(h1 ? h1.textContent : sym),
      companyId: idEl ? idEl.getAttribute('data-company-id') : null,
      about: about ? clean(about.textContent).slice(0, 600) : '',
      ratios,
      quarters: parseTable(tableIn(sec('quarters'))),
      pl: parseTable(tableIn(sec('profit-loss'))),
      bs: parseTable(tableIn(sec('balance-sheet'))),
      cf: parseTable(tableIn(sec('cash-flow'))),
      rt: parseTable(tableIn(sec('ratios'))),
      shp: parseTable(tableIn(shpEl)),
      growth: parseRanges(sec('profit-loss')),
      pros: Array.from(doc.querySelectorAll('.pros li')).map((li) => clean(li.textContent)).slice(0, 5),
      cons: Array.from(doc.querySelectorAll('.cons li')).map((li) => clean(li.textContent)).slice(0, 5),
      announcements: parseAnnouncements(doc, SCREENER),
      bseCode: (function () {
        const a = Array.from(doc.querySelectorAll('a[href*="bseindia.com"]')).map((x) => x.getAttribute('href') + ' ' + x.textContent).join(' ');
        const m = a.match(/\/(\d{6})\/?/) || a.match(/BSE:\s*(\d{6})/);
        return m ? m[1] : (/^\d{6}$/.test(sym) ? sym : null);
      })(),
      nseSymbol: (function () {
        const a = Array.from(doc.querySelectorAll('a[href*="nseindia.com"]')).map((x) => x.getAttribute('href') + ' ' + x.textContent).join(' ');
        const m = a.match(/symbol=([A-Z0-9&\-]+)/i) || a.match(/NSE:\s*([A-Z0-9&\-]+)/);
        return m ? decodeURIComponent(m[1]).toUpperCase() : (/^\d+$/.test(sym) ? null : sym);
      })(),
      concalls: parseConcalls(doc, SCREENER),
      annualReports: parseLinks(doc, 'annual-reports', 'annual reports', SCREENER),
      ratings: parseLinks(doc, 'credit-ratings', 'credit ratings', SCREENER),
      fetchedAt: Date.now(),
    };
  }

  function hasNumbers(c) {
    const s = c && (row(c.quarters, 'Sales', 'Revenue') || row(c.pl, 'Sales', 'Revenue'));
    return !!(s && s.some((v) => v != null));
  }

  // Symbol -> screener path. Search results remember the exact path.
  function pathFor(sym) {
    const known = store.get('finn.paths', {})[sym];
    return known || '/company/' + encodeURIComponent(sym) + '/consolidated/';
  }
  function rememberPath(sym, path) {
    const m = store.get('finn.paths', {});
    m[sym] = path;
    store.set('finn.paths', m);
  }
  function symFromPath(path) {
    const m = String(path).match(/\/company\/([^/]+)\//);
    return m ? decodeURIComponent(m[1]).toUpperCase() : null;
  }

  // Fresh within the user's cache window; otherwise refetch, and fall back to the last good copy if offline.
  async function getCompany(sym, force, depth) {
    const key = 'finn.c.' + sym;
    if (!force) { const c = cached(key, FINN.ttl()); if (c) return c; }
    try { return await fetchCompany(sym, key, depth); } catch (e) {
      if (e.notFound) throw e;
      // Screener rate limit: one short pause, then retry before falling back to saved data.
      if (e.status === 429 && !depth) { await new Promise((r) => setTimeout(r, 2500)); try { return await fetchCompany(sym, key, depth); } catch (e2) { e = e2; } }
      const stale = store.get(key, null);
      if (stale) return Object.assign(stale.d, { stale: true });
      throw e;
    }
  }

  // Tickers that changed after renames, mergers and demergers. Anything not listed is resolved via search.
  const RENAMED = {
    ZOMATO: 'ETERNAL', TATAMOTORS: 'TMPV', MOTHERSUMI: 'MOTHERSON', ADANITRANS: 'ADANIENSOL', MINDTREE: 'LTIM', LTI: 'LTIM',
    'MCDOWELL-N': 'UNITDSPR', INFRATEL: 'INDUSTOWER', CADILAHC: 'ZYDUSLIFE', SRTRANSFIN: 'SHRIRAMFIN', AMARAJABAT: 'ARE&M',
    HDFC: 'HDFCBANK', PVR: 'PVRINOX', MAHINDCIE: 'CIEINDIA', IBULHSGFIN: 'SAMMAANCAP', WELSPUNIND: 'WELSPUNLIV', GMRINFRA: 'GMRAIRPORT',
    LTFH: 'LTF', ADANIGAS: 'ATGL', KPIT: 'KPITTECH',
  };
  const KNOWN_AS = { ETERNAL: 'Zomato', TMPV: 'Tata Motors', TMCV: 'Tata Motors (trucks & buses)' };

  async function fetchPage(sym, path) {
    try { return parseCompany(await http('GET', SCREENER + path), sym, path); }
    catch (e) { if (e.status === 404) return null; throw e; }
  }

  async function fetchCompany(sym, key, depth) {
    let path = pathFor(sym);
    let c = await fetchPage(sym, path);
    // No subsidiaries → empty consolidated page; unknown consolidated → try standalone.
    if ((!c || !hasNumbers(c)) && /consolidated/.test(path)) {
      const alt = path.replace(/consolidated\/?$/, '');
      const c2 = await fetchPage(sym, alt).catch(() => null);
      if (c2 && (hasNumbers(c2) || !c)) { c = c2; rememberPath(sym, alt); }
    }
    if (!c) {
      // Renamed / merged ticker, or a company name typed as a ticker.
      if (depth) throw Object.assign(new Error('not found'), { notFound: true, suggestions: [] });
      let target = RENAMED[sym] && RENAMED[sym] !== sym ? { sym: RENAMED[sym] } : null;
      let hits = [];
      if (!target) {
        hits = await search(sym).catch(() => []);
        const exact = hits.find((h) => h.sym === sym);
        if (exact && exact.path !== path) { rememberPath(sym, exact.path); return fetchCompany(sym, key, 1); }
        if (hits.length === 1 || (hits[0] && hits[0].name.toUpperCase().replace(/[^A-Z]/g, '').indexOf(sym.replace(/[^A-Z]/g, '')) === 0)) target = hits[0];
      }
      if (target) {
        if (target.path) rememberPath(target.sym, target.path);
        const r = Object.assign({}, await getCompany(target.sym, true, 1), { renamedFrom: sym });
        putCache(key, r);
        return r;
      }
      throw Object.assign(new Error('No listed company found for "' + sym + '"'), { notFound: true, suggestions: hits.slice(0, 6) });
    }
    if (!hasNumbers(c) && !c.announcements.length) throw Object.assign(new Error('No financial data available for ' + sym), { notFound: true, suggestions: [] });
    putCache(key, c);
    return c;
  }

  async function search(q) {
    if (!q || q.length < 2) return [];
    const res = JSON.parse(await http('GET', SCREENER + '/api/company/search/?q=' + encodeURIComponent(q) + '&v=3&fts=1', { timeout: 10000 }));
    return (res || []).filter((r) => r.url && /\/company\//.test(r.url)).slice(0, 8).map((r) => {
      const sym = symFromPath(r.url);
      return { sym, name: r.name, path: r.url };
    }).filter((r) => r.sym);
  }

  // ---------- exchange filings: NSE first, BSE next, company page list last ----------
  function parseExchDate(s) {
    if (!s) return null;
    let m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
    m = String(s).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) { const mon = MONTHS.indexOf(m[2].toLowerCase()); if (mon >= 0) return new Date(+m[3], mon, +m[1], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)).getTime(); }
    const t = Date.parse(s);
    return isNaN(t) ? null : t;
  }

  let nseWarmAt = 0;
  async function nseFilings(symbol) {
    if (!hasNative()) throw new Error('NSE needs the app');
    if (Date.now() - nseWarmAt > 10 * 60000) {
      await http('GET', 'https://www.nseindia.com/', { headers: { Accept: 'text/html' }, timeout: 15000 });
      nseWarmAt = Date.now();
    }
    const raw = await http('GET', 'https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=' + encodeURIComponent(symbol), {
      headers: { Accept: 'application/json, text/plain, */*', Referer: 'https://www.nseindia.com/get-quotes/equity?symbol=' + encodeURIComponent(symbol) }, timeout: 15000,
    });
    const j = JSON.parse(raw);
    const list = Array.isArray(j) ? j : (j && j.data) || [];
    return list.slice(0, 60).map((a) => ({
      title: clean(a.desc || a.subject || ''), summary: clean(a.attchmntText || ''), subject: clean(a.desc || ''),
      href: a.attchmntFile || null, date: parseExchDate(a.sort_date || a.an_dt || a.exchdisstime), exact: true, exch: 'NSE',
    })).filter((a) => a.title || a.summary);
  }

  function ymd(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  async function bseFilings(code) {
    const now = new Date();
    const url = 'https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=1&strCat=-1&strPrevDate=' + ymd(new Date(Date.now() - 45 * 86400000)) +
      '&strScrip=' + code + '&strSearch=P&strToDate=' + ymd(now) + '&strType=C&subcategory=-1';
    const j = JSON.parse(await http('GET', url, { headers: { Accept: 'application/json', Referer: 'https://www.bseindia.com/', Origin: 'https://www.bseindia.com' }, timeout: 15000 }));
    return ((j && j.Table) || []).slice(0, 60).map((a) => {
      const head = clean(a.HEADLINE || ''), sub = clean(a.NEWSSUB || '');
      return {
        title: sub || head, summary: head && head !== sub ? head : '', subject: [a.CATEGORYNAME, a.SUBCATNAME].filter((x) => x && x !== '-').join(' / '),
        href: a.ATTACHMENTNAME ? 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/' + a.ATTACHMENTNAME : null,
        date: parseExchDate(a.NEWS_DT || a.DT_TM || a.News_submission_dt), exact: true, exch: 'BSE',
      };
    }).filter((a) => a.title);
  }

  async function getFilings(c, force) {
    const key = 'finn.c.fil.' + c.sym;
    if (!force) { const hit = cached(key, FINN.ttl()); if (hit) return hit; }
    const tries = [];
    if (c.nseSymbol) tries.push(() => nseFilings(c.nseSymbol));
    if (c.bseCode) tries.push(() => bseFilings(c.bseCode));
    for (let i = 0; i < tries.length; i++) {
      try {
        const list = await tries[i]();
        if (list.length) { const out = { list, source: list[0].exch }; putCache(key, out); return out; }
      } catch (e) { /* next source */ }
    }
    const stale = store.get(key, null);
    if (stale && !force) return stale.d;
    return { list: (c.announcements || []).map((a) => Object.assign({ exch: 'Exchange', exact: false }, a)), source: 'Company page' };
  }

  // ---------- end-of-day price & volume ----------
  function eodFromSeries(points) {
    // points: [{t, close, vol}] ascending
    const p = points.filter((x) => x.close != null);
    if (p.length < 3) return null;
    const last = p[p.length - 1];
    const prev = p[p.length - 2];
    const window = p.slice(Math.max(0, p.length - 21), p.length - 1).map((x) => x.vol).filter((v) => v != null && v > 0);
    const avgVol = window.length ? window.reduce((a, b) => a + b, 0) / window.length : null;
    const closes = p.map((x) => x.close);
    return {
      close: last.close,
      chg: ((last.close - prev.close) / prev.close) * 100,
      vol: last.vol,
      volX: avgVol && last.vol ? last.vol / avgVol : null,
      hi52: Math.max.apply(null, closes),
      lo52: Math.min.apply(null, closes),
      date: last.t,
      series: closes.slice(-250),
    };
  }

  async function yahooEOD(sym) {
    const ysym = /^\d+$/.test(sym) ? sym + '.BO' : sym + '.NS';
    const hosts = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
    let lastErr;
    for (let i = 0; i < hosts.length; i++) {
      try {
        const j = JSON.parse(await http('GET', hosts[i] + '/v8/finance/chart/' + encodeURIComponent(ysym) + '?range=1y&interval=1d', { timeout: 12000 }));
        const r = j.chart.result[0];
        const q = r.indicators.quote[0];
        return eodFromSeries(r.timestamp.map((t, k) => ({ t: t * 1000, close: q.close[k], vol: q.volume[k] })));
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  async function screenerEOD(companyId) {
    const j = JSON.parse(await http('GET', SCREENER + '/api/company/' + companyId + '/chart/?q=Price-Volume&days=365', { timeout: 12000 }));
    const price = (j.datasets || []).find((d) => /price/i.test(d.metric));
    const vol = (j.datasets || []).find((d) => /volume/i.test(d.metric));
    const vmap = {};
    (vol ? vol.values : []).forEach((v) => { vmap[v[0]] = Number(v[1]); });
    return eodFromSeries((price ? price.values : []).map((v) => ({ t: new Date(v[0]).getTime(), close: Number(v[1]), vol: vmap[v[0]] })));
  }

  async function getEOD(sym, companyId, force) {
    const key = 'finn.c.eod.' + sym;
    if (!force) { const c = cached(key, FINN.ttl()); if (c) return c; }
    let e = null;
    try { e = await yahooEOD(sym); } catch (err) { /* try screener next */ }
    if (!e && companyId) { try { e = await screenerEOD(companyId); } catch (err) { /* fall back below */ } }
    if (!e) { const stale = store.get(key, null); if (stale) return stale.d; throw new Error('No price data'); }
    putCache(key, e);
    return e;
  }

  // Run async tasks with limited concurrency (polite to screener.in).
  async function pool(items, limit, fn) {
    let i = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (i < items.length) { const k = i++; await fn(items[k], k); }
    });
    await Promise.all(workers);
  }

  FINN.store = store;
  FINN.http = http;
  FINN.row = row;
  FINN.num = num;
  FINN.parseCompany = parseCompany;
  FINN.parseDocDate = parseDocDate;
  FINN.getCompany = getCompany;
  FINN.RENAMED = RENAMED;
  FINN.KNOWN_AS = KNOWN_AS;
  FINN.getFilings = getFilings;
  FINN.nseFilings = nseFilings;
  FINN.bseFilings = bseFilings;
  FINN.parseExchDate = parseExchDate;
  FINN.getEOD = getEOD;
  FINN.search = search;
  FINN.rememberPath = rememberPath;
  FINN.pool = pool;
  FINN.cached = cached;
  FINN.putCache = putCache;
})(window.FINN = window.FINN || {});
