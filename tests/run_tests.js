const { chromium } = require('playwright');
const install = require('./mock');
const NATIVE = `window.FINNNative = { request(id, url, headers, binary) {
  fetch(url).then(async (r) => { let body; if (binary) { const b = new Uint8Array(await r.arrayBuffer()); let s=''; for (let i=0;i<b.length;i++) s+=String.fromCharCode(b[i]); body = btoa(s); } else body = await r.text();
    window.__nativeCalls = (window.__nativeCalls||0)+1; window.FINNNative_cb(id, r.status, body); }).catch((e) => window.FINNNative_cb(id, 0, String(e))); },
  postAlert(title, body, id) { (window.__alerts = window.__alerts || []).push({ title, body, id }); } };`;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } else console.log('  ok  ', m); };

async function session(b, { native, nseDown, key, intro, shots, offline, aliasGone, geminiQuota, groundingQuota, backup, webMode }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  if (native) await p.addInitScript(NATIVE);
  await p.addInitScript(({ key, intro, backup, webMode }) => { if (!intro) localStorage.setItem('finn.introDone', 'true'); if (key || backup) localStorage.setItem('finn.settings', JSON.stringify({ apiKey: key || '', provider: 'gemini', backupKey: backup || '', webMode: webMode || 'finn' })); }, { key, intro, backup, webMode });
  if (offline) await p.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  else await install(p, { nseDown, aliasGone, geminiQuota, groundingQuota });
  await p.goto('file://' + require('path').resolve(__dirname, '../web/index.html'));
  return { p, ctx, errs };
}

