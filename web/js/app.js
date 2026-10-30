/* FINN UI — Today (push), Research (pull), Portfolio. Hash-routed so Android back works. */
(function (FINN) {
  'use strict';
  const store = FINN.store;

  const DEFAULT_PORTFOLIO = ['DIXON', 'POLYCAB', 'TITAN', 'INFY', 'HDFCBANK', 'ICICIBANK', 'BAJFINANCE', 'SUNPHARMA',
    'LT', 'TRENT', 'KPITTECH', 'ASIANPAINT', 'CDSL', 'TATAPOWER', 'APOLLOHOSP', 'DMART'];
  const TRY = ['RELIANCE', 'TCS', 'ETERNAL', 'HAL', 'IRCTC', 'PIDILITIND'];

  FINN.settings = () => Object.assign({ priceX: 4, volX: 2, provider: 'gemini', apiKey: '', fastModel: '', smartModel: '', cacheSec: 5, watchOn: true, watchMin: 15, webMode: 'finn', backupKey: '', alertCats: ['results', 'management_change', 'M&A', 'fund_raise', 'litigation', 'credit_rating', 'pledging'] }, store.get('finn.settings', {}));
  FINN.ttl = () => Math.max(5, Number(FINN.settings().cacheSec) || 5) * 1000;
  const CACHE_OPTS = [[5, '5 sec'], [60, '1 min'], [900, '15 min'], [3600, '1 hr'], [21600, '6 hr']];

  const S = {
    portfolio: store.get('finn.portfolio', DEFAULT_PORTFOLIO),
    companies: {}, eod: {}, errors: {},
    scan: { running: false, done: 0, total: 0, at: null },
    windowD: 1, filter: 'all', showRoutine: false,
    seen: store.get('finn.seen', {}),
    search: { q: '', results: [], loading: false, error: null },
    recent: store.get('finn.recent', []),
    open: {}, // per-company UI: { loading, error, tab, fin: 'q'|'y' }
    gt: {}, chat: {}, notes: {}, expand: {},
    editPortfolio: false, offline: false,
    trips: store.get('finn.trips', {}), memo: null, tripForm: {},
    filings: {}, rf: {}, rfBusy: {}, prof: {}, bb: {}, gl: null, biz: {}, guid: {},
    lastVisit: store.get('finn.lastVisit', Date.now() - 86400000),
    intro: !store.get('finn.introDone', false),
  };

  FINN.state = S;
  const $view = document.getElementById('view');
  const $title = document.getElementById('hTitle');
  const $sub = document.getElementById('hSub');

  // ---------- formatting ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function n0(v) { return v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString('en-IN'); }
  function n2(v) { return v == null || isNaN(v) ? '—' : (Math.round(v * 100) / 100).toLocaleString('en-IN'); }
  function sp(v, d) { return v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d == null ? 1 : d) + '%'; }
  function tone(v) { return v == null ? 'flat' : v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat'; }
  function badge(v) { return '<span class="badge ' + tone(v) + '">' + sp(v) + '</span>'; }
  function crore(v) { if (v == null) return '—'; return v >= 100000 ? '₹' + (v / 100000).toFixed(2) + 'L Cr' : '₹' + n0(v) + ' Cr'; }
  function ago(t, exact) {
    if (!t) return '';
    if (exact) {
      const m = Math.round((Date.now() - t) / 60000);
      if (m >= 0 && m < 60) return Math.max(1, m) + 'm ago';
      if (m >= 0 && m < 24 * 60) return Math.round(m / 60) + 'h ago';
    }
    const a = new Date(t); a.setHours(0, 0, 0, 0);
    const b = new Date(); b.setHours(0, 0, 0, 0);
    const d = Math.round((b - a) / 86400000);
    return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? d + 'd ago' : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  function shortHead(h) {
    const m = String(h).match(/([A-Za-z]{3})\s+(\d{4})/);
    if (!m) return h;
    return m[1] === 'Mar' ? 'FY' + m[2].slice(2) : m[1] + "'" + m[2].slice(2);
  }
  function greet() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function link(href, text, cls) { return '<a class="' + (cls || 'lnk') + '" href="' + esc(href) + '" target="_blank" rel="noopener">' + text + '</a>'; }

  // ---------- tiny SVG charts ----------
  function spark(series, w, h, col) {
    if (!series || series.length < 2) return '';
    const min = Math.min.apply(null, series), max = Math.max.apply(null, series), r = max - min || 1;
    const pts = series.map((v, i) => (i / (series.length - 1) * w).toFixed(1) + ',' + (h - 2 - (v - min) / r * (h - 4)).toFixed(1));
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="spark" preserveAspectRatio="none"><polyline fill="none" stroke="' + col + '" stroke-width="1.6" points="' + pts.join(' ') + '"/>' +
      '<polygon fill="' + col + '" opacity=".10" points="0,' + h + ' ' + pts.join(' ') + ' ' + w + ',' + h + '"/></svg>';
  }
  function bars(points, opts) {
    opts = opts || {};
    const pts = points.filter((p) => p.v != null);
    if (!pts.length) return '<div class="muted small">No data</div>';
    const W = 320, H = opts.h || 120, pad = 16;
    const max = Math.max(0, Math.max.apply(null, pts.map((p) => p.v))), min = Math.min(0, Math.min.apply(null, pts.map((p) => p.v)));
    const r = max - min || 1, bw = W / pts.length;
    const y0 = pad + (max / r) * (H - pad * 2);
    let s = '<svg viewBox="0 0 ' + W + ' ' + (H + 14) + '" class="bars">';
    pts.forEach((p, i) => {
      const hgt = Math.abs(p.v) / r * (H - pad * 2);
      const y = p.v >= 0 ? y0 - hgt : y0;
      const last = i === pts.length - 1;
      s += '<rect x="' + (i * bw + bw * 0.18).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + Math.max(1, hgt).toFixed(1) +
        '" rx="2" fill="' + (p.v < 0 ? 'var(--red)' : opts.color || 'var(--blue)') + '" opacity="' + (last ? 1 : 0.55) + '"/>';
      if (last || pts.length <= 6 || i % 2 === pts.length % 2) s += '<text x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + (H + 11) + '" text-anchor="middle">' + esc(shortHead(p.h)) + '</text>';
      if (last) s += '<text x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + Math.max(10, y - 4).toFixed(1) + '" text-anchor="middle" class="val">' + n0(p.v) + '</text>';
    });
    s += '<line x1="0" x2="' + W + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" class="axis"/></svg>';
    return s;
  }

  // ---------- portfolio scan (push data) ----------
  function savePortfolio() { store.set('finn.portfolio', S.portfolio); }

  async function scan(force) {
    if (S.scan.running) return;
    S.scan = { running: true, done: 0, total: S.portfolio.length, at: S.scan.at };
    S.errors = {};
    render();
    let lastPaint = 0;
    await FINN.pool(S.portfolio.slice(), 3, async (sym) => {
      try {
        let c = await FINN.getCompany(sym, force);
        if (c.sym !== sym) { const pi = S.portfolio.indexOf(sym); if (pi >= 0) S.portfolio[pi] = c.sym; savePortfolio(); sym = c.sym; }
        S.companies[sym] = c;
        const [f, e] = await Promise.all([
          FINN.getFilings(c, force).catch(() => null),
          FINN.getEOD(sym, c.companyId, force).catch(() => null),
        ]);
        if (f) S.filings[sym] = f;
        if (e) S.eod[sym] = e;
      } catch (e) { S.errors[sym] = e.message; }
      S.scan.done++;
      if (Date.now() - lastPaint > 400) { lastPaint = Date.now(); if (route().name === 'today' || route().name === 'portfolio') render(); }
    });
    S.scan.running = false;
    S.scan.at = Date.now();
    S.offline = Object.keys(S.companies).length === 0;
    render();
    if (!S.offline) checkAlerts();
  }

  function alertsFor(sym) {
    const e = S.eod[sym];
    const st = FINN.settings();
    if (!e) return null;
    const why = [];
    if (Math.abs(e.chg) >= st.priceX) why.push('price ' + sp(e.chg));
    if (e.volX != null && e.volX >= st.volX) why.push(e.volX.toFixed(1) + '× volume');
    return why.length ? why.join(' · ') : null;
  }

  function feed() {
    const items = [];
    // Exchange filings carry exact timestamps; company-page items only a day (treated as noon).
    const now = Date.now();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const watch = FINN.settings().alertCats || [];
    const inWindow = (a) => {
      if (!a.date) return false;
      if (S.windowD === 'new') return a.date > S.lastVisit;
      if (S.windowD === 'custom') {
        const f = new Date(S.custom.from + 'T00:00:00').getTime(), t = new Date(S.custom.to + 'T23:59:59').getTime();
        return a.date >= f && a.date <= t;
      }
      return a.exact ? a.date >= now - S.windowD * 86400000 : a.date >= today.getTime() - S.windowD * 86400000;
    };
    S.portfolio.forEach((sym) => {
      const c = S.companies[sym];
      if (!c) return;
      const list = S.filings[sym] ? S.filings[sym].list : c.announcements;
      list.forEach((a, k) => {
        if (!inWindow(a)) return;
        const cl = FINN.classify(a);
        items.push(Object.assign({ id: a.href || sym + k + a.title, sym, c, watched: watch.indexOf(cl.cat) >= 0 && cl.prio !== 'low' }, a, cl));
      });
    });
    const rank = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => rank[a.prio] - rank[b.prio] || b.date - a.date);
    return items;
  }

  const FILTERS = [
    ['all', 'All', null],
    ['results', 'Results', ['results']],
    ['people', 'People', ['management_change']],
    ['deals', 'Deals', ['M&A', 'fund_raise', 'capex', 'press_release']],
    ['risk', 'Risk', ['litigation', 'pledging', 'credit_rating', 'insider_trading']],
  ];

  function pctc(a, b) { return a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100; }
  // Headline numbers for a results filing: read from the filing PDF if done, else the financials table.
  function resultsFor(i) {
    const rf = S.rf[i.sym];
    if (rf && rf.res) {
      const r = rf.res.rows;
      const mg = (k) => (r.EBITDA[k] != null && r.Revenue[k] ? (r.EBITDA[k] / r.Revenue[k]) * 100 : null);
      return {
        src: 'filing', period: rf.res.period, unit: rf.res.unit, basis: rf.res.basis,
        metrics: ['Revenue', 'EBITDA', 'PBT', 'PAT'].map((n) => ({ name: n, cur: r[n][0], qoq: pctc(r[n][0], r[n][1]), yoy: pctc(r[n][0], r[n][2]) })),
        margin: mg(0) != null ? { cur: mg(0), qoq: mg(1), yoy: mg(2) } : null,
      };
    }
    const q = FINN.quarterCard(i.c);
    if (!q) return null;
    const want = i.date ? FINN.expectedQuarter(i.date) : null;
    return Object.assign({ src: 'table', unit: '₹ Cr', stale: !!(want && q.period !== want), want }, q);
  }
  function rq(r, name) { const m = r && r.metrics.find((x) => x.name === name); return m ? m.yoy : null; }

  function briefLines(items) {
    const lines = [];
    const filed = {};
    items.forEach((i) => { if (i.prio !== 'low') filed[i.sym] = true; });
    S.portfolio.forEach((sym) => tripStatus(sym).filter((t) => t.hit).forEach((t) => {
      lines.push({ sym, html: '<b>' + sym + '</b> ' + esc(t.label) + ' is ' + n2(t.cur) + t.unit + ' — your line was ' + t.op + ' ' + t.v + t.unit + '.', kind: 'Thesis tripwire' });
    }));
    const res = items.filter((i) => i.cat === 'results' && i.prio === 'high');
    const seen = {};
    const season = res.filter((i) => (seen[i.sym] ? false : (seen[i.sym] = true))).map((i) => { const r = resultsFor(i); return { sym: i.sym, pat: r && !r.stale ? rq(r, 'PAT') : null }; }).filter((x) => x.pat != null);
    if (season.length >= 2) {
      season.sort((a, b) => a.pat - b.pat);
      const up = season.filter((x) => x.pat > 0).length;
      lines.push({ sym: season[0].sym, html: '<b>' + season.length + '</b> holdings reported · profit up YoY at ' + up + '. Weakest <b>' + season[0].sym + '</b> ' + sp(season[0].pat) +
        ', strongest <b>' + season[season.length - 1].sym + '</b> ' + sp(season[season.length - 1].pat) + '.', kind: 'Results season' });
    }
    // Same kind of filing at several holdings → one grouped line, not repeats.
    const highs = items.filter((i) => (i.prio === 'high' || i.watched) && (season.length < 2 || i.cat !== 'results'));
    const byCat = {};
    highs.forEach((i) => { (byCat[i.cat] = byCat[i.cat] || []).push(i); });
    const singles = [];
    Object.keys(byCat).forEach((k) => {
      const g = byCat[k].filter((i, idx, arr) => arr.findIndex((x) => x.sym === i.sym) === idx);
      if (g.length >= 2) lines.push({ sym: g[0].sym, html: '<b>' + g.length + '</b> ' + esc(g[0].label.toLowerCase()) + ' filings: ' + g.slice(0, 5).map((i) => '<b>' + i.sym + '</b>').join(', ') + (g.length > 5 ? ' +' + (g.length - 5) + ' more' : '') + ' — see Filings below.', kind: g[0].label });
      else singles.push(g[0]);
    });
    singles.slice(0, 3).forEach((i) => {
      let t;
      if (i.cat === 'results') {
        const q = resultsFor(i);
        t = q && !q.stale ? '<b>' + i.sym + '</b> ' + esc(q.period) + ' results: revenue ' + sp(rq(q, 'Revenue')) + ' YoY, PAT ' + sp(rq(q, 'PAT')) + ' YoY.' : '<b>' + i.sym + '</b> filed results — tap to read the numbers.';
      } else {
        t = '<b>' + i.sym + '</b> ' + esc((i.summary || i.title).slice(0, 110)) + ((i.summary || i.title).length > 110 ? '…' : '');
      }
      lines.push({ sym: i.sym, html: t, kind: i.label });
    });
    S.portfolio.forEach((sym) => {
      const why = alertsFor(sym);
      if (why && !filed[sym]) lines.push({ sym, html: '<b>' + sym + '</b> ' + esc(why) + ' with <u>no filing to explain it</u> — worth a call.', kind: 'Unexplained move' });
    });
    return lines.slice(0, 5);
  }

  // ---------- thesis tripwires: the investor's own kill-criteria, checked on every refresh ----------
  function deRatio(c) {
    const d = FINN.annual(c.bs, ['Borrowings']), e = FINN.annual(c.bs, ['Equity Capital']), r = FINN.annual(c.bs, ['Reserves']);
    return d.length && e.length && r.length ? d[d.length - 1].v / (e[e.length - 1].v + r[r.length - 1].v) : null;
  }
  function qm(c, name) { const q = FINN.quarterCard(c); const m = q && q.metrics.find((x) => x.name === name); return m ? m.yoy : null; }
  const TRIP = {
    rev_yoy: ['Revenue growth YoY', '%', (c) => qm(c, 'Revenue')],
    pat_yoy: ['PAT growth YoY', '%', (c) => qm(c, 'PAT')],
    margin: ['Operating margin', '%', (c) => { const q = FINN.quarterCard(c); return q && q.margin ? q.margin.cur : null; }],
    promoter: ['Promoter holding', '%', (c) => { const r = FINN.row(c.shp, 'Promoters'); const i = FINN.lastIdx(r); return i >= 0 ? r[i] : null; }],
    de: ['Debt / equity', 'x', deRatio],
    pe: ['P/E', 'x', (c) => (c.ratios['Stock P/E'] ? c.ratios['Stock P/E'][0] : null)],
    move: ['Daily price move', '%', (c, e) => (e ? e.chg : null)],
  };
  function tripStatus(sym) {
    const c = S.companies[sym];
    if (!c) return [];
    return (S.trips[sym] || []).map((r, i) => {
      const def = TRIP[r.m];
      const v = def ? def[2](c, S.eod[sym]) : null;
      return Object.assign({ i, label: def ? def[0] : r.m, unit: def ? def[1] : '', cur: v, hit: v != null && (r.op === '<' ? v < r.v : v > r.v) }, r);
    });
  }
  function fmtTrip(t) { return t.label + ' ' + t.op + ' ' + t.v + t.unit; }
  function saveTrips() { store.set('finn.trips', S.trips); }

  function tripCard(c) {
    const ts = tripStatus(c.sym);
    const f = S.tripForm[c.sym] || { m: 'pat_yoy', op: '<', v: '' };
    let h = '<div class="card"><div class="card-t">Thesis tripwires <span class="muted small">FINN alerts you the moment one trips</span></div>';
    h += ts.length ? ts.map((t) => '<div class="trip ' + (t.hit ? 'hit' : '') + '"><div><div class="qt">' + esc(fmtTrip(t)) + '</div><div class="muted small">Now: ' + (t.cur == null ? 'n/a' : n2(t.cur) + t.unit) + '</div></div>' +
      '<span class="tag ' + (t.hit ? 't-high' : 'v-met') + '">' + (t.hit ? 'Tripped' : 'Holding') + '</span><button class="rmx" data-rmtrip="' + c.sym + '/' + t.i + '">✕</button></div>').join('')
      : '<div class="muted small">e.g. “PAT growth YoY &lt; 0%” or “Promoter holding &lt; 50%”. Write down what would break your thesis.</div>';
    h += '<div class="tripform"><select id="tm">' + Object.keys(TRIP).map((k) => '<option value="' + k + '"' + (f.m === k ? ' selected' : '') + '>' + TRIP[k][0] + '</option>').join('') + '</select>' +
      '<select id="top"><option' + (f.op === '<' ? ' selected' : '') + '>&lt;</option><option' + (f.op === '>' ? ' selected' : '') + '>&gt;</option></select>' +
      '<input id="tv" type="number" step="any" placeholder="value" value="' + esc(f.v) + '"><button class="primary" data-addtrip="' + c.sym + '">Add</button></div></div>';
    return h;
  }

  // ---------- one-tap investment memo for the team ----------
  function memoText(c) {
    const e = S.eod[c.sym], q = FINN.quarterCard(c), sc = FINN.score(c), fl = FINN.redFlags(c), g = S.gt[c.sym] && S.gt[c.sym].result;
    const L = [];
    L.push('FINN memo — ' + c.name + ' (' + c.sym + ') · ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
    L.push('Price ₹' + n2(e ? e.close : c.ratios['Current Price'] && c.ratios['Current Price'][0]) + (e ? ' (' + sp(e.chg) + ' today)' : '') +
      (c.ratios['Market Cap'] ? ' · Mkt cap ' + crore(c.ratios['Market Cap'][0]) : '') + (c.ratios['Stock P/E'] ? ' · P/E ' + n2(c.ratios['Stock P/E'][0]) + 'x' : ''));
    if (q) L.push(q.period + ': ' + q.metrics.map((m) => m.name + ' ' + sp(m.yoy) + ' YoY').join(', ') + (q.margin && q.margin.yoy != null ? '; margin ' + n2(q.margin.cur) + '% (' + Math.round((q.margin.cur - q.margin.yoy) * 100) + 'bp YoY)' : ''));
    L.push('FINN Score: ' + sc.map((p) => p.label + ' ' + p.value + ' ' + '(' + ({ good: 'strong', ok: 'fair', weak: 'weak', na: 'n/a' }[p.grade]) + ')').join(' · '));
    const bad = fl.filter((f) => f.status !== 'pass');
    L.push('Red flags: ' + (bad.length ? bad.map((f) => (f.status === 'fail' ? '✕ ' : '! ') + f.title).join('; ') : 'none of ' + fl.length + ' checks'));
    if (g) L.push('Said vs Done (' + g.credibility + ' credibility): ' + g.takeaway);
    const ts = tripStatus(c.sym);
    if (ts.length) L.push('Tripwires: ' + ts.map((t) => fmtTrip(t) + (t.hit ? ' — TRIPPED' : ' — ok')).join('; '));
    L.push('Source: ' + c.url);
    return L.join('\n');
  }
  function memoSheet() {
    if (!S.memo) return '';
    const t = S.memo;
    return '<div class="sheet-bg"><div class="sheet"><div class="row between"><b>Share memo</b><button class="mini" data-act="closememo">Close</button></div>' +
      '<pre class="memo">' + esc(t) + '</pre><div class="sharebar">' + link('https://wa.me/?text=' + encodeURIComponent(t), 'WhatsApp', 'primary') +
      link('mailto:?subject=' + encodeURIComponent(t.split('\n')[0]) + '&body=' + encodeURIComponent(t), 'Email', 'pill') + '<button class="pill" data-act="copymemo">Copy</button></div></div></div>';
  }

  function glSheet() {
    const g = FINN.GLOSSARY[S.gl];
    if (!g) return '';
    return '<div class="sheet-bg"><div class="sheet"><div class="row between"><b class="gl-t">' + esc(S.gl) + '</b><button class="mini" data-act="closegl">Close</button></div>' +
      '<p class="gl-d">' + esc(g[0]) + '</p><div class="gl-w"><span class="muted xsmall">WHY IT MATTERS</span><div>' + esc(g[1]) + '</div></div></div></div>';
  }
  const INTRO = [
    ['Today', 'FINN reads every exchange filing and price move across your portfolio, and shows only the few that matter — in one brief.'],
    ['Research', 'Search any NSE or BSE company. Get its numbers, a FINN Score, a red-flag scan, and what management promised vs. delivered.'],
    ['Tripwires', 'Write down what would break your thesis. FINN checks it on every refresh and tells you first. Tap any term for a plain-English meaning.'],
  ];
  function introSheet() {
    const k = S.introStep || 0;
    return '<div class="sheet-bg intro"><div class="sheet"><div class="dots">' + INTRO.map((x, i) => '<i class="' + (i === k ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<div class="intro-n">' + (k + 1) + ' / ' + INTRO.length + '</div><div class="intro-t">' + INTRO[k][0] + '</div><p class="intro-d">' + INTRO[k][1] + '</p>' +
      '<div class="row between"><button class="mini" data-act="introdone">Skip</button><button class="primary" data-act="intronext">' + (k === INTRO.length - 1 ? 'Start' : 'Next') + '</button></div></div></div>';
  }

  // ---------- triggered alerts: tell the user the moment something crosses a threshold ----------
  function currentAlerts() {
    const out = [];
    const st = FINN.settings();
    // 1) Material filings of the types the user chose (last 3 days)
    const cut = Date.now() - 3 * 86400000;
    S.portfolio.forEach((sym) => {
      const c = S.companies[sym];
      if (!c) return;
      ((S.filings[sym] || {}).list || c.announcements || []).forEach((a) => {
        if (!a.date || a.date < cut) return;
        const cl = FINN.classify(a);
        if ((st.alertCats || []).indexOf(cl.cat) < 0 || cl.prio === 'low') return;
        out.push({ key: 'f|' + (a.href || sym + a.title), sym, title: sym + ' · ' + cl.label, body: (a.summary || a.title).slice(0, 180), kind: 'filing' });
      });
    });
    // 2) End-of-day thresholds (one alert per stock per session)
    S.portfolio.forEach((sym) => {
      const why = alertsFor(sym), e = S.eod[sym];
      if (!why || !e) return;
      const filed = feed().some((i) => i.sym === sym && i.prio !== 'low');
      out.push({ key: 'e|' + sym + '|' + new Date(e.date).toDateString(), sym, title: sym + ' ' + sp(e.chg) + (filed ? '' : ' — no filing to explain it'), body: 'Crossed your alert: ' + why + '. Close ₹' + n2(e.close) + '.', kind: 'move' });
    });
    // 3) Thesis tripwires
    S.portfolio.forEach((sym) => tripStatus(sym).filter((t) => t.hit).forEach((t) => {
      out.push({ key: 't|' + sym + '|' + t.m + t.op + t.v, sym, title: sym + ' tripwire: ' + t.label, body: t.label + ' is ' + n2(t.cur) + t.unit + ' — your line was ' + t.op + ' ' + t.v + t.unit + '.', kind: 'trip' });
    }));
    return out;
  }

  function deliver(a, id) {
    if (FINN.hasNative() && window.FINNNative.postAlert) { try { window.FINNNative.postAlert(a.title, a.body, id); } catch (e) { /* in-app toast still shows */ } }
    toast(a);
  }
  let toastTimer = null;
  function toast(a) {
    const el = document.getElementById('toast');
    if (!el || document.hidden) return;
    el.innerHTML = '<button class="toast-in" data-go="c/' + esc(a.sym) + '"><b>' + esc(a.title) + '</b><span>' + esc(a.body) + '</span></button>';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  function checkAlerts() {
    const st = FINN.settings();
    if (st.watchOn === false) return;
    const sent = store.get('finn.notified', null);
    const now = currentAlerts();
    if (!sent) { // first run: set a baseline instead of flooding the phone with old items
      const base = {}; now.forEach((a) => { base[a.key] = Date.now(); });
      store.set('finn.notified', base);
      if (now.length) deliver({ sym: now[0].sym, title: 'FINN is watching ' + S.portfolio.length + ' companies', body: now.length + ' active alert' + (now.length > 1 ? 's' : '') + ' right now — open the brief. New ones will arrive here.' }, 1);
      return;
    }
    const fresh = now.filter((a) => !sent[a.key]);
    if (!fresh.length) return;
    fresh.forEach((a) => { sent[a.key] = Date.now(); });
    const keys = Object.keys(sent).sort((x, y) => sent[y] - sent[x]).slice(0, 600);
    const trimmed = {}; keys.forEach((k) => { trimmed[k] = sent[k]; });
    store.set('finn.notified', trimmed);
    S.alertLog = fresh.concat(S.alertLog || []).slice(0, 30);
    if (fresh.length <= 3) fresh.forEach((a, i) => deliver(a, 100 + (Date.now() / 1000 + i) % 100000 | 0));
    else deliver({ sym: fresh[0].sym, title: fresh.length + ' new FINN alerts', body: fresh.slice(0, 5).map((a) => a.title).join(' · ') }, 2);
  }

  // Background watcher: JS timers keep running while Android keeps the app in memory.
  let watchTimer = null;
  function startWatcher() {
    clearInterval(watchTimer);
    const st = FINN.settings();
    if (st.watchOn === false) return;
    const mins = Math.max(5, Number(st.watchMin) || 15);
    S.nextCheck = Date.now() + mins * 60000;
    watchTimer = setInterval(() => { S.nextCheck = Date.now() + mins * 60000; scan(true); }, mins * 60000);
  }

  // ---------- views: TODAY ----------
  function gl(term, label) { return '<button class="gl" data-gl="' + esc(term) + '">' + esc(label || term) + '</button>'; }
  function skeleton(n) { let h = ''; for (let i = 0; i < n; i++) h += '<div class="card skel"><i style="width:30%"></i><i style="width:85%"></i><i style="width:60%"></i></div>'; return h; }

  const WINDOWS = [['new', 'New'], [1, '24H'], [3, '3D'], [7, '7D'], [30, '30D'], ['custom', 'Custom']];
  function isoDay(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  S.custom = S.custom || { from: isoDay(Date.now() - 14 * 86400000), to: isoDay(Date.now()) };

  function viewToday() {
    const st = FINN.settings();
    if (S.offline && !S.scan.running) return viewTodayOffline();
    const items = feed();
    const f = FILTERS.find((x) => x[0] === S.filter);
    const shown = items.filter((i) => !f[2] || f[2].indexOf(i.cat) >= 0);
    const important = shown.filter((i) => i.prio !== 'low' && i.cat !== 'results');
    const resultsIn = shown.filter((i) => i.cat === 'results' && i.prio === 'high');
    const upcoming = shown.filter((i) => i.cat === 'results' && i.prio === 'low');
    const routine = shown.filter((i) => i.prio === 'low' && i.cat !== 'results');
    const unseen = items.filter((i) => !S.seen[i.id]).length;
    const brief = briefLines(items);
    const loadingEmpty = S.scan.running && !Object.keys(S.companies).length;

    let h = '<section class="hero"><div class="hello">' + greet() + '</div><div class="hero-sub">' +
      (S.scan.running ? 'Scanning ' + S.scan.done + ' of ' + S.scan.total + ' companies…' : 'Watching ' + S.portfolio.length + ' companies' + (S.scan.at ? ' · updated <span data-ago-t="' + S.scan.at + '">just now</span>' : '') + (FINN.settings().watchOn !== false ? ' · <span class="live-dot"></span>alerts on' : '')) + '</div>';
    if (S.scan.running) h += '<div class="progress"><span style="width:' + (S.scan.done / Math.max(1, S.scan.total) * 100) + '%"></span></div>';
    h += '</section>';

    // FINN brief: only what changed and matters; everything else is one tap away.
    h += '<section class="brief"><div class="brief-head"><span class="spark-dot"></span>FINN BRIEF<span class="brief-n">' + (brief.length ? brief.length + ' to know' : '') + '</span></div>';
    if (loadingEmpty) h += '<div class="skel"><i style="width:90%"></i><i style="width:70%"></i><i style="width:80%"></i></div>';
    else if (brief.length) h += brief.map((b) => '<button class="brief-line" data-go="c/' + b.sym + '"><span class="kind k-' + esc(b.kind.replace(/\W+/g, '').toLowerCase()) + '">' + esc(b.kind) + '</span><span>' + b.html + '</span><span class="chev">›</span></button>').join('');
    else h += '<div class="brief-empty">' + (S.scan.running ? 'Reading filings and prices…' : 'Nothing material across your portfolio in this window. Quiet is good.') + '</div>';
    h += '</section>';

    const pulse = S.portfolio.filter((s) => S.eod[s]).sort((a, b) => Math.abs(S.eod[b].chg) - Math.abs(S.eod[a].chg));
    if (pulse.length) {
      h += '<div class="sec-row"><div class="section">PORTFOLIO PULSE</div><button class="mini" data-go="portfolio">⚡ at ±' + st.priceX + '% or ' + st.volX + '× vol</button></div><div class="pulse">' +
        pulse.map((s) => { const e = S.eod[s], al = alertsFor(s); return '<button class="pchip ' + (al ? 'alert' : '') + '" data-go="c/' + s + '"><span class="ps">' + (al ? '⚡' : '') + s + '</span><span class="pc ' + tone(e.chg) + '">' + sp(e.chg) + '</span>' + (e.volX ? '<span class="pv">' + e.volX.toFixed(1) + '× vol</span>' : '') + '</button>'; }).join('') + '</div>';
    }

    h += '<div class="sec-row" style="margin-top:18px"><div class="section">FILINGS</div>' + (unseen ? '<button class="mini" data-act="markread">Mark ' + unseen + ' read</button>' : '') + '</div>';
    h += '<div class="seg wide">' + WINDOWS.map((w) => '<button class="' + (S.windowD === w[0] ? 'on' : '') + '" data-win="' + w[0] + '">' + w[1] + '</button>').join('') + '</div>';
    if (S.windowD === 'custom') h += '<div class="daterow"><label>From<input type="date" id="dFrom" value="' + S.custom.from + '" max="' + S.custom.to + '"></label><label>To<input type="date" id="dTo" value="' + S.custom.to + '" min="' + S.custom.from + '" max="' + isoDay(Date.now()) + '"></label></div>';
    h += '<div class="chips scroll">' + FILTERS.map((x) => { const n = x[2] ? items.filter((i) => x[2].indexOf(i.cat) >= 0).length : items.length; return '<button class="chip ' + (S.filter === x[0] ? 'on' : '') + '" data-filter="' + x[0] + '">' + x[1] + ' <span class="cnt">' + n + '</span></button>'; }).join('') + '</div>';

    if (loadingEmpty) return h + skeleton(3);
    if (resultsIn.length || upcoming.length) h += resultsBoard(resultsIn, upcoming);
    h += important.length ? important.map(filingCard).join('') : (resultsIn.length ? '' : '<div class="empty">' + (S.scan.running ? 'Loading filings…' : 'No material filings ' + (S.windowD === 'new' ? 'since your last visit.' : S.windowD === 'custom' ? 'between these dates.' : 'in this window.') + (S.windowD !== 30 ? ' <button class="mini" data-win="30">Show 30 days</button>' : '')) + '</div>');
    if (routine.length) {
      h += '<div class="card flat-card"><button class="collapse" data-act="routine"><span>' + routine.length + ' routine filings collapsed</span><span>' + (S.showRoutine ? '▴' : '▾') + '</span></button>';
      if (S.showRoutine) h += routine.map((i) => '<a class="routine" href="' + esc(i.href) + '" target="_blank"><span class="tk">' + i.sym + '</span><span class="rt">' + esc(i.title) + '<span class="muted"> · ' + ago(i.date) + '</span></span></a>').join('');
      h += '</div>';
    }
    const errs = Object.keys(S.errors);
    if (errs.length && !S.scan.running) h += '<div class="muted small center">Couldn\'t load ' + errs.join(', ') + ' · <button class="mini" data-act="rescan">Retry</button></div>';
    return h;
  }

  // All results in one board; tap a row for the full first cut.
  function resultsBoard(list, upcoming) {
    const seen = {};
    const rows = list.filter((i) => (seen[i.sym] ? false : (seen[i.sym] = true))).map((i) => {
      const q = resultsFor(i);
      const bp = q && q.margin && q.margin.yoy != null && q.margin.cur != null ? Math.round((q.margin.cur - q.margin.yoy) * 100) : null;
      return { i, q, rev: q && !q.stale ? rq(q, 'Revenue') : null, pat: q && !q.stale ? rq(q, 'PAT') : null, bp: q && !q.stale ? bp : null };
    }).sort((a, b) => (b.pat == null ? -999 : b.pat) - (a.pat == null ? -999 : a.pat));
    let h = '<div class="card board"><div class="card-t">Results season <span class="muted small">' + rows.length + ' reported · YoY · tap a row</span></div>';
    if (rows.length) {
      h += '<div class="brow bhead"><span>Company</span><span>' + gl('Revenue') + '</span><span>' + gl('PAT') + '</span><span>' + gl('Margin') + '</span></div>';
      rows.forEach((r) => {
        const open = S.expand['rb' + r.i.sym];
        h += '<button class="brow" data-expand="rb' + r.i.sym + '"><span><span class="tk">' + r.i.sym + '</span>' + (S.seen[r.i.id] ? '' : '<i class="udot"></i>') +
          '<span class="xsmall bper ' + (r.q && r.q.stale ? 'amber' : 'muted') + '">' + esc(r.q ? (r.q.stale ? 'awaiting ' + r.q.want : r.q.period + (r.q.src === 'filing' ? ' · filing' : '')) : '') + '</span></span>' +
          '<span>' + badge(r.rev) + '</span><span>' + badge(r.pat) + '</span><span><span class="badge ' + tone(r.bp) + '">' + (r.bp == null ? '—' : (r.bp >= 0 ? '+' : '') + r.bp + 'bp') + '</span></span></button>';
        if (open) h += '<div class="bexp">' + resultsDetail(r.i, r.q) + '</div>';
      });
    }
    if (upcoming.length) h += '<div class="muted xsmall" style="margin-top:12px">BOARD MEETINGS ANNOUNCED</div>' + upcoming.slice(0, 6).map((u) => '<a class="mini-filing" href="' + esc(u.href) + '" target="_blank"><span class="tk">' + u.sym + '</span><span class="mf-t">' + esc(u.summary || u.title) + '</span><span class="muted xsmall">' + ago(u.date) + '</span></a>').join('');
    return h + '</div>';
  }

  function resultsDetail(i, q) {
    let h = '';
    const busy = S.rfBusy[i.sym];
    const rf = S.rf[i.sym];
    if (q && !q.stale) h += resultsTable(q);
    if (q && q.stale) h += '<div class="note">The reported financials still show <b>' + esc(q.period) + '</b>; this filing is for <b>' + esc(q.want) + '</b>.</div>';
    if (rf && rf.err) h += '<div class="note bad">' + esc(rf.err) + '</div>';
    h += '<div class="f-actions">';
    if (i.href && (!rf || !rf.res)) h += FINN.ai.enabled() ? '<button class="pill" data-readres="' + esc(i.id) + '">' + (busy ? 'Reading filing…' : '✦ Read numbers from filing') + '</button>' : '<span class="muted xsmall">Add an AI key to read the filing PDF</span>';
    h += (i.href ? link(i.href, 'Filing PDF') : '') + '<button class="mini" data-go="c/' + i.sym + '">Research ›</button></div>';
    if (rf && rf.res) h += '<div class="muted xsmall">Read from the ' + esc(rf.res.basis || '') + ' results filing · ' + esc(rf.res.unit || '') + ' · EBITDA = PBT + interest + depreciation − other income</div>';
    return h;
  }

  function filingCard(i) {
    let body = '';
    if (i.cat === 'management_change') {
      const pr = S.prof[i.id];
      if (pr && pr.res && pr.res.people.length) {
        body = pr.res.people.map((p) => '<div class="person-card"><div class="row between top-align"><div><div class="pname">' + esc(p.name) + '</div><div class="muted small">' + esc([p.role, p.change, p.effective].filter(Boolean).join(' · ')) + '</div></div>' +
          (p.profileUrl ? link(p.profileUrl, (p.profileSrc || 'Profile') + ' ›', 'pill') : link('https://www.google.com/search?q=' + encodeURIComponent(p.name + ' ' + i.c.name.replace(/\s+Ltd\.?$/i, '') + ' linkedin'), 'Find on LinkedIn ›', 'pill')) + '</div>' +
          (p.background && p.background.length ? '<ul class="bio">' + p.background.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '<div class="muted xsmall">No profile in the filing — use LinkedIn.</div>') + '</div>').join('') +
          (pr.res.why ? '<div class="f-sum ai">' + esc(pr.res.why) + '</div>' : '') + '<div class="muted xsmall">Profile from the company\'s filing' + (pr.res.webUsed ? ' + public profiles (LinkedIn/web)' : '') + '</div>';
      } else {
        const person = FINN.personIn(i.title + ' ' + i.summary);
        const qry = (person ? person + ' ' : '') + i.c.name.replace(/\s+Ltd\.?$/i, '') + ' linkedin';
        body = '<div class="person-row"><div><div class="muted small">' + (person ? 'Person named' : 'Who is it?') + '</div><div class="pname">' + esc(person || 'See filing') + '</div></div>' +
          (FINN.ai.enabled() ? '<button class="pill" data-prof="' + esc(i.id) + '">' + (pr && pr.busy ? 'Reading…' : '✦ Background') + '</button>' : link('https://www.google.com/search?q=' + encodeURIComponent(qry), 'Background ›', 'pill')) + '</div>' +
          (pr && pr.err ? '<div class="note bad">' + esc(pr.err) + '</div>' : '');
      }
    }
    const note = S.notes[i.id];
    const canExplain = !i.summary && !note && FINN.ai.enabled();
    return '<article class="card filing p-' + i.prio + (S.seen[i.id] ? '' : ' unseen') + '">' +
      '<div class="f-head"><button class="tkbtn" data-go="c/' + i.sym + '"><span class="tk">' + (i.watched ? '<span class="bolt">⚡</span>' : '') + i.sym + '</span><span class="muted small">' + esc(i.c.name) + '</span></button>' +
      '<div class="f-meta"><span class="tag t-' + i.prio + '">' + esc(i.label) + '</span><span class="muted xsmall">' + esc(i.exch || '') + ' · ' + ago(i.date, i.exact) + '</span></div></div>' +
      '<div class="f-title">' + esc(i.title) + '</div>' +
      (i.summary ? '<div class="f-sum">' + esc(i.summary) + '</div>' : '') +
      (note ? '<div class="f-sum ai">' + esc(note) + '</div>' : '') + body +
      '<div class="f-actions">' + (i.href ? link(i.href, 'Filing PDF') : '') + (canExplain ? '<button class="mini" data-explain="' + esc(i.id) + '">✦ Explain</button>' : '') +
      '<button class="mini" data-go="c/' + i.sym + '">Research ›</button></div></article>';
  }

  function resultsTable(q) {
    return '<table class="metrics"><thead><tr><th>' + esc(q.period) + ' · ' + esc(q.unit || '₹ Cr') + '</th><th>Value</th><th>' + gl('QoQ') + '</th><th>' + gl('YoY') + '</th></tr></thead><tbody>' +
      q.metrics.map((m) => '<tr><td>' + gl(m.name) + '</td><td class="num">' + n0(m.cur) + '</td><td>' + badge(m.qoq) + '</td><td>' + badge(m.yoy) + '</td></tr>').join('') +
      (q.margin && q.margin.cur != null ? '<tr><td>' + gl('Margin') + '</td><td class="num">' + n2(q.margin.cur) + '%</td><td>' + bps(q.margin.cur, q.margin.qoq) + '</td><td>' + bps(q.margin.cur, q.margin.yoy) + '</td></tr>' : '') +
      '</tbody></table>';
  }
  function bps(a, b) { if (a == null || b == null) return '<span class="badge flat">—</span>'; const v = Math.round((a - b) * 100); return '<span class="badge ' + tone(v) + '">' + (v >= 0 ? '+' : '') + v + 'bp</span>'; }

  function viewTodayOffline() {
    return '<section class="hero"><div class="hello">' + greet() + '</div><div class="hero-sub">Offline — showing sample data</div></section>' +
      '<div class="card warn-card">Couldn\'t reach the market data sources. Check your connection and <button class="mini" data-act="rescan">retry</button>. Below is the built-in sample digest.</div>' +
      DIGEST_EVENTS.slice(0, 8).map((e) => '<article class="card filing p-' + (CATEGORY_PRIORITY[e.category] || 'low') + '"><div class="f-head"><span class="tk">' + e.ticker + '</span><span class="tag t-' + (CATEGORY_PRIORITY[e.category] || 'low') + '">' + esc(CATEGORY_LABEL[e.category]) + '</span></div><div class="f-title">' + esc(e.title) + '</div>' + (e.oneLiner ? '<div class="f-sum">' + esc(e.oneLiner) + '</div>' : '') + '</article>').join('');
  }

  // ---------- views: RESEARCH ----------
  function searchBox(id, placeholder) {
    const s = S.search;
    let h = '<div class="searchwrap"><div class="searchbar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>' +
      '<input id="' + id + '" value="' + esc(s.q) + '" placeholder="' + placeholder + '" autocomplete="off" autocorrect="off" spellcheck="false" />' + (s.q ? '<button class="clear" data-act="clearsearch">✕</button>' : '') + '</div>';
    if (s.q.length >= 2) {
      h += '<div class="results">';
      if (s.loading && !s.results.length) h += '<div class="res muted">Searching all NSE / BSE listings…</div>';
      else if (s.error) h += '<div class="res muted">' + esc(s.error) + '</div>';
      else if (!s.results.length) h += '<div class="res muted">No listed company matches “' + esc(s.q) + '”</div>';
      h += s.results.map((r) => {
        const inP = S.portfolio.indexOf(r.sym) >= 0;
        return '<div class="res"><button class="res-main" data-pick="' + esc(r.sym) + '" data-path="' + esc(r.path) + '"><div class="res-name">' + hl(r.name, s.q) + '</div><div class="res-sym">' + esc(r.sym) + (/^\d+$/.test(r.sym) ? ' · BSE' : ' · NSE') + '</div></button>' +
          '<button class="res-add ' + (inP ? 'on' : '') + '" data-toggle="' + esc(r.sym) + '" data-path="' + esc(r.path) + '" aria-label="Add to portfolio">' + (inP ? '✓' : '+') + '</button></div>';
      }).join('');
      h += '</div>';
    }
    return h + '</div>';
  }
  function hl(name, q) {
    const i = name.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? esc(name) : esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.length)) + '</mark>' + esc(name.slice(i + q.length));
  }

  function viewResearch() {
    let h = '<section class="hero"><div class="hello">Research any company</div><div class="hero-sub">Every NSE & BSE listing — grounded in filings, annual reports and concall transcripts.</div></section>';
    h += searchBox('q', 'Company name or ticker');
    if (S.search.q.length < 2) {
      if (S.recent.length) h += '<div class="section">RECENT</div><div class="chips">' + S.recent.map((s) => '<button class="chip" data-go="c/' + s + '">' + s + '</button>').join('') + '</div>';
      h += '<div class="section">TRY</div><div class="chips">' + TRY.map((s) => '<button class="chip" data-go="c/' + s + '">' + s + '</button>').join('') + '</div>';
      h += '<div class="section">WHAT FINN CHECKS</div><div class="tiles">' +
        tile('◎', 'FINN Score', 'Growth, returns, cash, leverage and owners — graded in one glance.', 'c/RELIANCE/overview') +
        tile('⚑', 'Red-flag scan', '12 forensic checks: cash conversion, receivables, dilution, other income…', 'c/RELIANCE/quality') +
        tile('⇄', 'Said vs. done', 'Reads concall transcripts and checks management\'s promises against reported numbers.', 'c/RELIANCE/analyst') +
        tile('✦', 'Ask FINN', 'Ask anything — FINN searches the web and your data, and cites every source. Tap to try.', 'agent') + '</div>';
    }
    return h;
  }
  function tile(icon, t, d, target) { return '<button class="tile" ' + (target === 'agent' ? 'id="tileAgent"' : 'data-go="' + target + '"') + '><div class="ti">' + icon + '</div><div class="tt">' + t + '</div><div class="td">' + d + '</div></button>'; }

  // ---------- views: COMPANY ----------
  const CTABS = [['overview', 'Overview'], ['financials', 'Financials'], ['quality', 'Quality'], ['analyst', 'Analyst']];

  async function openCompany(sym, force) {
    const o = S.open[sym] = S.open[sym] || { tab: 'overview', fin: 'q' };
    if (S.companies[sym] && !force) {
      if (Date.now() - S.companies[sym].fetchedAt > FINN.ttl() && !o.bg) {
        o.bg = true; // show cached instantly, refresh quietly in the background
        FINN.getCompany(sym).then((c) => { S.companies[sym] = c; o.bg = false; render(); }, () => { o.bg = false; });
        loadEOD(sym);
      } else if (!S.eod[sym]) loadEOD(sym);
      if (!S.filings[sym]) loadFilings(sym);
      return;
    }
    o.loading = true; o.error = null; o.suggest = null; render();
    try {
      const c = await FINN.getCompany(sym, force);
      if (c.sym !== sym) {
        // Ticker was renamed (e.g. ZOMATO → ETERNAL): open the current listing.
        S.companies[c.sym] = c;
        S.open[c.sym] = Object.assign({ tab: 'overview', fin: 'q' }, S.open[c.sym], { renamedFrom: sym });
        S.recent = [c.sym].concat(S.recent.filter((x) => x !== c.sym && x !== sym)).slice(0, 8);
        store.set('finn.recent', S.recent);
        const pi = S.portfolio.indexOf(sym);
        if (pi >= 0) { S.portfolio[pi] = c.sym; savePortfolio(); }
        o.loading = false;
        history.replaceState(null, '', '#c/' + encodeURIComponent(c.sym));
        render();
        loadEOD(c.sym, force); loadFilings(c.sym, force);
        return;
      }
      S.companies[sym] = c;
      S.recent = [sym].concat(S.recent.filter((x) => x !== sym)).slice(0, 8);
      store.set('finn.recent', S.recent);
    } catch (e) {
      o.error = e.notFound ? e.message : friendlyNet(e);
      o.suggest = e.suggestions || null;
      o.notFound = !!e.notFound;
    }
    o.loading = false; render();
    if (S.companies[sym]) { loadEOD(sym, force); loadFilings(sym, force); }
  }
  function friendlyNet(e) {
    const m = String(e && e.message || e);
    if (/HTTP 429/.test(m)) return 'The data source is busy (rate limited). Wait a few seconds and retry.';
    if (/network|timeout/i.test(m)) return 'No connection to the data source. Check your internet and retry.';
    if (/HTTP 5\d\d/.test(m)) return 'The data source is having trouble right now. Retry in a minute.';
    return m;
  }
  async function loadFilings(sym, force) {
    try { S.filings[sym] = await FINN.getFilings(S.companies[sym], force); render(); } catch (e) { /* optional */ }
  }
  async function loadEOD(sym, force) {
    try { S.eod[sym] = await FINN.getEOD(sym, S.companies[sym] && S.companies[sym].companyId, force); render(); } catch (e) { /* optional */ }
  }

  function viewCompany(sym, tab) {
    const o = S.open[sym] || { tab: 'overview', fin: 'q' };
    if (tab) o.tab = tab;
    const c = S.companies[sym];
    if (!c) {
      if (o.error) {
        let h = '<div class="card"><div class="tk">' + esc(sym) + '</div><div class="f-title">' + (o.notFound ? 'We couldn\'t find this ticker' : 'Couldn\'t load this company') + '</div><div class="f-sum">' + esc(o.error) + '</div>';
        if (o.suggest && o.suggest.length) h += '<div class="muted xsmall" style="margin-top:12px">DID YOU MEAN</div>' + o.suggest.map((r) => '<button class="sugg" data-pick="' + esc(r.sym) + '" data-path="' + esc(r.path) + '"><span>' + esc(r.name) + '</span><span class="tk">' + esc(r.sym) + ' ›</span></button>').join('');
        else if (o.notFound) h += '<div class="muted small" style="margin-top:8px">Tickers change after renames and mergers. Search by company name instead.</div>';
        return h + '<div class="f-actions">' + (o.notFound ? '' : '<button class="mini" data-reload="' + esc(sym) + '">Retry</button>') + '<button class="mini" data-go="research">Search by name</button>' +
          (o.notFound ? '' : '<button class="mini" data-act="diag">Run diagnostics</button>') + '</div></div>';
      }
      return '<div class="card"><div class="tk">' + esc(sym) + '</div><ul class="steps"><li class="run">Fetching financial statements, filings and documents</li><li class="wait">Computing FINN Score and red flags</li></ul></div>' + skeleton(2);
    }
    const e = S.eod[sym];
    const inP = S.portfolio.indexOf(sym) >= 0;
    let h = '<section class="co-head"><div class="row between top-align"><div><div class="co-name">' + esc(c.name) + '</div><div class="muted small">' + esc(sym) + ' · ' + (c.ratios['Market Cap'] ? crore(c.ratios['Market Cap'][0]) + ' mkt cap' : '') + '</div></div>' +
      '<div class="hbtns"><button class="star ' + (inP ? 'on' : '') + '" data-toggle="' + esc(sym) + '">' + (inP ? '✓ Held' : '+ Portfolio') + '</button><button class="star" data-memo="' + esc(sym) + '">Share ↗</button></div></div>';
    if (c.stale) h += '<div class="muted xsmall">Offline — showing last saved data</div>';
    if (o.renamedFrom || c.renamedFrom) h += '<div class="note ok">' + esc(o.renamedFrom || c.renamedFrom) + ' now trades as <b>' + esc(sym) + '</b>' + (FINN.KNOWN_AS[sym] ? ' (formerly ' + esc(FINN.KNOWN_AS[sym]) + ')' : '') + '.</div>';
    else if (FINN.KNOWN_AS[sym]) h += '<div class="muted xsmall">Formerly ' + esc(FINN.KNOWN_AS[sym]) + '</div>';
    const price = e ? e.close : c.ratios['Current Price'] && c.ratios['Current Price'][0];
    h += '<div class="row price-row"><div class="price num">₹' + n2(price) + '</div>' + (e ? badge(e.chg) + (e.volX ? '<span class="muted small">' + e.volX.toFixed(1) + '× avg vol</span>' : '') : '') + '</div>';
    if (e && e.series) h += spark(e.series, 340, 56, e.series[e.series.length - 1] >= e.series[0] ? 'var(--green)' : 'var(--red)') + '<div class="row between muted xsmall"><span>1 year</span><span>' + sp((e.series[e.series.length - 1] / e.series[0] - 1) * 100) + '</span></div>';
    h += '</section><nav class="ctabs">' + CTABS.map((t) => '<button class="' + (o.tab === t[0] ? 'on' : '') + '" data-ctab="' + sym + '/' + t[0] + '">' + t[1] + '</button>').join('') + '</nav>';
    h += ({ overview: tabOverview, financials: tabFinancials, quality: tabQuality, analyst: tabAnalyst, guidance: tabAnalyst }[o.tab] || tabOverview)(c, o);
    const fs = S.filings[sym];
    h += '<div class="muted xsmall center src">Sources: reported financial statements · ' + (fs ? esc(fs.source) + ' filings' : 'exchange filings') + ' · annual reports & concall transcripts · Yahoo Finance EOD prices<br>updated <span data-ago-t="' + c.fetchedAt + '">just now</span> · <button class="mini" data-reload="' + esc(sym) + '">Refresh</button></div>';
    return h;
  }

  function pillars(c) {
    return '<div class="pillars">' + FINN.score(c).map((p) => '<div class="pillar g-' + p.grade + '"><div class="pl">' + gl(p.label) + '</div><div class="pvv num">' + esc(p.value) + '</div><div class="pbar"></div></div>').join('') + '</div>';
  }

  const MIXC = ['var(--blue)', 'var(--brand)', 'var(--green)', 'var(--violet)', 'var(--amber)', '#5ad1d1'];
  function mixBar(items) {
    const known = items.filter((x) => x.share_pct != null && x.share_pct > 0);
    if (!known.length) return '';
    const tot = known.reduce((a, x) => a + Number(x.share_pct), 0) || 1;
    return '<div class="mixbar">' + known.map((x, i) => '<span style="width:' + (x.share_pct / Math.max(tot, 100) * 100) + '%;background:' + MIXC[i % MIXC.length] + '"></span>').join('') + '</div>';
  }
  function bizCard(c) {
    const b = S.biz[c.sym] || {};
    let h = '<div class="card"><div class="card-t">Business snapshot <span class="muted small">segments & revenue mix</span></div>';
    if (b.res) {
      const r = b.res;
      if (r.what) h += '<div class="take-txt" style="font-size:14.5px">' + esc(r.what) + '</div>';
      if (r.segments.length) {
        h += '<div class="muted xsmall" style="margin-top:10px">SEGMENTS' + (r.period ? ' · ' + esc(r.period) : '') + '</div>' + mixBar(r.segments) +
          r.segments.map((x, i) => '<div class="mixrow"><i style="background:' + MIXC[i % MIXC.length] + '"></i><span class="mxn">' + esc(x.name) + (x.note ? '<span class="muted xsmall"> · ' + esc(x.note) + '</span>' : '') + '</span><span class="num">' +
            (x.share_pct != null ? n0(x.share_pct) + '%' : '—') + '</span>' + (x.growth_pct != null ? '<span class="badge ' + tone(x.growth_pct) + '">' + sp(Number(x.growth_pct), 0) + '</span>' : '<span></span>') + '</div>').join('');
      }
      if (r.geography.length) h += '<div class="muted xsmall" style="margin-top:10px">GEOGRAPHY</div>' + mixBar(r.geography) + '<div class="chips">' + r.geography.map((g) => '<span class="chip">' + esc(g.name) + (g.share_pct != null ? ' ' + n0(g.share_pct) + '%' : '') + '</span>').join('') + '</div>';
      if (r.moat) h += '<div class="f-sum">' + esc(r.moat) + '</div>';
      h += '<div class="muted xsmall" style="margin-top:8px">Source: ' + link(r.url, esc(r.source)) + '</div>';
    } else if (b.busy) h += '<ul class="steps"><li class="run">Reading the investor presentation…</li></ul>';
    else {
      if (b.err) h += '<div class="note bad">' + esc(b.err) + '</div>';
      if (FINN.ai.enabled()) h += '<button class="pill wide-pill" data-biz="' + c.sym + '">✦ Read segments & revenue mix</button>';
      else h += '<div class="muted small">Add an AI key in Settings to read the segment mix from the company\'s investor presentation.</div>';
    }
    return h + '</div>';
  }
  function guidCard(c) {
    const g = S.guid[c.sym] || {};
    let h = '<div class="card"><div class="card-t">' + gl('Guidance') + ' <span class="muted small">what management explicitly guided, latest call</span></div>';
    if (g.res) {
      h += g.res.items.length ? g.res.items.map((x) => '<div class="pv"><div class="row between"><span class="qt">' + esc(x.metric) + '</span><span class="muted xsmall">' + esc(x.period || '') + '</span></div><div class="small" style="margin-top:3px">' + esc(x.promise) + '</div>' +
        (x.quote ? '<div class="muted small" style="margin-top:4px;font-style:italic">“' + esc(x.quote) + '”</div>' : '') + '</div>').join('') : '<div class="muted small">No explicit numeric guidance in the ' + esc(g.res.call) + ' call.</div>';
      h += '<div class="muted xsmall">From the ' + link(g.res.url, esc(g.res.call) + ' transcript') + '</div>';
    } else if (g.busy) h += '<ul class="steps"><li class="run">Reading the latest transcript…</li></ul>';
    else {
      if (g.err) h += '<div class="note bad">' + esc(g.err) + '</div>';
      h += FINN.ai.enabled() ? '<button class="pill wide-pill" data-guid="' + c.sym + '">✦ Read latest guidance</button>' : '<div class="muted small">Add an AI key in Settings to read guidance from the transcript.</div>';
    }
    return h + '</div>';
  }
  function runAI(bucket, sym, fn) {
    const b = bucket[sym] = { busy: true };
    render();
    fn(S.companies[sym]).then((res) => { b.res = res; }, (e) => { b.err = e.message; }).then(() => { b.busy = false; render(); });
  }

  function tabOverview(c, o) {
    const r = c.ratios;
    const g = (k) => (r[k] ? r[k] : null);
    let h = '';
    if (c.about) h += '<div class="card"><div class="about ' + (S.expand[c.sym] ? 'open' : '') + '">' + esc(c.about) + '</div>' + (c.about.length > 160 ? '<button class="mini" data-expand="' + c.sym + '">' + (S.expand[c.sym] ? 'Less' : 'More') + '</button>' : '') + '</div>';
    const tk = FINN.take(c);
    h += '<div class="card take-card t-' + tk.tone + '"><div class="muted xsmall">FINN\'S TAKE</div><div class="take-txt">' + esc(tk.text) + '</div>' +
      (tk.flags ? '<button class="mini" data-ctab="' + c.sym + '/quality">' + tk.flags + ' red flag' + (tk.flags > 1 ? 's' : '') + ' to review ›</button>' : '') + '</div>';
    h += '<div class="card"><div class="card-t">' + gl('FINN Score') + ' <span class="muted small">tap any pillar to learn more</span></div>' + pillars(c) + '</div>';
    h += bizCard(c);
    const flist = (S.filings[c.sym] ? S.filings[c.sym].list : c.announcements).map((a) => Object.assign({ sym: c.sym, c, id: a.href || a.title }, a, FINN.classify(a)));
    const lastRes = flist.filter((a) => a.cat === 'results' && a.prio === 'high').sort((a, b) => b.date - a.date)[0];
    if (lastRes && Date.now() - lastRes.date < 45 * 86400000) {
      const q = resultsFor(lastRes);
      h += '<div class="card"><div class="card-t">Latest results <span class="muted small">' + ago(lastRes.date, lastRes.exact) + ' · vs prior quarter & year</span></div>' + resultsDetail(lastRes, q) + '</div>';
    } else {
      const q = FINN.quarterCard(c);
      if (q) h += '<div class="card"><div class="card-t">Latest quarter <span class="muted small">vs ' + esc(q.prevPeriod) + ' & ' + esc(q.yoyPeriod || '—') + '</span></div>' + resultsTable(q) + '</div>';
    }
    h += tripCard(c);
    const hl = g('High / Low'), cur = g('Current Price');
    const kv = [
      ['P/E', g('Stock P/E') && n2(g('Stock P/E')[0]) + 'x'], ['ROCE', g('ROCE') && n2(g('ROCE')[0]) + '%'], ['ROE', g('ROE') && n2(g('ROE')[0]) + '%'],
      ['Div. yield', g('Dividend Yield') && n2(g('Dividend Yield')[0]) + '%'], ['Book value', g('Book Value') && '₹' + n0(g('Book Value')[0])],
      ['P/B', g('Book Value') && cur && g('Book Value')[0] ? n2(cur[0] / g('Book Value')[0]) + 'x' : null],
    ].filter((x) => x[1]);
    h += '<div class="card"><div class="card-t">Valuation</div><div class="kv">' + kv.map((x) => '<div><div class="muted xsmall">' + gl(x[0]) + '</div><div class="num kvv">' + x[1] + '</div></div>').join('') + '</div>';
    if (hl && hl.length >= 2 && cur) {
      const pos = Math.max(0, Math.min(100, (cur[0] - hl[1]) / ((hl[0] - hl[1]) || 1) * 100));
      h += '<div class="range"><div class="muted xsmall row between"><span>52w low ₹' + n0(hl[1]) + '</span><span>high ₹' + n0(hl[0]) + '</span></div><div class="rbar"><span style="left:' + pos + '%"></span></div></div>';
    }
    h += '</div>';
    const recent = flist.slice().sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 6);
    if (recent.length) h += '<div class="card"><div class="card-t">Recent filings <span class="muted small">' + esc(S.filings[c.sym] ? S.filings[c.sym].source : '') + '</span></div>' + recent.map((a) => '<a class="mini-filing" href="' + esc(a.href) + '" target="_blank"><span class="tag t-' + a.prio + '">' + esc(a.label) + '</span><span class="mf-t">' + esc(a.summary || a.title) + '</span><span class="muted xsmall">' + ago(a.date, a.exact) + '</span></a>').join('') + '</div>';
    return h;
  }

  function tabFinancials(c, o) {
    const qmode = o.fin !== 'y';
    const t = qmode ? c.quarters : c.pl;
    const pts = (names) => { const r = FINN.row.apply(null, [t].concat(names)); return r ? t.headers.map((hh, i) => ({ h: hh, v: r[i] })).filter((p) => p.v != null && !/ttm/i.test(p.h)).slice(qmode ? -8 : -10) : []; };
    let h = '<div class="seg wide"><button class="' + (qmode ? 'on' : '') + '" data-fin="' + c.sym + '/q">Quarterly</button><button class="' + (!qmode ? 'on' : '') + '" data-fin="' + c.sym + '/y">Annual</button></div>';
    h += '<div class="card"><div class="card-t">Revenue <span class="muted small">₹ Cr</span></div>' + bars(pts(['Sales', 'Revenue']), { color: 'var(--blue)' }) + '</div>';
    h += '<div class="card"><div class="card-t">' + (FINN.isBank(c) ? 'Operating profit' : 'EBITDA') + ' <span class="muted small">₹ Cr</span></div>' + bars(pts(['Operating Profit', 'Financing Profit']), { color: 'var(--brand)' }) + '</div>';
    h += '<div class="card"><div class="card-t">Net profit <span class="muted small">₹ Cr</span></div>' + bars(pts(['Net Profit']), { color: 'var(--green)' }) + '</div>';
    const gr = c.growth;
    const gk = Object.keys(gr);
    if (gk.length) {
      const periods = ['10 Years', '5 Years', '3 Years', 'TTM'];
      h += '<div class="card"><div class="card-t">Compounded growth</div><table class="metrics"><thead><tr><th></th>' + periods.map((p) => '<th>' + p.replace(' Years', 'Y') + '</th>').join('') + '</tr></thead><tbody>' +
        gk.map((k) => '<tr><td>' + esc(k.replace('Compounded ', '').replace('Return on Equity', 'ROE')) + '</td>' + periods.map((p) => { const v = gr[k][p] != null ? gr[k][p] : gr[k]['Last Year'] != null && p === 'TTM' ? gr[k]['Last Year'] : (p === 'TTM' ? gr[k]['1 Year'] : null); return '<td class="num ' + tone(v) + 't">' + (v == null ? '—' : v + '%') + '</td>'; }).join('') + '</tr>').join('') + '</tbody></table></div>';
    }
    if (!FINN.isBank(c)) {
      const cfo = FINN.annual(c.cf, ['Cash from Operating']).slice(-6), np = FINN.annual(c.pl, ['Net Profit']);
      if (cfo.length) {
        h += '<div class="card"><div class="card-t">Profit vs. cash <span class="muted small">₹ Cr, annual</span></div><table class="metrics"><thead><tr><th>Year</th><th>Net profit</th><th>Op. cash</th><th>Ratio</th></tr></thead><tbody>' +
          cfo.map((p) => { const n = np.find((x) => x.h === p.h); const r = n && n.v ? p.v / n.v : null; return '<tr><td>' + shortHead(p.h) + '</td><td class="num">' + n0(n && n.v) + '</td><td class="num">' + n0(p.v) + '</td><td><span class="badge ' + (r == null ? 'flat' : r >= 0.8 ? 'up' : 'down') + '">' + (r == null ? '—' : r.toFixed(2) + 'x') + '</span></td></tr>'; }).join('') + '</tbody></table></div>';
      }
      const debt = FINN.annual(c.bs, ['Borrowings']).slice(-6);
      if (debt.length) h += '<div class="card"><div class="card-t">Borrowings <span class="muted small">₹ Cr</span></div>' + bars(debt, { color: 'var(--red)', h: 90 }) + '</div>';
    }
    h += sourcesCard(c);
    return h;
  }

  function sourcesCard(c) {
    let h = '<div class="card"><div class="card-t">Primary sources</div>';
    if (c.annualReports.length) h += '<div class="muted xsmall">ANNUAL REPORTS</div><div class="chips">' + c.annualReports.slice(0, 4).map((a) => link(a.href, esc(a.text.replace(/from (bse|nse)/i, '').replace('Financial Year', 'FY').trim()), 'chip')).join('') + '</div>';
    if (c.concalls.length) h += '<div class="muted xsmall" style="margin-top:10px">CONCALLS</div><div class="chips">' + c.concalls.slice(0, 6).map((x) => link(x.transcript || x.ppt, esc(x.label) + (x.transcript ? '' : ' (PPT)'), 'chip')).join('') + '</div>';
    if (c.ratings.length) h += '<div class="muted xsmall" style="margin-top:10px">CREDIT RATINGS</div><div class="chips">' + c.ratings.slice(0, 3).map((x) => link(x.href, esc(x.text.slice(0, 28)), 'chip')).join('') + '</div>';
    return h + '</div>';
  }

  function tabQuality(c) {
    const sc = FINN.score(c);
    let h = '<div class="card"><div class="card-t">FINN Score</div>' + sc.map((p) => '<div class="qrow"><span class="gdot g-' + p.grade + '"></span><div class="qmain"><div class="qt">' + gl(p.label) + ' <span class="num">' + esc(p.value) + '</span></div><div class="muted small">' + esc(p.note) + '</div></div><span class="gtag g-' + p.grade + '">' + ({ good: 'Strong', ok: 'Fair', weak: 'Weak', na: 'n/a' }[p.grade]) + '</span></div>').join('') + '</div>';
    const flags = FINN.redFlags(c);
    const nf = flags.filter((f) => f.status === 'fail').length, nw = flags.filter((f) => f.status === 'warn').length;
    const order = { fail: 0, warn: 1, pass: 2, na: 3 };
    flags.sort((a, b) => order[a.status] - order[b.status]);
    const FLAG_GL = { 'Profits turning into cash': 'Cash conversion', 'Free cash flow': 'Free cash flow', 'Receivables discipline': 'Debtor days', 'Working-capital cycle': 'Working-capital cycle',
      'Interest cover': 'Interest cover', 'Capex under construction': 'CWIP', 'Quality of earnings': 'Other income', 'Promoter commitment': 'Promoter', 'Margin trend': 'Margin', 'Debt vs growth': 'Leverage' };
    h += '<div class="card"><div class="card-t">Red-flag scan <span class="muted small">' + flags.length + ' checks · ' + nf + ' red · ' + nw + ' amber</span></div>' +
      flags.map((f) => '<div class="flag f-' + f.status + '"><span class="fi">' + ({ pass: '✓', warn: '!', fail: '✕', na: '·' }[f.status]) + '</span><div><div class="qt">' + (FLAG_GL[f.title] ? gl(FLAG_GL[f.title], f.title) : esc(f.title)) + '</div><div class="muted small">' + esc(f.detail) + '</div></div></div>').join('') + '</div>';
    const shp = c.shp;
    if (shp) {
      const cols = shp.headers.length;
      const from = Math.max(0, cols - 4);
      const qh = (x) => { const m = String(x).match(/([A-Za-z]{3})\s+(\d{4})/); return m ? m[1] + "'" + m[2].slice(2) : x; };
      const rowsN = ['Promoters', 'FIIs', 'DIIs', 'Public'].filter((n) => FINN.row(shp, n));
      h += '<div class="card"><div class="card-t">Who owns it <span class="muted small">% held</span></div><table class="metrics"><thead><tr><th></th>' + shp.headers.slice(from).map((x) => '<th>' + qh(x) + '</th>').join('') + '<th>Δ</th></tr></thead><tbody>' +
        rowsN.map((n) => { const r = FINN.row(shp, n); const d = r[cols - 1] != null && r[from] != null ? r[cols - 1] - r[from] : null; return '<tr><td>' + (FINN.GLOSSARY[n] ? gl(n) : n === 'Promoters' ? gl('Promoter', n) : n) + '</td>' + r.slice(from).map((v) => '<td class="num">' + (v == null ? '—' : v.toFixed(1)) + '</td>').join('') + '<td><span class="badge ' + tone(d) + '">' + (d == null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(1)) + '</span></td></tr>'; }).join('') + '</tbody></table></div>';
    }
    return h;
  }

  function tabAnalyst(c) {
    const b = S.bb[c.sym] || {};
    let h = '<div class="card"><div class="card-t">Bull vs. bear <span class="muted small">grounded in reported numbers' + (S.gt[c.sym] && S.gt[c.sym].result ? ' & concall guidance' : '') + '</span></div>';
    if (!FINN.ai.enabled()) h += '<div class="muted small">Add an AI key in <button class="mini" data-go="portfolio">Settings</button> to generate the case each way.</div>';
    else if (b.res) {
      h += '<div class="bb"><div class="bull"><div class="bbh">BULL</div><ul>' + b.res.bull.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' +
        '<div class="bear"><div class="bbh">BEAR</div><ul>' + b.res.bear.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div></div>' +
        (b.res.swing ? '<div class="take"><span class="muted xsmall">WHAT DECIDES IT · </span>' + esc(b.res.swing) + '</div>' : '');
    } else if (b.busy) h += '<ul class="steps"><li class="run">Weighing the numbers…</li></ul>';
    else h += (b.err ? '<div class="note bad">' + esc(b.err) + '</div>' : '') + '<button class="primary wide" data-bb="' + c.sym + '">Build bull & bear case</button>';
    h += '</div>';
    return h + guidCard(c) + tabGuidance(c);
  }

  async function runBB(sym) {
    const b = S.bb[sym] = { busy: true };
    render();
    try { b.res = await FINN.ai.bullBear(S.companies[sym]); } catch (e) { b.err = e.message; }
    b.busy = false; render();
  }

  function tabGuidance(c) {
    const g = S.gt[c.sym] || {};
    const calls = c.concalls.filter((x) => x.transcript).slice(0, 4);
    let h = '<div class="card"><div class="card-t">' + gl('Said vs Done', 'Said vs. Done') + '</div><div class="muted small">FINN reads the last ' + (calls.length || 4) + ' earnings-call transcripts, pulls out every explicit promise on growth, margins and capex, and checks it against the numbers the company later reported.</div>';
    if (!calls.length) return h + '<div class="empty">No concall transcripts are listed for this company.</div></div>' + sourcesCard(c);
    h += '<div class="chips" style="margin-top:10px">' + calls.map((x) => link(x.transcript, esc(x.label), 'chip')).join('') + '</div>';
    if (!FINN.ai.enabled()) return h + '<div class="warn-card card" style="margin-top:12px">Add a free Gemini (or OpenAI) key in <button class="mini" data-go="portfolio">Settings</button> to run this check.</div></div>';
    if (!g.status) h += '<button class="primary wide" data-gt="' + c.sym + '">Run check on ' + calls.length + ' calls</button>';
    if (g.status === 'run') h += '<ul class="steps">' + g.steps.map((s, i) => '<li class="' + (i === g.steps.length - 1 ? 'run' : 'done') + '">' + esc(s) + '</li>').join('') + '</ul>';
    if (g.status === 'error') h += '<div class="warn-card card" style="margin-top:12px">' + esc(g.error) + '</div><button class="mini" data-gt="' + c.sym + '">Try again</button>';
    h += '</div>';
    if (g.status === 'done') {
      const r = g.result;
      const cnt = { met: 0, partial: 0, missed: 0, pending: 0 };
      r.rows.forEach((x) => { cnt[x.verdict]++; });
      const n = r.rows.length || 1;
      h += '<div class="card"><div class="row between"><div class="card-t" style="margin:0">Management credibility</div><span class="cred c-' + esc(r.credibility) + '">' + esc(String(r.credibility).toUpperCase()) + '</span></div>' +
        '<div class="scorebar">' + ['met', 'partial', 'missed', 'pending'].map((k) => '<span class="v-' + k + 'b" style="width:' + (cnt[k] / n * 100) + '%"></span>').join('') + '</div>' +
        '<div class="legend">' + ['met', 'partial', 'missed', 'pending'].map((k) => '<span><i class="dot v-' + k + 'b"></i>' + k + ' ' + cnt[k] + '</span>').join('') + '</div>' +
        '<div class="take">' + esc(r.takeaway) + '</div></div>';
      h += '<div class="card">' + r.rows.map((x) => '<div class="pv"><div class="row between"><span class="muted xsmall num">SAID IN ' + esc(String(x.said || '').toUpperCase()) + '</span><span class="tag v-' + x.verdict + '">' + x.verdict + '</span></div><div class="qt">' + esc(x.metric) + '</div>' +
        '<div class="cols"><div><div class="muted xsmall">PROMISED</div><div class="small">' + esc(x.promised) + '</div></div><div><div class="muted xsmall">DELIVERED</div><div class="small">' + esc(x.delivered) + '</div></div></div>' +
        (x.why ? '<div class="muted small" style="margin-top:6px">' + esc(x.why) + '</div>' : '') + '</div>').join('') +
        '<div class="muted xsmall">Extraction: ' + esc(FINN.ai.cfg().fast) + ' · judgment: ' + esc(FINN.ai.cfg().smart) + ' · transcripts cached on device</div></div>';
    }
    return h;
  }

  async function runGT(sym) {
    const c = S.companies[sym];
    const g = S.gt[sym] = { status: 'run', steps: ['Collecting transcripts'] };
    render();
    try {
      g.result = await FINN.ai.trackGuidance(c, (s) => { g.steps.push(s); render(); });
      g.status = 'done';
    } catch (e) { g.status = 'error'; g.error = e.message; }
    render();
  }

  const SUGGEST = ['Is growth translating into cash?', 'What did management promise on margins?', 'Biggest risk in these numbers?', 'Why did profit move last quarter?'];
  function tabAsk(c) {
    const chat = S.chat[c.sym] || [];
    let h = '<div class="card"><div class="card-t">Ask FINN about ' + esc(c.sym) + '</div><div class="muted small">Answers use only this company\'s reported numbers' + (S.gt[c.sym] && S.gt[c.sym].result ? ' and its concall guidance' : ' (run Said vs Done to add concall context)') + '.</div>';
    if (!FINN.ai.enabled()) return h + '<div class="warn-card card" style="margin-top:12px">Add a free Gemini (or OpenAI) key in <button class="mini" data-go="portfolio">Settings</button> to chat.</div></div>';
    if (!chat.length) h += '<div class="chips" style="margin-top:10px">' + SUGGEST.map((q) => '<button class="chip" data-ask="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>';
    h += '</div><div class="chat">' + chat.map((m) => '<div class="msg ' + m.who + '">' + esc(m.text) + '</div>').join('') + '</div>' +
      '<form class="askbar" data-askform="' + c.sym + '"><input id="askInput" placeholder="Ask a question…" autocomplete="off" /><button class="primary" type="submit">Ask</button></form>';
    return h;
  }
  async function doAsk(sym, q) {
    if (!q.trim()) return;
    const c = S.companies[sym];
    const chat = S.chat[sym] = S.chat[sym] || [];
    const hist = chat.slice();
    chat.push({ who: 'me', text: q.trim() });
    chat.push({ who: 'ai', text: '…' });
    render();
    let a;
    try { a = await FINN.ai.ask(c, q, hist); } catch (e) { a = 'Couldn\'t answer: ' + e.message; }
    chat[chat.length - 1] = { who: 'ai', text: a };
    render();
  }

  // ---------- views: PORTFOLIO ----------
  // ---------- diagnostics: test every live dependency on this device ----------
  async function runDiagnostics() {
    const D = S.diag = { running: true, rows: [] };
    render();
    const step = async (name, fn) => {
      const row = { name, state: 'run' };
      D.rows.push(row); render();
      const t0 = Date.now();
      try { row.detail = await fn(); row.state = 'ok'; } catch (e) { row.state = 'fail'; row.detail = String(e && e.message || e).slice(0, 160); }
      row.ms = Date.now() - t0; render();
    };
    let rel = null;
    await step('Native network bridge', async () => { if (!FINN.hasNative()) throw new Error('Not available (running outside the Android app)'); return 'active'; });
    await step('Company financials', async () => { rel = await FINN.getCompany('RELIANCE', true); const q = FINN.quarterCard(rel); return rel.name + ' · latest ' + (q ? q.period : '—') + ' · ' + rel.annualReports.length + ' annual reports · ' + rel.concalls.length + ' concalls'; });
    await step('Company search', async () => { const r = await FINN.search('tata motors'); if (!r.length) throw new Error('no results'); return r.length + ' matches · ' + r.slice(0, 3).map((x) => x.sym).join(', '); });
    await step('Renamed ticker (ZOMATO)', async () => { const c = await FINN.getCompany('ZOMATO', true); return 'resolves to ' + c.sym; });
    await step('NSE announcements', async () => { const l = await FINN.nseFilings((rel && rel.nseSymbol) || 'RELIANCE'); if (!l.length) throw new Error('empty'); return l.length + ' filings · latest ' + new Date(l[0].date).toLocaleString('en-IN'); });
    await step('BSE announcements', async () => { const l = await FINN.bseFilings((rel && rel.bseCode) || '500325'); if (!l.length) throw new Error('empty'); return l.length + ' filings · latest ' + new Date(l[0].date).toLocaleString('en-IN'); });
    await step('End-of-day prices', async () => { const e = await FINN.getEOD('RELIANCE', rel && rel.companyId, true); return '₹' + n2(e.close) + ' (' + sp(e.chg) + ') · ' + new Date(e.date).toDateString(); });
    await step('News search', async () => { const r = await FINN.webSearch.news('Reliance Industries share', 3); if (!r.length) throw new Error('no results'); return r.length + ' headlines · ' + (r[0].publisher || ''); });
    await step('Web search', async () => { const r = await FINN.webSearch.web('Reliance Industries investor relations', 3); if (!r.length) throw new Error('no results (site may be blocking)'); return r.length + ' results'; });
    await step('PDF reading (concall transcript)', async () => {
      const t = rel && rel.concalls.find((x) => x.transcript);
      if (!t) throw new Error('no transcript link to test');
      const txt = await FINN.ai.pdfText(t.transcript, 2);
      if (txt.length < 100) throw new Error('PDF had no readable text');
      return txt.length.toLocaleString('en-IN') + ' characters from ' + t.label;
    });
    await step('AI', async () => { const r = await FINN.ai.ping(); if (!r.ok) throw new Error(r.lines.join(' | ')); return r.lines.join(' | '); });
    D.running = false; D.at = Date.now(); render();
  }
  function diagCard() {
    const D = S.diag;
    let h = '<div class="section">DIAGNOSTICS</div><div class="card"><div class="muted small">Tests every live data source and the AI from this phone.</div>';
    if (D) {
      h += D.rows.map((r) => '<div class="flag f-' + (r.state === 'ok' ? 'pass' : r.state === 'fail' ? 'fail' : 'warn') + '"><span class="fi">' + (r.state === 'ok' ? '✓' : r.state === 'fail' ? '✕' : '…') + '</span><div><div class="qt">' + esc(r.name) +
        (r.ms != null ? ' <span class="muted xsmall">' + r.ms + ' ms</span>' : '') + '</div><div class="muted small">' + esc(r.detail || (r.state === 'run' ? 'checking…' : '')) + '</div></div></div>').join('');
    }
    h += '<div class="f-actions"><button class="pill" data-act="diag" ' + (D && D.running ? 'disabled' : '') + '>' + (D && D.running ? 'Running…' : D ? 'Run again' : 'Run diagnostics') + '</button>' +
      (D && !D.running ? '<button class="mini" data-act="copydiag">Copy report</button>' : '') + '</div></div>';
    return h;
  }

  const ALERT_CATS = [['results', 'Results'], ['management_change', 'Management'], ['M&A', 'M&A'], ['fund_raise', 'Fund raise'], ['litigation', 'Litigation'],
    ['credit_rating', 'Ratings'], ['pledging', 'Pledging'], ['insider_trading', 'Insider trades'], ['capex', 'Capex'], ['press_release', 'Orders & news'], ['dividend', 'Dividends']];

  function viewPortfolio() {
    const st = FINN.settings();
    let h = '<section class="hero"><div class="hello">Portfolio health</div><div class="hero-sub">' + S.portfolio.length + ' holdings · each graded on the five FINN pillars</div></section>';
    h += '<div class="legendrow"><span>Growth</span><span>Returns</span><span>Cash</span><span>Leverage</span><span>Owners</span></div>';
    h += '<div class="card flat-card">' + S.portfolio.map((sym) => {
      const c = S.companies[sym], e = S.eod[sym];
      const sc = c ? FINN.score(c) : null;
      return '<div class="hrow">' + (S.editPortfolio ? '<button class="rm" data-remove="' + sym + '">−</button>' : '') +
        '<button class="hmain" data-go="c/' + sym + '"><div><div class="tk">' + sym + (tripStatus(sym).some((t) => t.hit) ? ' <span class="tripmark">⚑</span>' : '') + '</div><div class="muted xsmall">' + (e ? '₹' + n2(e.close) : S.errors[sym] ? 'unavailable' : '…') + '</div></div>' +
        (e ? badge(e.chg) : '<span></span>') + '<div class="hdots">' + (sc ? sc.map((p) => '<span class="hd g-' + p.grade + '" title="' + p.label + '"></span>').join('') : '<span class="muted xsmall">loading</span>') + '</div></button></div>';
    }).join('') + '</div>';
    h += '<div class="row between"><button class="mini" data-act="edit">' + (S.editPortfolio ? 'Done' : 'Edit holdings') + '</button><button class="mini" data-act="rescan">Refresh all</button></div>';
    h += '<div class="section">ADD A HOLDING</div>' + searchBox('qp', 'Search any NSE/BSE company');

    const p = FINN.ai.PROVIDERS;
    h += '<div class="section">SETTINGS</div><div class="card settings">' +
      '<div class="card-t">Alerts</div><label>Price move ≥ <input type="number" id="setPrice" step="0.5" min="1" value="' + st.priceX + '"> % in a day</label>' +
      '<label>Volume ≥ <input type="number" id="setVol" step="0.1" min="1" value="' + st.volX + '"> × 20-day average</label>' +
      '<div class="card-t" style="margin-top:14px">Alert me on these filings</div><div class="chips">' + ALERT_CATS.map((k) => '<button class="chip ' + ((st.alertCats || []).indexOf(k[0]) >= 0 ? 'on' : '') + '" data-alertcat="' + esc(k[0]) + '">' + k[1] + '</button>').join('') + '</div>' +
      '<div class="muted xsmall">Matching filings get ⚡ and jump into your brief.</div>' +
      '<div class="card-t" style="margin-top:14px">Background alerts</div><div class="seg wide">' + [[0, 'Off'], [5, '5 min'], [15, '15 min'], [30, '30 min'], [60, '1 hr']].map((o) => '<button class="' + ((st.watchOn === false ? 0 : Number(st.watchMin) || 15) === o[0] ? 'on' : '') + '" data-watch="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>' +
      '<div class="muted xsmall">FINN re-checks filings, prices and tripwires on this schedule while the app is open or in the background, and sends a phone notification the moment something new crosses a line. <button class="mini" data-act="testalert">Send test alert</button></div>' +
      '<div class="card-t" style="margin-top:14px">Data freshness</div><div class="muted xsmall">Reuse downloaded data for…</div><div class="seg wide">' + CACHE_OPTS.map((o) => '<button class="' + (Number(st.cacheSec) === o[0] ? 'on' : '') + '" data-cache="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>' +
      '<div class="muted xsmall">Shorter = always live; longer = faster and lighter on data. Pull down on any screen to reload now.</div>' +
      '<div class="card-t" style="margin-top:14px">AI</div><div class="seg wide">' + Object.keys(p).map((k) => '<button class="' + (st.provider === k ? 'on' : '') + '" data-provider="' + k + '">' + p[k].label + '</button>').join('') + '</div>' +
      '<div class="muted xsmall" style="margin-top:10px">ASK FINN WEB SEARCH</div><div class="seg wide">' + [['finn', 'Free search'], ['google', 'Google grounding'], ['off', 'Off']].map((w) => '<button class="' + ((st.webMode || 'finn') === w[0] ? 'on' : '') + '" data-webmode="' + w[0] + '">' + w[1] + '</button>').join('') + '</div>' +
      '<div class="muted xsmall">Free search = Google News + DuckDuckGo, no quota. Google grounding uses your Gemini key\'s search quota (falls back automatically).</div>' +
      '<label class="col">API key<input type="password" id="setKey" value="' + esc(st.apiKey) + '" placeholder="' + (window.FINN_BUILTIN_KEY && !st.apiKey ? 'Using built-in demo key' : p[st.provider].keyHint) + '" autocomplete="off"></label>' +
      '<div class="muted xsmall">' + (st.provider === 'gemini' ? 'Free key: aistudio.google.com → Get API key.' : 'Key from platform.openai.com.') + ' Stored only on this phone. Cheap model extracts; stronger model judges.</div>' +
      '<label class="col">Backup AI key (free, used when Gemini hits a limit)<input type="password" id="setBackup" value="' + esc(st.backupKey || '') + '" placeholder="gsk_… (Groq)" autocomplete="off"></label>' +
      '<div class="muted xsmall">Free at console.groq.com → API Keys. No card needed. FINN picks the best available model.</div>' +
      '<details><summary class="muted small">Models</summary><label class="col">Extraction model<input id="setFast" value="' + esc(st.fastModel) + '" placeholder="Auto (' + esc(FINN.ai.cfg().fast) + ')"></label>' +
      '<label class="col">Reasoning model<input id="setSmart" value="' + esc(st.smartModel) + '" placeholder="Auto (' + esc(FINN.ai.cfg().smart) + ')"></label><div class="muted xsmall">Leave blank: FINN picks the newest Flash models your key can use.</div></details>' +
      '<button class="primary wide" data-act="savesettings">Save settings</button><button class="pill wide-pill" data-act="testai">Test AI connection</button>' +
      (S.aiTest ? '<div class="note ' + (S.aiTest.ok ? 'ok' : 'bad') + '">' + esc(S.aiTest.msg) + '</div>' : '') + '</div>';
    const u = FINN.ai.usage();
    const saved = u.cache;
    h += '<div class="section">AI EFFICIENCY · TODAY</div><div class="card"><div class="kv"><div><div class="muted xsmall">AI calls</div><div class="num kvv">' + u.calls + '</div></div>' +
      '<div><div class="muted xsmall">Tokens</div><div class="num kvv">' + ((u.inTok + u.outTok) / 1000).toFixed(1) + 'k</div></div><div><div class="muted xsmall">Calls saved by cache</div><div class="num kvv">' + saved + '</div></div></div>' +
      '<div class="muted xsmall" style="margin-top:10px">Routing: cheap model for extraction (' + u.tiers.fast + ' calls) · stronger model only for judgment (' + u.tiers.smart + ') · transcripts filtered to forward-looking sentences before the model sees them · numbers, scores, red flags and alerts computed in code (0 AI calls).</div>' +
      (Object.keys(u.models).length ? '<div class="chips" style="margin-top:8px">' + Object.keys(u.models).map((m) => '<span class="chip">' + esc(m) + ' × ' + u.models[m] + '</span>').join('') + '</div>' : '') + '</div>';
    h += diagCard();
    h += '<div class="muted xsmall center src">FINN · exchange filings (NSE/BSE), reported financials, annual reports & concall transcripts, Yahoo Finance EOD prices — cached on device.<br><button class="mini" data-act="clearcache">Clear cached data</button></div>';
    return h;
  }

  // ---------- Ask FINN: floating AI agent available on every screen ----------
  S.agent = { open: false, msgs: [], busy: false, ctxOn: true };
  const $agent = document.getElementById('agentHost');
  const $fab = document.getElementById('fab');

  function md(t, sources) {
    const cite = (x) => (sources && sources.length ? x.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (all, nums) => nums.split(/\s*,\s*/).map((n) => {
      const s = sources[+n - 1];
      return s ? '<a class="cite" href="' + esc(s.uri) + '" target="_blank">' + n + '</a>' : '';
    }).join('')) : x);
    const inline = (x) => cite(x).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a class="lnk" href="$2" target="_blank">$1</a>');
    const lines = esc(String(t || '')).split(/\n/);
    let h = '', list = null;
    const close = () => { if (list) { h += '</' + list + '>'; list = null; } };
    lines.forEach((ln) => {
      const b = ln.match(/^\s*[-*•]\s+(.*)/), n = ln.match(/^\s*\d+[.)]\s+(.*)/), hd = ln.match(/^\s*#{1,4}\s+(.*)/);
      if (b || n) { const tag = b ? 'ul' : 'ol'; if (list !== tag) { close(); h += '<' + tag + '>'; list = tag; } h += '<li>' + inline((b || n)[1]) + '</li>'; }
      else if (hd) { close(); h += '<div class="md-h">' + inline(hd[1]) + '</div>'; }
      else if (ln.trim()) { close(); h += '<p>' + inline(ln) + '</p>'; }
      else close();
    });
    close();
    return h;
  }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

  function agentContext() {
    const r = route();
    if (r.name === 'company' && S.companies[r.sym]) {
      const c = S.companies[r.sym], e = S.eod[r.sym];
      const fl = ((S.filings[r.sym] || {}).list || c.announcements || []).slice(0, 6).map((a) => '- ' + (a.date ? new Date(a.date).toDateString() : '') + ': ' + a.title + (a.summary ? ' — ' + a.summary : '')).join('\n');
      return { kind: 'company', sym: c.sym, label: c.sym, text: FINN.factSheet(c) + (c.about ? '\nAbout: ' + c.about : '') + (e ? '\nLast close ₹' + n2(e.close) + ' (' + sp(e.chg) + ' on the day, volume ' + (e.volX ? e.volX.toFixed(1) + '× avg' : 'n/a') + ')' : '') +
        '\nFINN Score: ' + FINN.score(c).map((p) => p.label + ' ' + p.value + ' (' + p.grade + ')').join(', ') + '\nRecent exchange filings:\n' + fl };
    }
    const rows = S.portfolio.map((sym) => {
      const c = S.companies[sym], e = S.eod[sym];
      if (!c) return sym;
      const q = FINN.quarterCard(c), pat = q && q.metrics.find((m) => m.name === 'PAT');
      return sym + ' (' + c.name + '): day ' + (e ? sp(e.chg) + ', vol ' + (e.volX ? e.volX.toFixed(1) + '×' : '-') : 'n/a') + '; latest qtr ' + (q ? q.period + ' PAT ' + sp(pat && pat.yoy) + ' YoY' : 'n/a') +
        '; score ' + FINN.score(c).map((p) => p.label[0] + ':' + p.grade).join(' ');
    });
    const fl = feed().filter((i) => i.prio !== 'low').slice(0, 12).map((i) => '- ' + i.sym + ' [' + i.label + '] ' + (i.summary || i.title)).join('\n');
    const filed = {};
    feed().filter((i) => i.prio !== 'low').forEach((i) => { filed[i.sym] = (filed[i.sym] || 0) + 1; });
    const score1 = (x) => (alertsFor(x) ? 2 : 0) + (filed[x] ? 1 : 0) + Math.abs((S.eod[x] || {}).chg || 0) / 10;
    const focus = S.portfolio.slice().sort((x, y) => score1(y) - score1(x));
    return { kind: 'portfolio', focus, label: 'Portfolio', text: 'Portfolio (' + S.portfolio.length + ' holdings):\n' + rows.join('\n') + '\nMaterial filings in the current window:\n' + (fl || 'none') };
  }

  function agentSuggestions() {
    const r = route();
    if (r.name === 'company') { const s = r.sym; return ['Latest news on ' + s + '?', 'Why did ' + s + ' move today?', 'Explain ' + s + '\'s latest results simply', 'Who are ' + s + '\'s main competitors?']; }
    return ['What moved my portfolio today?', 'Any big news on my holdings this week?', 'Which holding has the weakest cash conversion?', 'Explain EBITDA vs PAT in simple words'];
  }

  function renderAgent() {
    const a = S.agent;
    $fab.hidden = a.open || S.intro || !!S.memo || !!S.gl;
    if (!a.open) { $agent.innerHTML = ''; return; }
    const ctx = agentContext();
    const cfg = FINN.ai.cfg();
    const anim = a.justOpened ? ' anim' : '';
    a.justOpened = false;
    let h = '<div class="agent-bg' + anim + '"><section class="agent' + anim + '" role="dialog" aria-label="Ask FINN">' +
      '<header class="ag-head"><span class="ag-ava">✦</span><div class="ag-ti"><b>Ask FINN</b><span class="muted xsmall">' + ({ finn: 'Web & news search + your FINN data', google: 'Google Search + your FINN data', off: 'Your FINN data' }[FINN.settings().webMode] || 'Your FINN data') + '</span></div>' +
      (a.msgs.length ? '<button class="icon-btn" data-act="agentclear" aria-label="New chat">⟲</button>' : '') + '<button class="icon-btn" data-act="agentclose" aria-label="Close">✕</button></header>' +
      '<div class="ag-ctx"><button class="ctxchip ' + (a.ctxOn ? 'on' : '') + '" data-act="agentctx">' + (a.ctxOn ? '✓ ' : '+ ') + 'Using ' + esc(ctx.label) + ' data</button></div>' +
      '<div class="ag-body" id="agBody">';
    if (!FINN.ai.enabled()) h += '<div class="ag-empty"><div class="ag-big">✦</div><p>Add a free Gemini key in <button class="mini" data-act="agentsettings">Settings</button> to chat.</p></div>';
    else if (!a.msgs.length) {
      h += '<div class="ag-empty"><div class="ag-big">✦</div><div class="ag-hello">What do you want to know?</div><p class="muted small">Ask about any company, market news, a filing, or a term. FINN searches the web and checks your data.</p>' +
        '<div class="ag-sugg">' + agentSuggestions().map((q) => '<button data-agentq="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div></div>';
    }
    a.msgs.forEach((m, i) => {
      if (m.who === 'me') h += '<div class="bub me">' + esc(m.text) + '</div>';
      else if (m.err) h += '<div class="bub ai err">' + esc(m.text) + ' <button class="mini" data-act="agentretry">Retry</button>' +
        (m.detail ? '<details class="errd"><summary class="muted xsmall">Details</summary><div class="muted xsmall">' + esc(m.detail.slice(0, 400)) + '</div></details>' : '') + '</div>';
      else {
        h += '<div class="bub ai">' + md(m.text, m.sources);
        if (m.sources && m.sources.length) {
          const seen = {};
          h += '<div class="srcs">' + m.sources.map((s, k) => ({ s, k })).filter((x) => (seen[x.s.uri] ? false : (seen[x.s.uri] = 1))).slice(0, 10).map(({ s, k }) => '<a class="srcchip" href="' + esc(s.uri) + '" target="_blank"><span class="sn">' + (k + 1) + '</span>' + esc((s.title || host(s.uri)).slice(0, 34)) + '</a>').join('') + '</div>';
        }
        if (m.queries && m.queries.length) h += '<div class="muted xsmall ag-q">Searched: ' + m.queries.slice(0, 3).map(esc).join(' · ') + '</div>';
        h += '</div>';
      }
    });
    if (a.busy) h += '<div class="bub ai typing"><i></i><i></i><i></i><span class="muted xsmall">' + esc(a.step || 'Thinking') + '…</span></div>';
    h += '</div><form class="ag-input" id="agentForm"><input id="agentInput" placeholder="Ask anything…" autocomplete="off" ' + (FINN.ai.enabled() ? '' : 'disabled') + '/>' +
      '<button type="submit" class="ag-send" aria-label="Send" ' + (a.busy || !FINN.ai.enabled() ? 'disabled' : '') + '>➤</button></form></section></div>';
    const keep = document.activeElement && document.activeElement.id === 'agentInput' ? document.getElementById('agentInput').value : null;
    $agent.innerHTML = h;
    const body = document.getElementById('agBody');
    if (body) body.scrollTop = body.scrollHeight;
    if (keep != null) { const inp = document.getElementById('agentInput'); inp.value = keep; inp.focus(); }
  }

  function openAgent() {
    if (S.agent.open) return;
    S.agent.open = true;
    S.agent.justOpened = true;
    try { history.pushState({ agent: 1 }, ''); } catch (e) { /* ignore */ }
    renderAgent();
    setTimeout(() => { const i = document.getElementById('agentInput'); if (i && !S.agent.msgs.length) i.focus(); }, 250);
  }
  function closeAgent(fromPop) {
    if (!S.agent.open) return;
    S.agent.open = false;
    renderAgent();
    if (!fromPop) { try { if (history.state && history.state.agent) history.back(); } catch (e) { /* ignore */ } }
  }
  window.addEventListener('popstate', () => { if (S.agent.open) closeAgent(true); });

  async function askAgent(q) {
    q = String(q || '').trim();
    if (!q || S.agent.busy) return;
    const a = S.agent;
    const hist = a.msgs.filter((m) => !m.err);
    a.msgs = hist.concat([{ who: 'me', text: q }]);
    a.busy = true; a.last = q; renderAgent();
    try {
      const info = agentContext();
      a.step = 'Thinking';
      const r = await FINN.ai.agent(q, hist, a.ctxOn ? info.text : '', info, (st) => { a.step = st; renderAgent(); });
      a.msgs.push({ who: 'ai', text: r.text || 'No answer.', sources: r.sources, queries: r.queries, model: r.model });
    } catch (e) {
      a.msgs.push({ who: 'ai', err: true, text: 'Couldn\'t answer: ' + e.message, detail: e.detail || '' });
    }
    a.busy = false; a.step = null; renderAgent();
  }

  // ---------- router ----------
  function route() {
    const hsh = location.hash.replace(/^#\/?/, '');
    const parts = hsh.split('/');
    if (parts[0] === 'c' && parts[1]) return { name: 'company', sym: decodeURIComponent(parts[1]).toUpperCase(), tab: parts[2] };
    if (['research', 'portfolio'].indexOf(parts[0]) >= 0) return { name: parts[0] };
    return { name: 'today' };
  }
  function go(h) { if (location.hash === '#' + h) render(); else location.hash = h; }

  function render() {
    const r = route();
    const active = r.name === 'company' ? 'research' : r.name;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === active));
    document.getElementById('backBtn').hidden = r.name !== 'company';
    const focusId = document.activeElement && document.activeElement.id;
    const caret = focusId && document.activeElement.selectionStart;
    if (r.name === 'today') { $title.textContent = 'FINN'; $sub.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }); $view.innerHTML = viewToday(); }
    else if (r.name === 'research') { $title.textContent = 'Research'; $sub.textContent = 'Pull'; $view.innerHTML = viewResearch(); }
    else if (r.name === 'portfolio') { $title.textContent = 'Portfolio'; $sub.textContent = 'Holdings & settings'; $view.innerHTML = viewPortfolio(); }
    else { $title.textContent = r.sym; $sub.textContent = 'Company'; $view.innerHTML = viewCompany(r.sym, r.tab); }
    document.getElementById('sheetHost').innerHTML = S.intro ? introSheet() : S.gl ? glSheet() : memoSheet();
    if (S.agent && !S.agent.open) $fab.hidden = !!(S.intro || S.memo || S.gl);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* ignore */ } } }
  }

  function onRoute() {
    const r = route();
    if (r.name === 'company') openCompany(r.sym);
    render();
    window.scrollTo(0, 0);
  }

  // ---------- search (debounced, any listing) ----------
  let searchTimer = null, searchSeq = 0;
  function onSearchInput(v) {
    S.search.q = v; S.search.error = null;
    clearTimeout(searchTimer);
    if (v.trim().length < 2) { S.search.results = []; render(); return; }
    // Instant local matches from the portfolio while the network search runs.
    const local = S.portfolio.filter((s) => s.toLowerCase().indexOf(v.toLowerCase()) >= 0).map((s) => ({ sym: s, name: (S.companies[s] || {}).name || s, path: '' }));
    S.search.results = local; S.search.loading = true; render();
    searchTimer = setTimeout(async () => {
      const seq = ++searchSeq;
      try {
        const res = await FINN.search(v.trim());
        if (seq !== searchSeq) return;
        const seen = {};
        S.search.results = res.concat(local).filter((r) => (seen[r.sym] ? false : (seen[r.sym] = true)));
      } catch (e) { if (seq === searchSeq && !S.search.results.length) S.search.error = 'Search unavailable (' + e.message + '). Type an exact ticker and press enter.'; }
      if (seq === searchSeq) { S.search.loading = false; render(); }
    }, 250);
  }

  function togglePortfolio(sym, path) {
    if (path) FINN.rememberPath(sym, path);
    const i = S.portfolio.indexOf(sym);
    if (i >= 0) S.portfolio.splice(i, 1);
    else {
      S.portfolio.push(sym);
      FINN.getCompany(sym).then((c) => { S.companies[sym] = c; return FINN.getEOD(sym, c.companyId); }).then((e) => { S.eod[sym] = e; render(); }).catch(() => render());
    }
    savePortfolio();
    render();
  }

  // ---------- events (delegated) ----------
  document.addEventListener('click', (ev) => {
    if (ev.target.classList && ev.target.classList.contains('sheet-bg') && !S.intro) { S.memo = null; S.gl = null; render(); return; }
    if (ev.target.classList && ev.target.classList.contains('agent-bg')) { closeAgent(); return; }
    const t = ev.target.closest('button, a');
    if (!t) return;
    const d = t.dataset;
    if (t.classList.contains('tab')) { go(t.dataset.tab === 'today' ? 'today' : t.dataset.tab); return; }
    if (t.id === 'fab' || t.id === 'tileAgent') { openAgent(); return; }
    if (d.agentq) { askAgent(d.agentq); return; }
    if (t.id === 'backBtn') { history.length > 1 ? history.back() : go('research'); return; }
    if (t.id === 'refreshBtn') { t.classList.add('spin'); setTimeout(() => t.classList.remove('spin'), 900); refreshNow(); return; }
    if (d.go) { go(d.go); return; }
    if (d.pick) { if (d.path) FINN.rememberPath(d.pick, d.path); S.search = { q: '', results: [], loading: false }; go('c/' + d.pick); return; }
    if (d.toggle) { togglePortfolio(d.toggle, d.path); return; }
    if (d.win) { S.windowD = d.win === 'new' || d.win === 'custom' ? d.win : Number(d.win); render(); return; }
    if (d.gl) { S.gl = d.gl; render(); return; }
    if (d.alertcat) {
      const st = FINN.settings(); const a = st.alertCats || []; const k = a.indexOf(d.alertcat);
      if (k >= 0) a.splice(k, 1); else a.push(d.alertcat);
      st.alertCats = a; store.set('finn.settings', st); render(); return;
    }
    if (d.bb) { runBB(d.bb); return; }
    if (d.biz) { runAI(S.biz, d.biz, FINN.ai.businessSnapshot); return; }
    if (d.guid) { runAI(S.guid, d.guid, FINN.ai.latestGuidance); return; }
    if (d.readres) {
      const f = findFiling(d.readres);
      if (!f || S.rfBusy[f.sym]) return;
      S.rfBusy[f.sym] = true; render();
      FINN.ai.readResults(f, f.c).then((res) => { S.rf[f.sym] = { res }; }, (e) => { S.rf[f.sym] = { err: 'Couldn\'t read the filing: ' + e.message }; })
        .then(() => { S.rfBusy[f.sym] = false; render(); });
      return;
    }
    if (d.prof) {
      const f = findFiling(d.prof);
      if (!f) return;
      S.prof[d.prof] = { busy: true }; render();
      FINN.ai.readProfile(f, f.c).then((res) => { S.prof[d.prof] = { res }; }, (e) => { S.prof[d.prof] = { err: e.message }; }).then(render);
      return;
    }
    if (d.filter) { S.filter = d.filter; render(); return; }
    if (d.ctab) { const p = d.ctab.split('/'); S.open[p[0]].tab = p[1]; history.replaceState(null, '', '#c/' + p[0] + '/' + p[1]); render(); return; }
    if (d.fin) { const p = d.fin.split('/'); S.open[p[0]].fin = p[1]; render(); return; }
    if (d.expand) { S.expand[d.expand] = !S.expand[d.expand]; render(); return; }
    if (d.reload) { openCompany(d.reload, true); return; }
    if (d.gt) { runGT(d.gt); return; }
    if (d.ask) { doAsk(route().sym, d.ask); return; }
    if (d.remove) { togglePortfolio(d.remove); return; }
    if (d.watch != null && d.watch !== undefined && t.dataset.watch !== undefined) {
      const s2 = FINN.settings(); const v = Number(d.watch);
      s2.watchOn = v > 0; if (v > 0) s2.watchMin = v; store.set('finn.settings', s2); startWatcher(); render(); return;
    }
    if (d.webmode) { const s = FINN.settings(); s.webMode = d.webmode; store.set('finn.settings', s); render(); return; }
    if (d.cache) { const s = FINN.settings(); s.cacheSec = Number(d.cache); store.set('finn.settings', s); render(); return; }
    if (d.memo) { S.memo = memoText(S.companies[d.memo]); render(); return; }
    if (d.addtrip) {
      const v = parseFloat(document.getElementById('tv').value);
      const m = document.getElementById('tm').value, op = document.getElementById('top').value === '>' ? '>' : '<';
      S.tripForm[d.addtrip] = { m, op, v: '' };
      if (isNaN(v)) { S.tripForm[d.addtrip].v = ''; document.getElementById('tv').focus(); return; }
      (S.trips[d.addtrip] = S.trips[d.addtrip] || []).push({ m, op, v });
      saveTrips(); render(); return;
    }
    if (d.rmtrip) { const p = d.rmtrip.split('/'); S.trips[p[0]].splice(Number(p[1]), 1); saveTrips(); render(); return; }
    if (d.provider) { const s = FINN.settings(); s.provider = d.provider; s.fastModel = ''; s.smartModel = ''; store.set('finn.settings', s); render(); return; }
    if (d.explain) {
      const it = feed().find((x) => x.id === d.explain);
      if (it) { S.notes[it.id] = '…'; render(); FINN.ai.explainFiling(it, it.c.name).then((n) => { S.notes[it.id] = n; render(); }, (e) => { S.notes[it.id] = e.message; render(); }); }
      return;
    }
    switch (d.act) {
      case 'closememo': S.memo = null; render(); break;
      case 'testalert': deliver({ sym: S.portfolio[0] || 'RELIANCE', title: 'FINN test alert', body: 'Notifications are working. Real alerts arrive when a filing type you chose, a price/volume threshold or a tripwire is crossed.' }, 3); t.textContent = 'Sent ✓'; break;
      case 'diag': if (route().name !== 'portfolio') go('portfolio'); if (!(S.diag && S.diag.running)) runDiagnostics(); break;
      case 'copydiag': copyText('FINN diagnostics ' + new Date(S.diag.at).toLocaleString('en-IN') + (FINN.hasNative() ? ' (app)' : ' (browser)') + '\n' + S.diag.rows.map((r) => (r.state === 'ok' ? '✓ ' : '✕ ') + r.name + ': ' + r.detail + ' [' + r.ms + 'ms]').join('\n')); t.textContent = 'Copied ✓'; break;
      case 'closegl': S.gl = null; render(); break;
      case 'agentclose': closeAgent(); break;
      case 'testai':
        S.aiTest = { ok: true, msg: 'Testing…' }; render();
        FINN.ai.ping().then((r) => { S.aiTest = { ok: r.ok, msg: r.lines.join('\n') }; }, (e) => { S.aiTest = { ok: false, msg: '✕ ' + e.message }; }).then(render);
        break;
      case 'agentclear': S.agent.msgs = []; renderAgent(); break;
      case 'agentctx': S.agent.ctxOn = !S.agent.ctxOn; renderAgent(); break;
      case 'agentretry': S.agent.msgs = S.agent.msgs.filter((m) => !m.err); if (S.agent.msgs.length && S.agent.msgs[S.agent.msgs.length - 1].who === 'me') S.agent.msgs.pop(); askAgent(S.agent.last); break;
      case 'agentsettings': closeAgent(); go('portfolio'); break;
      case 'intronext': if ((S.introStep || 0) >= INTRO.length - 1) { S.intro = false; store.set('finn.introDone', true); } else S.introStep = (S.introStep || 0) + 1; render(); break;
      case 'introdone': S.intro = false; store.set('finn.introDone', true); render(); break;
      case 'copymemo': copyText(S.memo); t.textContent = 'Copied ✓'; break;
      case 'markread': feed().forEach((i) => { S.seen[i.id] = 1; }); store.set('finn.seen', S.seen); render(); break;
      case 'routine': S.showRoutine = !S.showRoutine; render(); break;
      case 'rescan': scan(true); break;
      case 'edit': S.editPortfolio = !S.editPortfolio; render(); break;
      case 'clearsearch': S.search = { q: '', results: [], loading: false }; render(); break;
      case 'clearcache': store.clearPrefix('finn.c.'); store.clearPrefix('finn.gt.'); store.clearPrefix('finn.g.'); scan(true); break;
      case 'savesettings': {
        const s = FINN.settings();
        const pr = parseFloat(document.getElementById('setPrice').value), vo = parseFloat(document.getElementById('setVol').value);
        s.priceX = pr > 0 ? pr : 4; s.volX = vo > 0 ? vo : 2;
        s.apiKey = document.getElementById('setKey').value.trim();
        s.backupKey = document.getElementById('setBackup').value.trim();
        s.fastModel = document.getElementById('setFast').value.trim();
        s.smartModel = document.getElementById('setSmart').value.trim();
        store.set('finn.settings', s);
        t.textContent = 'Saved ✓';
        setTimeout(render, 700);
        break;
      }
      default: break;
    }
  });

  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'dFrom' || ev.target.id === 'dTo') {
      const v = ev.target.value;
      if (!v) return;
      if (ev.target.id === 'dFrom') S.custom.from = v; else S.custom.to = v;
      if (S.custom.from > S.custom.to) { const x = S.custom.from; S.custom.from = S.custom.to; S.custom.to = x; }
      render();
    }
  });
  document.addEventListener('input', (ev) => { if (ev.target.id === 'q' || ev.target.id === 'qp') onSearchInput(ev.target.value); });
  document.addEventListener('keydown', (ev) => {
    if ((ev.target.id === 'q' || ev.target.id === 'qp') && ev.key === 'Enter') {
      const v = ev.target.value.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
      if (!v) return;
      ev.target.blur();
      const first = S.search.results[0];
      if (first && (first.sym === v || first.name.toUpperCase().indexOf(v) === 0)) { if (first.path) FINN.rememberPath(first.sym, first.path); S.search = { q: '', results: [], loading: false }; go('c/' + first.sym); }
      else { S.search = { q: '', results: [], loading: false }; go('c/' + v.replace(/\s+/g, '')); }
    }
  });
  document.addEventListener('submit', (ev) => {
    if (ev.target.id === 'agentForm') {
      ev.preventDefault();
      const inp = document.getElementById('agentInput');
      const q = inp.value; inp.value = '';
      askAgent(q);
      return;
    }
    const f = ev.target.closest('[data-askform]');
    if (!f) return;
    ev.preventDefault();
    const inp = document.getElementById('askInput');
    const q = inp.value; inp.value = ''; inp.blur();
    doAsk(f.dataset.askform, q);
  });

  function copyText(txt) {
    const legacy = () => { const ta2 = document.createElement('textarea'); ta2.value = txt; document.body.appendChild(ta2); ta2.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta2.remove(); };
    try { if (navigator.clipboard) { navigator.clipboard.writeText(txt).catch(legacy); return; } } catch (e) { /* fall back */ }
    legacy();
  }

  function findFiling(id) {
    const syms = Object.keys(S.companies);
    for (let k = 0; k < syms.length; k++) {
      const c = S.companies[syms[k]];
      const lists = [(S.filings[c.sym] || {}).list || [], c.announcements || []];
      for (let j = 0; j < lists.length; j++) {
        const hit = lists[j].find((a, n) => (a.href || a.title) === id || (a.href || c.sym + n + a.title) === id);
        if (hit) return Object.assign({ sym: c.sym, c, id }, hit);
      }
    }
    return null;
  }

  // "New" window = since the previous visit.
  store.set('finn.lastVisit', Date.now());
  document.addEventListener('visibilitychange', () => { if (document.hidden) store.set('finn.lastVisit', Date.now()); });

  function refreshNow() { const r = route(); if (r.name === 'company') openCompany(r.sym, true); else scan(true); }

  // Pull-to-refresh
  const ptr = document.getElementById('ptr');
  let y0 = null, pulled = 0;
  document.addEventListener('touchstart', (e) => { y0 = window.scrollY <= 0 && !S.memo && !S.agent.open && !S.gl ? e.touches[0].clientY : null; pulled = 0; }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    pulled = Math.max(0, Math.min(110, e.touches[0].clientY - y0));
    ptr.style.height = pulled * 0.6 + 'px'; ptr.classList.toggle('ready', pulled > 70);
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (y0 != null && pulled > 70) refreshNow();
    y0 = null; ptr.style.height = '0px'; ptr.classList.remove('ready');
  });

  // Live "updated Xs ago" labels
  setInterval(() => {
    document.querySelectorAll('[data-ago-t]').forEach((el) => {
      const s = Math.round((Date.now() - Number(el.dataset.agoT)) / 1000);
      el.textContent = s < 5 ? 'just now' : s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago';
    });
  }, 1000);

  // Coming back to the app: refresh if data is older than the cache window
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.scan.at && Date.now() - S.scan.at > FINN.ttl()) scan(false);
  });

  window.addEventListener('hashchange', onRoute);
  startWatcher();
  onRoute();
  scan(false);
})(window.FINN = window.FINN || {});
