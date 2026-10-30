/* FINN analysis: announcement triage, results scorecards, FINN Score, forensic red flags. */
(function (FINN) {
  'use strict';
  const row = FINN.row;

  // ---------- announcement classification (categories from the ENAM reference doc) ----------
  const RULES = [
    ['results', /^(financial results?|result|results? updates?|financial result updates|integrated filing[- ]+financial)\b/],
    ['litigation', /action\(s\) initiated|orders? passed|regulatory action|show cause/],
    ['press_release', /^spurt in (price|volume)|^clarification/],
    ['unclassified', /auditor|\besop|\besos|esps|compliance certificate|newspaper (publication|advertisement)|loss of share|duplicate share|trading window|regulation 74|reg\.? 74|certificate under|book closure|change in (registrar|rta)|investor complaints|structured digital database|cyber ?security incident report|statement of deviation|copy of newspaper/],
    ['pledging', /pledge|encumbrance/],
    ['insider_trading', /regulation 7\s*\(2\)|reg\.? 7\(2\)|insider trading|substantial acquisition|regulation 29|regulation 31|sast/],
    ['postal_ballot', /postal ballot/],
    ['agm_egm', /\bagm\b|\begm\b|annual general meeting|extra-?ordinary general meeting|general meeting/],
    ['earnings_call', /conference call|earnings call|con-?call|transcript|audio recording|call recording/],
    ['investor_meetings', /analysts?\s*\/?\s*(institutional )?investor|investor meet|analyst meet|schedule of (analyst|investor)|non-deal roadshow/],
    ['results', /financial results|results for the (quarter|year|period)|quarterly results|unaudited|audited (standalone|consolidated|financial)|integrated filing.*financial|outcome of board meeting.*result|press release.*result/],
    ['management_change', /resign|appoint|cessation|change in (management|directorate|director|kmp|senior management)|chief (executive|financial|operating)|managing director|\bc[efo]o\b|whole[- ]time director|company secretary|re-?designat|retire/],
    ['M&A', /acqui|merger|amalgamation|demerger|joint venture|\bjv\b|scheme of arrangement|stake|wholly[- ]owned subsidiary|incorporation of|disinvest|divest|slump sale|business transfer/],
    ['fund_raise', /\bqip\b|qualified institution|rights issue|preferential|non-convertible debenture|\bncds?\b|commercial paper|fund ?rais|buy-?back|warrants|allotment of (equity|securities|debentures)/],
    ['litigation', /litigation|penalt|show cause|sebi order|court|tribunal|nclt|insolvency|\bfine\b|warning letter|usfda|form 483|tax demand|gst|search and seizure|regulatory action|arbitration|dispute|claim/],
    ['credit_rating', /credit rating|rating (action|update|reaffirm)|\bcrisil\b|\bicra\b|\bcare ratings\b|india ratings/],
    ['dividend', /dividend|record date/],
    ['bonus_split', /bonus|stock split|sub-?division of (equity )?shares/],
    ['capex', /capacity|expansion|new (plant|facility|unit)|commission(ed|ing)|capex|greenfield|brownfield|capital expenditure/],
    ['press_release', /order|contract|letter of (award|intent)|launch|partnership|tie-?up|clarification|press release|media release|update/],
    ['results', /board meeting|outcome of board/],
  ];

  const LABEL = {
    results: 'Results', management_change: 'Management', litigation: 'Litigation', 'M&A': 'M&A', fund_raise: 'Fund raise',
    credit_rating: 'Rating', pledging: 'Pledge', insider_trading: 'Insider', capex: 'Capex', dividend: 'Dividend',
    earnings_call: 'Concall', press_release: 'News', investor_meetings: 'Investor meet', postal_ballot: 'Postal ballot',
    agm_egm: 'AGM/EGM', bonus_split: 'Bonus/split', unclassified: 'Routine',
  };

  function classify(a) {
    // Exchange subject line first (most reliable), then the full text.
    const subj = String(a.subject || '').toLowerCase().trim();
    const text = (subj + ' ' + a.title + ' ' + a.summary).toLowerCase();
    let cat = null;
    if (subj) for (let i = 0; i < RULES.length; i++) { if (RULES[i][1].test(subj) && RULES[i][0] !== 'press_release') { cat = RULES[i][0]; break; } }
    if (!cat || cat === 'unclassified') {
      let full = 'unclassified';
      for (let i = 0; i < RULES.length; i++) { if (RULES[i][1].test(text)) { full = RULES[i][0]; break; } }
      if (!cat || full !== 'unclassified' && !/certificate|newspaper|trading window|esop|esos|auditor/.test(subj)) cat = full;
    }
    let prio = 'low';
    if (cat === 'results') prio = /intimation|to consider|will be held|is scheduled|scheduled to|trading window|prior intimation/.test(text) || !/result|financial/.test(text) ? 'low' : 'high';
    else if (cat === 'management_change') prio = /\bc[ef]o\b|chief (executive|financial)|managing director|\bmd\b|chairman|whole[- ]time/.test(text) ? 'high' : 'medium';
    else if (cat === 'M&A' || cat === 'litigation' || cat === 'fund_raise') prio = 'high';
    else if (cat === 'credit_rating') prio = /downgrade|negative|watch/.test(text) ? 'high' : 'medium';
    else if (cat === 'pledging' || cat === 'insider_trading' || cat === 'capex') prio = 'medium';
    else if (cat === 'press_release') prio = /order|contract|letter of award|loa/.test(text) ? 'medium' : 'low';
    return { cat, prio, label: LABEL[cat] };
  }

  // Person names in management-change filings ("Mr. A B Sharma") for background lookup.
  function personIn(text) {
    const m = String(text).match(/(?:Mr|Ms|Mrs|Dr|Shri|Smt|CA)\.?\s+([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*){0,3})/);
    return m ? m[1].replace(/\s+(as|is|has|from|with)$/i, '') : null;
  }

  // ---------- small numeric helpers ----------
  function lastIdx(arr) { if (!arr) return -1; for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i; return -1; }
  function pct(a, b) { return a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100; }
  function annual(t, names) {
    const r = row.apply(null, [t].concat(names));
    if (!r) return [];
    return t.headers.map((h, i) => ({ h, v: r[i] })).filter((p) => !/ttm/i.test(p.h) && p.v != null);
  }
  function cagr(points, years) {
    if (points.length < years + 1) return null;
    const a = points[points.length - 1 - years].v, b = points[points.length - 1].v;
    if (a == null || b == null || a <= 0 || b <= 0) return null;
    return (Math.pow(b / a, 1 / years) - 1) * 100;
  }
  function sumLast(points, n) { const p = points.slice(-n); return p.length === n ? p.reduce((s, x) => s + x.v, 0) : null; }
  function isBank(c) { return !!(row(c.quarters, 'Financing Profit') || row(c.pl, 'Financing Profit')); }

  // ---------- latest quarter scorecard: Revenue, EBITDA, PBT, PAT, QoQ & YoY ----------
  function quarterCard(c) {
    const q = c.quarters;
    const sales = row(q, 'Sales', 'Revenue');
    const i = lastIdx(sales);
    if (i < 1) return null;
    const head = q.headers[i];
    const m = head.match(/([A-Za-z]{3})\s+(\d{4})/);
    let y = -1;
    if (m) y = q.headers.indexOf(m[1] + ' ' + (parseInt(m[2], 10) - 1));
    if (y < 0 && i >= 4) y = i - 4;
    const defs = [
      ['Revenue', sales],
      [isBank(c) ? 'Op. profit' : 'EBITDA', row(q, 'Operating Profit', 'Financing Profit')],
      ['PBT', row(q, 'Profit before tax')],
      ['PAT', row(q, 'Net Profit')],
    ];
    const metrics = defs.filter((d) => d[1]).map((d) => ({
      name: d[0], cur: d[1][i], qoq: pct(d[1][i], d[1][i - 1]), yoy: y >= 0 ? pct(d[1][i], d[1][y]) : null,
    }));
    const opm = row(q, 'OPM', 'Financing Margin');
    return {
      period: head, prevPeriod: q.headers[i - 1], yoyPeriod: y >= 0 ? q.headers[y] : null, metrics,
      margin: opm ? { cur: opm[i], qoq: opm[i - 1], yoy: y >= 0 ? opm[y] : null } : null,
    };
  }

  // ---------- FINN Score: five pillars an investor checks first ----------
  function grade(v, good, ok, higherBetter) {
    if (v == null || isNaN(v)) return 'na';
    if (higherBetter === false) return v <= good ? 'good' : v <= ok ? 'ok' : 'weak';
    return v >= good ? 'good' : v >= ok ? 'ok' : 'weak';
  }
  function f1(v, suf) { return v == null || isNaN(v) ? '—' : (Math.round(v * 10) / 10) + (suf || ''); }

  function score(c) {
    const bank = isBank(c);
    const sales = annual(c.pl, ['Sales', 'Revenue']);
    const np = annual(c.pl, ['Net Profit']);
    const sg = cagr(sales, 3), pg = cagr(np, 3);
    const gVal = sg == null ? pg : pg == null ? sg : (sg + pg) / 2;

    const roceRow = annual(c.rt, ['ROCE', 'ROE']);
    let roce = roceRow.length ? roceRow[roceRow.length - 1].v : null;
    let roceName = 'ROCE';
    if (roce == null && c.ratios.ROCE) roce = c.ratios.ROCE[0];
    if (bank || roce == null) { roce = c.ratios.ROE ? c.ratios.ROE[0] : roce; roceName = 'ROE'; }

    const cfo = annual(c.cf, ['Cash from Operating']);
    const conv = !bank && cfo.length >= 3 && np.length >= 3 ? sumLast(cfo, 3) / sumLast(np, 3) : null;

    const debt = annual(c.bs, ['Borrowings']);
    const eq = annual(c.bs, ['Equity Capital']), res = annual(c.bs, ['Reserves']);
    const de = !bank && debt.length && eq.length && res.length ? debt[debt.length - 1].v / (eq[eq.length - 1].v + res[res.length - 1].v) : null;

    const prom = row(c.shp, 'Promoters');
    const pi = lastIdx(prom);
    const promChg = pi >= 4 ? prom[pi] - prom[pi - 4] : null;
    const promNow = pi >= 0 ? prom[pi] : null;

    return [
      { key: 'growth', label: 'Growth', grade: grade(gVal, 18, 10), value: f1(gVal, '%'), note: '3-yr CAGR · sales ' + f1(sg, '%') + ', profit ' + f1(pg, '%') },
      { key: 'returns', label: 'Returns', grade: grade(roce, bank ? 15 : 20, bank ? 11 : 12), value: f1(roce, '%'), note: roceName + ', latest year' },
      { key: 'cash', label: 'Cash', grade: bank ? 'na' : grade(conv, 0.9, 0.6), value: conv == null ? '—' : f1(conv, 'x'), note: bank ? 'Not meaningful for lenders' : '3-yr operating cash ÷ net profit' },
      { key: 'balance', label: 'Leverage', grade: bank ? 'na' : grade(de, 0.5, 1.5, false), value: de == null ? '—' : f1(de, 'x'), note: bank ? 'Lenders run on leverage — see capital ratios' : 'Debt ÷ equity' },
      { key: 'owners', label: 'Owners', grade: promNow == null ? 'na' : promNow === 0 ? 'ok' : grade(promChg, -0.5, -3), value: promNow == null ? '—' : f1(promNow, '%'), note: promChg == null ? 'Promoter holding' : 'Promoters ' + (promChg >= 0 ? '+' : '') + f1(promChg, ' pp') + ' over 4 qtrs' },
    ];
  }

  // ---------- forensic red-flag scanner ----------
  function redFlags(c) {
    const out = [];
    const bank = isBank(c);
    const add = (title, status, detail) => out.push({ title, status, detail });
    const np = annual(c.pl, ['Net Profit']);
    const sales = annual(c.pl, ['Sales', 'Revenue']);

    if (!bank) {
      const cfo = annual(c.cf, ['Cash from Operating']);
      if (cfo.length >= 3 && np.length >= 3) {
        const conv = sumLast(cfo, 3) / sumLast(np, 3);
        add('Profits turning into cash', conv >= 0.8 ? 'pass' : conv >= 0.5 ? 'warn' : 'fail',
          '3-yr operating cash flow is ' + f1(conv, 'x') + ' of reported profit' + (conv < 0.8 ? ' — profits are not fully converting to cash.' : '.'));
      }
      const fcf = annual(c.cf, ['Free Cash Flow']);
      if (fcf.length >= 3) {
        const neg = fcf.slice(-3).filter((p) => p.v < 0).length;
        add('Free cash flow', neg === 0 ? 'pass' : neg === 1 ? 'warn' : 'fail', neg + ' of the last 3 years had negative free cash flow.');
      }
      const dd = annual(c.rt, ['Debtor Days']);
      if (dd.length >= 4) {
        const a = dd[dd.length - 4].v, b = dd[dd.length - 1].v;
        const chg = b - a;
        add('Receivables discipline', chg <= 10 ? 'pass' : chg <= 30 ? 'warn' : 'fail', 'Debtor days ' + f1(a) + ' → ' + f1(b) + ' over 3 years.');
      }
      const ccc = annual(c.rt, ['Cash Conversion Cycle', 'Working Capital Days']);
      if (ccc.length >= 4) {
        const a = ccc[ccc.length - 4].v, b = ccc[ccc.length - 1].v;
        add('Working-capital cycle', b - a <= 15 ? 'pass' : b - a <= 40 ? 'warn' : 'fail', 'Cash tied up in operations: ' + f1(a) + ' → ' + f1(b) + ' days.');
      }
      const debt = annual(c.bs, ['Borrowings']);
      if (debt.length >= 4 && sales.length >= 4) {
        const dg = cagr(debt, 3), sg = cagr(sales, 3);
        if (dg != null && sg != null) add('Debt vs growth', dg <= sg + 5 ? 'pass' : dg <= sg + 20 ? 'warn' : 'fail', 'Borrowings grew ' + f1(dg, '%') + '/yr vs sales ' + f1(sg, '%') + '/yr.');
      }
      const ip = annual(c.pl, ['Interest']), pbt = annual(c.pl, ['Profit before tax']);
      if (ip.length && pbt.length) {
        const i = ip[ip.length - 1].v, p = pbt[pbt.length - 1].v;
        if (i > 0) { const cov = (p + i) / i; add('Interest cover', cov >= 4 ? 'pass' : cov >= 2 ? 'warn' : 'fail', 'Operating profit covers interest ' + f1(cov, 'x') + '.'); }
      }
      const cwip = annual(c.bs, ['CWIP']), fa = annual(c.bs, ['Fixed Assets']);
      if (cwip.length && fa.length && fa[fa.length - 1].v > 0) {
        const r = cwip[cwip.length - 1].v / fa[fa.length - 1].v;
        add('Capex under construction', r <= 0.3 ? 'pass' : 'warn', 'Capital work-in-progress is ' + f1(r * 100, '%') + ' of fixed assets' + (r > 0.3 ? ' — big projects still to deliver returns.' : '.'));
      }
    }

    const oi = annual(c.pl, ['Other Income']), pbt2 = annual(c.pl, ['Profit before tax']);
    if (oi.length && pbt2.length && pbt2[pbt2.length - 1].v > 0) {
      const r = oi[oi.length - 1].v / pbt2[pbt2.length - 1].v;
      add('Quality of earnings', r <= 0.15 ? 'pass' : r <= 0.3 ? 'warn' : 'fail', 'Other income is ' + f1(r * 100, '%') + ' of profit before tax.');
    }
    const tax = annual(c.pl, ['Tax']);
    if (tax.length) {
      const t = tax[tax.length - 1].v;
      add('Tax rate', t >= 18 && t <= 35 ? 'pass' : 'warn', 'Effective tax rate ' + f1(t, '%') + (t < 18 || t > 35 ? ' — outside the normal 18–35% band; check for one-offs.' : '.'));
    }
    const eq = annual(c.bs, ['Equity Capital']);
    if (eq.length >= 4) {
      const g = pct(eq[eq.length - 1].v, eq[eq.length - 4].v);
      add('Shareholder dilution', g <= 2 ? 'pass' : g <= 10 ? 'warn' : 'fail', 'Equity capital ' + (g >= 0 ? '+' : '') + f1(g, '%') + ' over 3 years (bonus/splits can also cause this).');
    }
    const prom = row(c.shp, 'Promoters');
    const pi = lastIdx(prom);
    if (pi >= 4 && prom[pi] > 0) {
      const d = prom[pi] - prom[pi - 4];
      add('Promoter commitment', d >= -0.5 ? 'pass' : d >= -3 ? 'warn' : 'fail', 'Promoter stake ' + f1(prom[pi - 4], '%') + ' → ' + f1(prom[pi], '%') + ' over 4 quarters.');
    }
    const q = quarterCard(c);
    if (q && q.margin && q.margin.cur != null && q.margin.yoy != null) {
      const bps = (q.margin.cur - q.margin.yoy) * 100;
      add('Margin trend', bps >= -150 ? 'pass' : bps >= -400 ? 'warn' : 'fail', (bank ? 'Financing' : 'Operating') + ' margin ' + f1(q.margin.yoy, '%') + ' → ' + f1(q.margin.cur, '%') + ' YoY in ' + q.period + '.');
    }
    return out;
  }

  // Quarter a results filing on this date most likely reports (e.g. filed 30 Oct → "Sep 2026").
  function expectedQuarter(t) {
    const d = new Date(t), m = d.getMonth(), y = d.getFullYear();
    return m <= 2 ? 'Dec ' + (y - 1) : m <= 5 ? 'Mar ' + y : m <= 8 ? 'Jun ' + y : 'Sep ' + y;
  }

  // One plain-English sentence from the five pillars, so a non-expert gets the picture in 5 seconds.
  function take(c) {
    const sc = score(c);
    const g = {};
    sc.forEach((p) => { g[p.key] = p; });
    const pos = [], neg = [];
    const say = (p, good, ok, weak) => { if (!p || p.grade === 'na') return; if (p.grade === 'good') pos.push(good); else if (p.grade === 'weak') neg.push(weak); else if (ok) pos.push(ok); };
    say(g.growth, 'growing fast (' + g.growth.value + '/yr)', 'growing steadily (' + g.growth.value + '/yr)', 'growth has stalled (' + g.growth.value + '/yr)');
    say(g.returns, 'earns high returns on capital (' + g.returns.value + ')', null, 'earns thin returns on capital (' + g.returns.value + ')');
    say(g.cash, 'converts profit into cash', null, 'profits are not turning into cash (' + g.cash.value + ')');
    say(g.balance, 'carries little debt', null, 'carries heavy debt (' + g.balance.value + ' debt/equity)');
    say(g.owners, null, null, 'promoters have been cutting their stake');
    const flags = redFlags(c).filter((f) => f.status === 'fail').length;
    let sTxt;
    if (!pos.length && !neg.length) sTxt = 'Not enough history to judge yet.';
    else if (!neg.length) sTxt = 'Business is ' + pos.join(', ') + '.';
    else if (!pos.length) sTxt = 'Caution: ' + neg.join(', ') + '.';
    else sTxt = 'Business is ' + pos.join(', ') + ' — but ' + neg.join(' and ') + '.';
    sTxt = sTxt.replace('Business is growth', 'Growth');
    return { text: sTxt, flags, tone: neg.length > pos.length ? 'bad' : neg.length ? 'mixed' : 'good' };
  }

  // ---------- compact numeric context for the AI (grounding) ----------
  function factSheet(c) {
    const lines = ['Company: ' + c.name + ' (' + c.sym + ')', 'Source: company financial statements as compiled on screener.in from exchange filings.'];
    const tbl = (t, names, label, n) => {
      if (!t) return;
      names.forEach((nm) => {
        const r = row(t, nm);
        if (!r) return;
        const pts = t.headers.map((h, i) => h + ': ' + (r[i] == null ? 'na' : r[i])).slice(-n);
        lines.push(label + ' — ' + nm + ' — ' + pts.join(', '));
      });
    };
    tbl(c.quarters, ['Sales', 'Revenue', 'Operating Profit', 'Financing Profit', 'OPM', 'Financing Margin', 'Profit before tax', 'Net Profit'], 'Quarterly (₹ Cr)', 8);
    tbl(c.pl, ['Sales', 'Revenue', 'Operating Profit', 'OPM', 'Net Profit'], 'Annual (₹ Cr)', 6);
    tbl(c.bs, ['Borrowings', 'Reserves'], 'Balance sheet (₹ Cr)', 4);
    tbl(c.cf, ['Cash from Operating', 'Free Cash Flow'], 'Cash flow (₹ Cr)', 4);
    tbl(c.rt, ['ROCE', 'Debtor Days', 'Cash Conversion Cycle'], 'Ratios', 4);
    tbl(c.shp, ['Promoters', 'FIIs', 'DIIs'], 'Shareholding %', 5);
    return lines.join('\n');
  }

  FINN.classify = classify;
  FINN.expectedQuarter = expectedQuarter;
  FINN.take = take;
  FINN.personIn = personIn;
  FINN.peopleIn = function (text) {
    const re = /(?:Mr|Ms|Mrs|Dr|Shri|Smt|CA)\.?\s+([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*){0,3})/g;
    const out = []; let m;
    while ((m = re.exec(String(text))) && out.length < 3) { const n = m[1].replace(/\s+(as|is|has|from|with)$/i, ''); if (out.indexOf(n) < 0) out.push(n); }
    return out;
  };
  FINN.quarterCard = quarterCard;
  FINN.score = score;
  FINN.redFlags = redFlags;
  FINN.factSheet = factSheet;
  FINN.annual = annual;
  FINN.cagr = cagr;
  FINN.isBank = isBank;
  FINN.lastIdx = lastIdx;
})(window.FINN = window.FINN || {});