(async () => {
  const b = await chromium.launch();

  console.log('UNIT');
  { const { p, ctx, errs } = await session(b, { native: false });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const C = (subject, title, summary) => FINN.classify({ subject, title: title || '', summary: summary || '' });
      return {
        res: C('Financial Result Updates', '', 'informed about results for quarter ended Sep 2026'),
        bm: C('Board Meeting Intimation', '', 'to consider unaudited financial results'),
        cert: C('Certificate under SEBI (Depositories and Participants) Regulations, 2018', '', ''),
        cfo: C('Change in Management', '', 'Appointment of CFO'),
        dir: C('', 'Appointment of Independent Director', ''),
        acq: C('Acquisition', '', 'Acquisition of 51% stake'),
        spurt: C('Spurt in Volume', '', 'clarification'),
        audit: C('', 'Appointment of Secretarial Auditor', ''),
        esop: C('', 'Allotment of equity shares under ESOP', ''),
        rating: C('Company Update / Credit Rating', '', 'CRISIL downgrades to A+'),
        order: C('', 'Bags order worth Rs 450 crore from NHAI', ''),
        lit: C('Action(s) initiated or orders passed', '', 'GST demand order'),
        pledge: C('', 'Disclosure of creation of encumbrance / pledge', ''),
        q1: FINN.expectedQuarter(new Date(2026, 9, 30).getTime()), q2: FINN.expectedQuarter(new Date(2026, 4, 20).getTime()), q3: FINN.expectedQuarter(new Date(2027, 1, 5).getTime()),
        d1: new Date(FINN.parseExchDate('2026-10-29 18:30:00')).toISOString(), d2: new Date(FINN.parseExchDate('29-Oct-2026 18:30:00')).getHours(),
        num: [FINN.num('1,139'), FINN.num('19%'), FINN.num(''), FINN.num('-12.5')],
      };
    });
    ok(r.res.cat === 'results' && r.res.prio === 'high', 'NSE results subject → results/high');
    ok(r.bm.cat === 'results' && r.bm.prio === 'low', 'board-meeting intimation → upcoming (low)');
    ok(r.cert.cat === 'unclassified', 'depository certificate → routine');
    ok(r.cfo.cat === 'management_change' && r.cfo.prio === 'high', 'CFO change → management/high');
    ok(r.dir.cat === 'management_change' && r.dir.prio === 'medium', 'independent director → management/medium');
    ok(r.acq.cat === 'M&A' && r.acq.prio === 'high', 'acquisition → M&A/high');
    ok(r.spurt.cat === 'press_release', 'spurt in volume → news/clarification');
    ok(r.audit.cat === 'unclassified', 'auditor appointment → routine (per reference doc)');
    ok(r.esop.cat === 'unclassified', 'ESOP allotment → routine');
    ok(r.rating.cat === 'credit_rating' && r.rating.prio === 'high', 'rating downgrade → rating/high');
    ok(r.order.cat === 'press_release' && r.order.prio === 'medium', 'order win → news/medium');
    ok(r.lit.cat === 'litigation', 'orders passed → litigation');
    ok(r.pledge.cat === 'pledging', 'encumbrance → pledging');
    ok(r.q1 === 'Sep 2026' && r.q2 === 'Mar 2026' && r.q3 === 'Dec 2026', 'expected quarter for filing dates');
    ok(r.d2 === 18, 'NSE date formats parsed with time');
    ok(JSON.stringify(r.num) === '[1139,19,null,-12.5]', 'number parsing');
    // Edge: sparse company (no BS/CF/shareholding) must not throw
    const edge = await p.evaluate(() => {
      const html = '<h1>Tiny Ltd</h1><section id="quarters"><table><thead><tr><th></th><th>Jun 2026</th><th>Sep 2026</th></tr></thead><tbody><tr><td>Sales +</td><td>10</td><td>12</td></tr><tr><td>Net Profit +</td><td>1</td><td>-2</td></tr></tbody></table></section>';
      const c = FINN.parseCompany(html, 'TINY', '/company/TINY/');
      return { score: FINN.score(c).map((x) => x.grade).join(','), flags: FINN.redFlags(c).length, take: FINN.take(c).text, q: FINN.quarterCard(c) && FINN.quarterCard(c).metrics.length };
    });
    ok(edge.score && edge.take, 'sparse company: score + take render without errors (' + edge.take + ')');
    ok(errs.length === 0, 'no console errors (unit page) ' + errs.join('|'));
    await ctx.close(); }

  console.log('E2E: in-app (native bridge, NSE live, AI key)');
  { const { p, ctx, errs } = await session(b, { native: true, key: 'AQ.test', intro: true });
    await p.waitForTimeout(600);
    ok(await p.isVisible('.intro'), 'first-run intro shows');
    await p.screenshot({ path: require('os').tmpdir() + '/v4_intro.png' });
    for (let i = 0; i < 3; i++) await p.click('[data-act="intronext"]');
    ok(!(await p.isVisible('.intro')), 'intro dismisses');
    await p.waitForTimeout(3500);
    ok(await p.evaluate(() => window.__nativeCalls > 20), 'requests went through native bridge');
    const src = await p.evaluate(() => Object.values(FINN.store.get('finn.c.fil.DIXON', {d:{}}).d || {}).length ? FINN.store.get('finn.c.fil.DIXON').d.source : null);
    ok(src === 'NSE', 'filings sourced from NSE (got ' + src + ')');
    const brief = await p.textContent('.brief');
    ok(/Results season/.test(brief), 'brief has results-season line');
    ok(/⚡/.test(await p.textContent('main')), 'watched categories flagged ⚡');
    await p.screenshot({ path: require('os').tmpdir() + '/v4_today.png', fullPage: true });
    // window chips
    await p.click('[data-win="new"]'); await p.waitForTimeout(150);
    await p.click('[data-win="3"]'); await p.waitForTimeout(150);
    // results board: expand + read from filing
    await p.click('[data-expand^="rb"]'); await p.waitForTimeout(150);
    const rr = await p.$('[data-readres]');
    if (rr) { await rr.click(); await p.waitForTimeout(2500); }
    const bexp = await p.textContent('.bexp');
    ok(/Read from the consolidated results filing/.test(bexp) || /QoQ/.test(bexp), 'results row expands and reads numbers from the filing PDF');
    ok(/3,421|3,420/.test(bexp) || !rr, 'filing revenue shown (₹3,420.5 Cr)');
    await p.screenshot({ path: require('os').tmpdir() + '/v4_board.png', fullPage: true });
    // management background from filing
    await p.click('[data-filter="people"]'); await p.waitForTimeout(150);
    await p.click('[data-prof]'); await p.waitForTimeout(2500);
    const prof = await p.textContent('.person-card');
    ok(/Anita Desai/.test(prof) && /Deloitte/.test(prof), 'appointee profile read from filing');
    await p.screenshot({ path: require('os').tmpdir() + '/v4_people.png', fullPage: true });
    // glossary
    await p.click('[data-filter="all"]'); await p.click('.gl[data-gl="PAT"]'); await p.waitForTimeout(100);
    ok(/bottom line/i.test(await p.textContent('.sheet')), 'glossary sheet explains PAT');
    await p.screenshot({ path: require('os').tmpdir() + '/v4_gloss.png' });
    await p.click('[data-act="closegl"]');
    // company: take, analyst bull/bear + said vs done
    await p.evaluate(() => { location.hash = 'c/DIXON'; }); await p.waitForTimeout(1200);
    ok(/FINN'S TAKE/.test(await p.textContent('main')), 'company shows FINN\'s take');
    await p.screenshot({ path: require('os').tmpdir() + '/v4_company.png', fullPage: true });
    await p.click('[data-ctab="DIXON/analyst"]'); await p.waitForTimeout(150);
    await p.click('[data-bb="DIXON"]'); await p.waitForTimeout(1200);
    ok(/BULL/.test(await p.textContent('main')) && /WHAT DECIDES IT/.test(await p.textContent('main')), 'bull vs bear rendered');
    await p.click('[data-gt="DIXON"]'); await p.waitForTimeout(4000);
    ok(/Management credibility/.test(await p.textContent('main')), 'said vs done ran on transcripts (via native binary fetch)');
    await p.screenshot({ path: require('os').tmpdir() + '/v4_analyst.png', fullPage: true });
    // settings: alert categories toggle
    await p.evaluate(() => { location.hash = 'portfolio'; }); await p.waitForTimeout(300);
    await p.click('[data-alertcat="dividend"]');
    ok((await p.evaluate(() => FINN.settings().alertCats)).includes('dividend'), 'alert category toggles persist');
    await p.screenshot({ path: require('os').tmpdir() + '/v4_settings.png', fullPage: true });
    ok(!/screener/i.test(await p.evaluate(() => document.body.innerText)), 'no screener branding in visible UI');
    ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
    await ctx.close(); }

  console.log('E2E: Ask FINN agent (popup, Google Search, context, back button)');
  { const { p, ctx, errs } = await session(b, { native: true, key: 'AQ.test' });
    await p.waitForTimeout(3500);
    ok(await p.isVisible('#fab'), 'floating Ask FINN button visible on Today');
    await p.click('#fab'); await p.waitForTimeout(300);
    ok(await p.isVisible('.agent'), 'agent popup opens');
    ok((await p.$$('.ag-sugg button')).length === 4, 'shows 4 suggested questions');
    ok(/Using Portfolio data/.test(await p.textContent('.ag-ctx')), 'portfolio context attached on Today');
    await p.screenshot({ path: require('os').tmpdir() + '/v5_agent_empty.png' });
    await p.fill('#agentInput', 'What moved my portfolio today?'); await p.press('#agentInput', 'Enter');
    await p.waitForSelector('.bub.ai:not(.typing)', { timeout: 10000 });
    const ans = await p.textContent('.ag-body');
    ok(/Short answer/.test(ans) && /portfolio of 16 holdings/.test(ans), 'answer rendered (markdown) using portfolio data');
    ok((await p.$$('.srcchip')).length >= 6, 'per-holding news sources shown as chips (' + (await p.$$('.srcchip')).length + ')');
    ok((await p.$$('.bub.ai a.cite')).length === 2, 'inline [n] citations become tappable source markers');
    await p.screenshot({ path: require('os').tmpdir() + '/v5_agent_answer.png' });
    await p.goBack(); await p.waitForTimeout(300);
    ok(!(await p.isVisible('.agent')) && /today|^$/.test(await p.evaluate(() => location.hash.replace('#', ''))), 'Android back closes the popup without leaving the screen');
    await p.evaluate(() => { location.hash = 'c/DIXON'; }); await p.waitForTimeout(1200);
    await p.click('#fab'); await p.waitForTimeout(200);
    ok((await p.$$('.bub.me')).length === 1, 'conversation persists across screens');
    await p.click('[data-act="agentclear"]'); await p.waitForTimeout(100);
    ok(/Using DIXON data/.test(await p.textContent('.ag-ctx')), 'company context on company page');
    ok(/Latest news on DIXON/.test(await p.textContent('.ag-sugg')), 'company-specific suggestions');
    await p.click('.ag-sugg button'); await p.waitForSelector('.bub.ai:not(.typing)', { timeout: 10000 });
    ok(/DIXON Industries Ltd \(DIXON\)/.test(await p.textContent('.ag-body')), 'company fact sheet sent as context');
    await p.click('[data-act="agentclose"]'); await p.waitForTimeout(200);
    ok(!(await p.isVisible('.agent')), 'close button works');
    ok(!(await p.$('[data-ctab="DIXON/ask"]')), 'old Ask tab replaced by the popup');
    ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
    await ctx.close(); }

  console.log('E2E: retired Gemini model → auto-recovery (the HTTP 404 bug)');
  { const { p, ctx, errs } = await session(b, { native: true, key: 'AQ.test', aliasGone: true });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { location.hash = 'portfolio'; }); await p.waitForTimeout(300);
    await p.click('[data-act="testai"]'); await p.waitForTimeout(1500);
    const note = await p.textContent('.settings .note');
    ok(/working · gemini-3\.1-flash-lite/.test(note), 'Test AI recovers from 404 and picks the newest stable Flash-Lite');
    const picked = await p.evaluate(() => FINN.store.get('finn.gemModels'));
    ok(picked.fast === 'gemini-3.1-flash-lite' && picked.smart === 'gemini-3.6-flash', 'skips preview/image models; lite for extraction');
    await p.click('#fab'); await p.fill('#agentInput', 'hi'); await p.press('#agentInput', 'Enter');
    await p.waitForSelector('.bub.ai:not(.typing)', { timeout: 10000 });
    ok(!/Couldn/.test(await p.textContent('.ag-body')), 'agent answers after recovery');
    await p.screenshot({ path: require('os').tmpdir() + '/v5_settings.png', fullPage: true });
    ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
    await ctx.close(); }

  console.log('E2E: Gemini free quota exhausted (the HTTP 429 on device)');
  { const { p, ctx, errs } = await session(b, { native: true, key: 'AQ.test', geminiQuota: true });
    await p.waitForTimeout(2500);
    await p.click('#fab'); await p.fill('#agentInput', 'Any big news on my holdings this week?'); await p.press('#agentInput', 'Enter');
    await p.waitForSelector('.bub.ai:not(.typing)', { timeout: 15000 });
    const t = await p.textContent('.ag-body');
    ok(/no free quota/.test(t) && /Groq/.test(t), 'without backup: clear message saying what to do');
    await p.click('.errd summary'); await p.waitForTimeout(100);
    ok(/limit: 0/.test(await p.textContent('.errd')), 'error details show Google\'s exact reason');
    await p.screenshot({ path: require('os').tmpdir() + '/v6_quota.png' });
    await ctx.close(); }
  { const { p, ctx, errs } = await session(b, { native: true, key: 'AQ.test', geminiQuota: true, backup: 'gsk_test' });
    await p.waitForTimeout(2500);
    await p.click('#fab'); await p.fill('#agentInput', 'Any big news on my holdings this week?'); await p.press('#agentInput', 'Enter');
    await p.waitForSelector('.bub.ai:not(.typing)', { timeout: 15000 });
    ok(/Backup answer/.test(await p.textContent('.ag-body')) && /llama-4-70b-versatile/.test(await p.textContent('.ag-body')), 'with Groq backup: answers using the largest chat model');
    await p.click('[data-act="agentclose"]');
    await p.evaluate(() => { location.hash = 'portfolio'; }); await p.waitForTimeout(300);
    await p.click('[data-act="testai"]'); await p.waitForTimeout(2500);
    const note = await p.textContent('.settings .note');
    ok(/✕ Google Gemini/.test(note) && /✓ Backup working/.test(note), 'Test AI reports each provider separately');
    ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
    await ctx.close(); }

  console.log('E2E: Google grounding quota hit → falls back to free search');
  { const { p, ctx, errs } = await session(b, { native: true, key: 'AQ.test', groundingQuota: true, webMode: 'google' });
    await p.waitForTimeout(2500);
    await p.click('#fab'); await p.fill('#agentInput', 'Latest news on my portfolio?'); await p.press('#agentInput', 'Enter');
    await p.waitForSelector('.bub.ai:not(.typing)', { timeout: 15000 });
    ok(/Short answer/.test(await p.textContent('.ag-body')) && (await p.$$('.srcchip')).length > 0, 'answered via free search after grounding 429');
    ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
    await ctx.close(); }

  console.log('E2E: renamed & unknown tickers, diagnostics, full sweep');
  { const { p, ctx, errs } = await session(b, { native: true, key: 'AQ.test' });
    await p.waitForTimeout(3000);
    // Old cached Try chip / typed old ticker
    await p.evaluate(() => { location.hash = 'c/ZOMATO'; }); await p.waitForTimeout(1500);
    ok(/ETERNAL/.test(await p.evaluate(() => location.hash)), 'ZOMATO redirects to ETERNAL');
    ok(/ZOMATO now trades as/.test(await p.textContent('main')) && /Formerly Zomato|formerly Zomato/.test(await p.textContent('main')), 'rename explained to the user');
    ok(/FINN'S TAKE/.test(await p.textContent('main')), 'renamed company fully loads');
    await p.evaluate(() => { location.hash = 'c/TATAMOTORS'; }); await p.waitForTimeout(1500);
    ok(/TMPV/.test(await p.evaluate(() => location.hash)), 'TATAMOTORS redirects to TMPV');
    await p.evaluate(() => { location.hash = 'c/XYZFAKE'; }); await p.waitForTimeout(1500);
    const nf = await p.textContent('main');
    ok(/couldn't find this ticker/.test(nf) && /DID YOU MEAN/.test(nf) && !/HTTP 404/.test(nf), 'unknown ticker: friendly message + suggestions, no raw HTTP 404');
    await p.click('.sugg'); await p.waitForTimeout(1200);
    ok(/RELIANCE/.test(await p.evaluate(() => location.hash)), 'tapping a suggestion opens it');
    // Every Try chip opens a company
    await p.evaluate(() => { location.hash = 'research'; }); await p.waitForTimeout(300);
    const tries = await p.$$eval('.chips button[data-go^="c/"]', (b) => b.map((x) => x.dataset.go));
    for (const t of tries) { await p.evaluate((h) => { location.hash = h; }, t); await p.waitForTimeout(900); }
    const bad = await p.evaluate(() => Object.keys(FINN.state.open).filter((k) => k !== 'XYZFAKE' && FINN.state.open[k].error));
    ok(bad.length === 0, 'every Try / Recent chip loads (' + tries.join(', ') + ')' + (bad.length ? ' failed: ' + bad : ''));
    ok(!tries.includes('c/ZOMATO'), 'Try list uses current tickers');
    // Research tiles
    await p.evaluate(() => { location.hash = 'research'; }); await p.waitForTimeout(300);
    await p.click('[data-go="c/RELIANCE/quality"]'); await p.waitForTimeout(800);
    ok(/Red-flag scan/.test(await p.textContent('main')), 'research tile opens Quality tab');
    await p.evaluate(() => { location.hash = 'research'; }); await p.waitForTimeout(300);
    await p.click('#tileAgent'); await p.waitForTimeout(300);
    ok(await p.isVisible('.agent'), 'Ask FINN tile opens the agent');
    await p.click('[data-act="agentclose"]');
    // Sweep: all portfolio companies × all tabs
    const syms = await p.evaluate(() => FINN.state.portfolio.slice());
    for (const sym of syms) for (const tab of ['overview', 'financials', 'quality', 'analyst']) { await p.evaluate((h) => { location.hash = h; }, 'c/' + sym + '/' + tab); await p.waitForTimeout(60); }
    await p.waitForTimeout(800);
    ok(true, 'swept ' + syms.length + ' companies × 4 tabs');
    // Today: every window × filter, expand all, routine
    await p.evaluate(() => { location.hash = 'today'; }); await p.waitForTimeout(300);
    for (const w of ['new', '1', '3', '7', '30', 'custom']) for (const f of ['all', 'results', 'people', 'deals', 'risk']) {
      await p.click('[data-win="' + w + '"]'); await p.click('[data-filter="' + f + '"]');
    }
    ok(true, 'swept 5 windows × 5 filters');
    // Portfolio: edit/remove/add back, glossary on every gl term in Quality
    await p.evaluate(() => { location.hash = 'c/DIXON/quality'; }); await p.waitForTimeout(500);
    const gls = await p.$$eval('.gl', (b) => b.map((x) => x.dataset.gl));
    const missing = await p.evaluate((g) => g.filter((t) => !FINN.GLOSSARY[t]), gls);
    ok(missing.length === 0, 'every tappable term has a glossary entry (' + gls.length + ' terms)' + (missing.length ? ' missing: ' + missing : ''));
    // Diagnostics
    await p.evaluate(() => { location.hash = 'portfolio'; }); await p.waitForTimeout(300);
    await p.click('[data-act="diag"]'); await p.waitForTimeout(8000);
    const dg = await p.textContent('main');
    const fails = await p.$$eval('.flag.f-fail .qt', (x) => x.map((e) => e.textContent));
    ok(/Company financials/.test(dg) && /NSE announcements/.test(dg) && /AI/.test(dg), 'diagnostics run all checks');
    ok(fails.length === 0, 'diagnostics all green against mocks' + (fails.length ? ' — failed: ' + fails.join(', ') : ''));
    await p.screenshot({ path: require('os').tmpdir() + '/v7_diag.png', fullPage: true });
    ok(errs.length === 0, 'no console errors in full sweep ' + errs.slice(0, 3).join(' | '));
    await ctx.close(); }

  console.log('E2E: brief compliance — alerts, custom period, LinkedIn bio, segments, guidance, efficiency');
  { const { p, ctx, errs } = await session(b, { native: true, key: 'AQ.test' });
    await p.waitForTimeout(3500);
    const a0 = await p.evaluate(() => window.__alerts || []);
    ok(a0.length === 1 && /FINN is watching 16 companies/.test(a0[0].title), 'first scan: one baseline notification, no flood (' + a0.length + ')');
    ok(/alerts on/.test(await p.textContent('.hero')), 'Today shows alerts are live');
    // trip a tripwire → next refresh must notify the phone
    await p.evaluate(() => { location.hash = 'c/DIXON'; }); await p.waitForTimeout(800);
    await p.selectOption('#tm', 'pat_yoy'); await p.selectOption('#top', '<'); await p.fill('#tv', '999'); await p.click('[data-addtrip="DIXON"]');
    await p.evaluate(() => { location.hash = 'today'; }); await p.waitForTimeout(300);
    await p.click('#refreshBtn'); await p.waitForTimeout(3500);
    const a1 = await p.evaluate(() => window.__alerts || []);
    ok(a1.some((x) => /DIXON tripwire/.test(x.title)), 'new tripwire breach → phone notification');
    ok(await p.isVisible('#toast') && /tripwire/.test(await p.textContent('#toast')), 'in-app banner shown too');
    const n1 = a1.length;
    await p.click('#refreshBtn'); await p.waitForTimeout(3500);
    ok((await p.evaluate(() => (window.__alerts || []).length)) === n1, 'same alert is not sent twice');
    // custom period
    await p.click('[data-win="custom"]'); await p.waitForTimeout(200);
    ok(await p.isVisible('#dFrom') && await p.isVisible('#dTo'), 'custom period shows from/to date pickers');
    const allN = await p.evaluate(() => document.querySelectorAll('.filing').length + document.querySelectorAll('.brow:not(.bhead)').length);
    const iso = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    await p.fill('#dFrom', iso(400)); await p.dispatchEvent('#dFrom', 'change'); await p.fill('#dTo', iso(300)); await p.dispatchEvent('#dTo', 'change'); await p.waitForTimeout(200);
    ok(/between these dates/.test(await p.textContent('main')), 'an old date range correctly shows no filings (was ' + allN + ' items)');
    await p.fill('#dTo', iso(0)); await p.dispatchEvent('#dTo', 'change'); await p.waitForTimeout(200);
    ok((await p.$$('.filing')).length > 0 || (await p.$$('.brow:not(.bhead)')).length > 0, 'widening the range brings filings back');
    // management bio with LinkedIn
    await p.click('[data-win="7"]'); await p.click('[data-filter="people"]'); await p.waitForTimeout(200);
    await p.click('[data-prof]'); await p.waitForTimeout(2500);
    const pc = await p.innerHTML('.filing');
    ok(/in\.linkedin\.com\/in\/anita-desai-ca/.test(pc) && /LinkedIn ›/.test(pc), 'incoming CFO: real LinkedIn profile linked');
    ok(/public profiles \(LinkedIn\/web\)/.test(pc) && /Deloitte/.test(pc), 'bio combines filing + public profile, labelled');
    // business snapshot
    await p.evaluate(() => { location.hash = 'c/DIXON/overview'; }); await p.waitForTimeout(600);
    await p.click('[data-biz="DIXON"]'); await p.waitForTimeout(2500);
    const bz = await p.textContent('main');
    ok(/Mobile & EMS/.test(bz) && /82%/.test(bz) && /Exports/.test(bz) && (await p.$$('.mixbar span')).length >= 4, 'business snapshot: segments + revenue mix + geography');
    ok(/Investor presentation/.test(bz), 'snapshot cites the investor presentation');
    await p.screenshot({ path: require('os').tmpdir() + '/v8_biz.png', fullPage: true });
    // guidance list
    await p.click('[data-ctab="DIXON/analyst"]'); await p.waitForTimeout(200);
    await p.click('[data-guid="DIXON"]'); await p.waitForTimeout(2500);
    const gt = await p.textContent('main');
    ok(/25% growth in FY27/.test(gt) && /4\.2% by Q4/.test(gt) && /transcript/.test(gt), 'explicit guidance listed with quotes and source');
    await p.click('[data-gt="DIXON"]'); await p.waitForTimeout(3500);
    await p.screenshot({ path: require('os').tmpdir() + '/v8_analyst.png', fullPage: true });
    // efficiency meter
    await p.evaluate(() => { location.hash = 'portfolio'; }); await p.waitForTimeout(400);
    const u = await p.evaluate(() => FINN.ai.usage());
    ok(u.calls >= 4 && u.cache >= 1 && u.tiers.fast >= 1 && u.tiers.smart >= 1, 'efficiency meter: ' + u.calls + ' calls, ' + u.cache + ' saved by cache, fast ' + u.tiers.fast + ' / smart ' + u.tiers.smart);
    ok(/AI EFFICIENCY/.test(await p.textContent('main')), 'efficiency card visible in Settings');
    // settings: watcher interval + test alert
    await p.click('[data-watch="5"]'); ok((await p.evaluate(() => FINN.settings().watchMin)) === 5, 'alert interval configurable');
    await p.click('[data-watch="0"]'); ok((await p.evaluate(() => FINN.settings().watchOn)) === false, 'alerts can be switched off');
    await p.click('[data-watch="15"]');
    await p.click('[data-act="testalert"]');
    ok((await p.evaluate(() => window.__alerts.slice(-1)[0].title)) === 'FINN test alert', 'test alert reaches the phone notification bridge');
    await p.screenshot({ path: require('os').tmpdir() + '/v8_settings.png', fullPage: true });
    ok(errs.length === 0, 'no console errors ' + errs.slice(0, 3).join(' | '));
    await ctx.close(); }

  console.log('E2E: NSE blocked → BSE fallback');
  { const { p, ctx, errs } = await session(b, { native: true, nseDown: true });
    await p.waitForTimeout(3500);
    const src = await p.evaluate(() => FINN.store.get('finn.c.fil.DIXON', null) && FINN.store.get('finn.c.fil.DIXON').d.source);
    ok(src === 'BSE', 'falls back to BSE (got ' + src + ')');
    ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
    await ctx.close(); }

  console.log('E2E: browser (no bridge, no AI key)');
  { const { p, ctx, errs } = await session(b, { native: false });
    await p.waitForTimeout(3500);
    ok(/FINN BRIEF/.test(await p.textContent('main')), 'today renders without bridge');
    await p.evaluate(() => { location.hash = 'c/TITAN/analyst'; }); await p.waitForTimeout(1000);
    ok(/Add an AI key/.test(await p.textContent('main')), 'AI sections explain how to enable');
    await p.click('#fab'); await p.waitForTimeout(200);
    ok(/Add a free Gemini key/.test(await p.textContent('.agent')), 'agent explains how to enable without a key');
    ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
    await ctx.close(); }

  console.log('E2E: fully offline');
  { const { p, ctx, errs } = await session(b, { offline: true });
    await p.waitForTimeout(3000);
    ok(/Offline/.test(await p.textContent('main')), 'offline fallback shown');
    await p.screenshot({ path: require('os').tmpdir() + '/v4_offline.png' });
    ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
    await ctx.close(); }

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exitCode = fails ? 1 : 0;
  await b.close();
})();
