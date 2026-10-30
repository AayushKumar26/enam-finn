/* FINN AI layer: provider-agnostic (Gemini or OpenAI), cheap model for extraction, stronger model for judgment. */
(function (FINN) {
  'use strict';

  // Gemini: native API (needed for Google Search grounding). Model names change often —
  // defaults are Google's "latest" aliases, and on a 404 FINN lists the models this key can use and picks the newest Flash.
  const GEM = 'https://generativelanguage.googleapis.com/v1beta';
  const PROVIDERS = {
    gemini: { label: 'Google Gemini', fast: 'gemini-flash-lite-latest', smart: 'gemini-flash-latest', keyHint: 'AIza… or AQ.…', search: true },
    openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', fast: 'gpt-4o-mini', smart: 'gpt-4o', keyHint: 'sk-…', search: false },
  };

  function cfg() {
    const s = FINN.settings();
    const provider = PROVIDERS[s.provider] ? s.provider : 'gemini';
    const p = PROVIDERS[provider];
    const auto = provider === 'gemini' ? FINN.store.get('finn.gemModels', null) : null;
    return {
      key: (s.apiKey || window.FINN_BUILTIN_KEY || '').trim(), provider, base: p.base, search: p.search,
      fast: s.fastModel || (auto && auto.fast) || p.fast, smart: s.smartModel || (auto && auto.smart) || p.smart,
    };
  }
  // ---------- usage meter (shown in Settings: proves the routing + caching saves calls) ----------
  const today = () => new Date().toDateString();
  let usage = FINN.store.get('finn.usage', null);
  if (!usage || usage.day !== today()) usage = { day: today(), calls: 0, inTok: 0, outTok: 0, cache: 0, models: {}, tiers: { fast: 0, smart: 0 } };
  function saveUsage() { if (usage.day !== today()) usage = { day: today(), calls: 0, inTok: 0, outTok: 0, cache: 0, models: {}, tiers: { fast: 0, smart: 0 } }; FINN.store.set('finn.usage', usage); }
  function meter(model, inT, outT, tier) {
    saveUsage();
    usage.calls++; usage.inTok += inT || 0; usage.outTok += outT || 0;
    usage.models[model] = (usage.models[model] || 0) + 1;
    if (tier) usage.tiers[tier] = (usage.tiers[tier] || 0) + 1;
    saveUsage();
  }

  function enabled() { return !!(cfg().key || FINN.settings().backupKey || window.FINN_BACKUP_KEY); }

  function parseJSON(text) {
    const t = String(text).replace(/^```(?:json)?\s*|\s*```$/g, '');
    try { return JSON.parse(t); } catch (e) { /* fall through */ }
    const m = t.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) { /* fall through */ } }
    throw new Error('AI returned unreadable output');
  }

  function friendly(e) {
    const m = String(e && e.message || e);
    let out;
    if (/HTTP 400|HTTP 401|HTTP 403/.test(m) && /key|API_KEY|permission|unauth/i.test(m)) out = new Error('AI key rejected — check the key in Settings');
    else if (/HTTP 429/.test(m)) out = new Error(/limit: 0|free_tier/i.test(m) ? 'This key has no free quota left for these models today — add a free backup key (Groq) in Settings' : 'AI rate limit reached — wait a minute, or add a free backup key (Groq) in Settings');
    else if (/HTTP 5\d\d/.test(m)) out = new Error('AI service busy — try again');
    else out = e instanceof Error ? e : new Error(m);
    out.detail = m;
    return out;
  }

  async function geminiCall(model, messages, opts) {
    const c = cfg();
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const body = { contents, generationConfig: { temperature: opts.search ? 1.0 : 0.2 } };
    if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    if (opts.search) body.tools = [{ google_search: {} }];
    else if (opts.json) body.generationConfig.responseMimeType = 'application/json';
    const raw = await FINN.http('POST', GEM + '/models/' + encodeURIComponent(model) + ':generateContent', {
      body: JSON.stringify(body), timeout: 90000, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
    });
    const j = JSON.parse(raw);
    const cand = (j.candidates || [])[0];
    if (!cand) throw new Error((j.promptFeedback && j.promptFeedback.blockReason) ? 'Blocked: ' + j.promptFeedback.blockReason : 'Empty AI response');
    const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('').trim();
    const gm = cand.groundingMetadata || {};
    const sources = (gm.groundingChunks || []).map((ch) => ch.web).filter(Boolean).map((w) => ({ title: w.title || w.domain || w.uri, uri: w.uri }));
    const um = j.usageMetadata || {};
    meter(model, um.promptTokenCount, um.candidatesTokenCount, opts.tier);
    return { text, sources, queries: gm.webSearchQueries || [], model };
  }

  async function openaiCall(model, messages, opts) {
    const c = cfg();
    const body = { model, temperature: 0.2, messages };
    if (opts.json) body.response_format = { type: 'json_object' };
    const raw = await FINN.http('POST', c.base + '/chat/completions', {
      body: JSON.stringify(body), timeout: 90000, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key },
    });
    const jo = JSON.parse(raw);
    meter(model, jo.usage && jo.usage.prompt_tokens, jo.usage && jo.usage.completion_tokens, opts.tier);
    return { text: jo.choices[0].message.content, sources: [], queries: [], model };
  }

  // Ask Google which models this key can use. Keeps an ordered list for fallbacks.
  async function discoverGemini(key) {
    const raw = await FINN.http('GET', GEM + '/models?pageSize=200', { headers: { 'x-goog-api-key': key }, timeout: 15000 });
    const names = (JSON.parse(raw).models || [])
      .filter((m) => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-[\d.]+-flash|^gemini-flash/.test(n) && !/image|tts|audio|live|embed|thinking|exp|computer|robot/.test(n));
    const ver = (n) => parseFloat((n.match(/gemini-([\d.]+)/) || [0, 0])[1]);
    const order = (list) => list.sort((a, b) => (/preview/.test(a) - /preview/.test(b)) || ver(b) - ver(a) || a.length - b.length);
    const lite = order(names.filter((n) => /lite/.test(n))), full = order(names.filter((n) => !/lite/.test(n)));
    if (!lite.length && !full.length) throw new Error('No Gemini Flash model available for this key');
    const pick = { fast: lite[0] || full[0], smart: full[0] || lite[0], all: full.concat(lite).slice(0, 8), at: Date.now() };
    FINN.store.set('finn.gemModels', pick);
    return pick;
  }

  function retryDelayMs(e) {
    const m = String(e.message).match(/retry in ([\d.]+)\s*s/i) || String(e.message).match(/"retryDelay":\s*"([\d.]+)s"/);
    return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Backup provider (any OpenAI-compatible API; default Groq's free tier).
  async function backupCall(messages, opts) {
    const s = FINN.settings();
    const key = (s.backupKey || window.FINN_BACKUP_KEY || '').trim();
    if (!key) throw new Error('no backup');
    const base = (s.backupBase || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    let model = s.backupModel || (FINN.store.get('finn.bkModel', null) || {}).id;
    if (!model) {
      const list = (JSON.parse(await FINN.http('GET', base + '/models', { headers: { Authorization: 'Bearer ' + key }, timeout: 15000 })).data || []).map((m) => m.id)
        .filter((id) => !/whisper|tts|guard|embed|vision|audio|playai|compound|prompt/i.test(id));
      const size = (id) => { const m = id.match(/(\d+)b/i); return m ? +m[1] : 0; };
      model = list.sort((a, b) => (/versatile|instruct|gpt-oss|llama|qwen|kimi/i.test(b) - /versatile|instruct|gpt-oss|llama|qwen|kimi/i.test(a)) || size(b) - size(a))[0];
      if (!model) throw new Error('Backup provider has no chat model');
      FINN.store.set('finn.bkModel', { id: model, at: Date.now() });
    }
    const body = { model, temperature: 0.3, messages };
    if (opts.json) body.response_format = { type: 'json_object' };
    const raw = await FINN.http('POST', base + '/chat/completions', { body: JSON.stringify(body), timeout: 90000, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key } });
    const jb = JSON.parse(raw);
    meter(model + ' (backup)', jb.usage && jb.usage.prompt_tokens, jb.usage && jb.usage.completion_tokens, opts.tier);
    return { text: jb.choices[0].message.content, sources: [], queries: [], model: model + ' (backup)' };
  }

  // One entry point for every AI feature, built to survive free-tier limits:
  // retired model (404) → discover; rate limit (429) → short wait, then lighter models; then backup provider.
  async function call(tier, messages, opts) {
    opts = Object.assign({ tier }, opts || {});
    const c = cfg();
    if (!c.key && !(FINN.settings().backupKey || window.FINN_BACKUP_KEY)) throw new Error('Add an AI key in Settings');
    let lastErr = null;
    if (c.key) {
      if (c.provider === 'openai') {
        try { return await openaiCall(tier === 'smart' ? c.smart : c.fast, messages, opts); } catch (e) { lastErr = e; }
      } else {
        const tried = {};
        const queue = [tier === 'smart' ? c.smart : c.fast, tier === 'smart' ? c.fast : c.smart];
        let discovered = false, waited = false;
        while (queue.length) {
          const model = queue.shift();
          if (!model || tried[model]) continue;
          tried[model] = true;
          try { return await geminiCall(model, messages, opts); } catch (e) {
            lastErr = e;
            const msg = e.message || '';
            if (/HTTP 40[13]/.test(msg) && /key|permission|unauth|denied/i.test(msg)) break;
            if (/HTTP 429/.test(msg)) {
              const d = retryDelayMs(e);
              if (!waited && d != null && d <= 8000 && !/limit: 0/.test(msg)) { waited = true; await wait(d); tried[model] = false; queue.unshift(model); continue; }
            }
            if (!discovered && /HTTP (404|429)|not found|not supported/i.test(msg)) {
              discovered = true;
              try { const pick = await discoverGemini(c.key); (tier === 'smart' ? [pick.smart, pick.fast] : [pick.fast, pick.smart]).concat(pick.all).forEach((m) => queue.push(m)); } catch (e2) { /* keep going */ }
            }
          }
        }
      }
    }
    try { return await backupCall(messages, opts); } catch (e) { if (e.message !== 'no backup') lastErr = e; }
    throw friendly(lastErr || new Error('AI unavailable'));
  }

  async function chat(tier, messages, json) {
    const r = await call(tier, messages, { json });
    return json ? parseJSON(r.text) : r.text;
  }

  const GROUND = 'You are FINN, a buy-side equity analyst. Use ONLY the primary-source material provided: the company\'s reported financials ' +
    'and its own earnings-call transcripts. Do not use outside knowledge, news, or broker views. If the material does not support a claim, say so. Be terse and numeric.';

  // ---------- transcript text (pdf.js, loaded only when needed) ----------
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
  }
  async function pdfjs() {
    if (!window.pdfjsLib) { await loadScript('lib/pdf.worker.min.js'); await loadScript('lib/pdf.min.js'); }
    return window.pdfjsLib;
  }
  async function pdfText(url, maxPages) {
    const lib = await pdfjs();
    const buf = await FINN.http('GET', url, { type: 'arraybuffer', timeout: 45000 });
    const pdf = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const n = Math.min(pdf.numPages, maxPages || 40);
    let text = '';
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      text += tc.items.map((it) => it.str).join(' ') + '\n';
    }
    return text;
  }

  // Keep only forward-looking passages: cuts tokens ~5-10x before the model sees them.
  const FWD = /(guid|expect|target|outlook|aim|anticipat|visib|should (be|see|grow|reach)|will (be|grow|reach|see|achieve)|going forward|next (year|quarter)|fy ?'?2\d|fy ?\d\d|h[12] ?fy|margin|growth|capex|order book|pipeline|double[- ]digit|crore|%)/i;
  function forwardPassages(text, cap) {
    const sents = text.replace(/\s+/g, ' ').split(/(?<=[.?!])\s+/);
    const keep = [];
    let len = 0;
    for (let i = 0; i < sents.length && len < cap; i++) {
      const s = sents[i];
      if (s.length > 40 && s.length < 600 && FWD.test(s) && /(expect|guid|target|will|should|aim|outlook|anticipat|going forward|visib)/i.test(s)) { keep.push(s); len += s.length; }
    }
    return keep.join('\n');
  }

  async function extractGuidance(call, companyName) {
    const key = 'finn.g.' + call.transcript;
    const hit = FINN.store.get(key, null);
    if (hit) { usage.cache++; saveUsage(); return hit; }
    const text = await pdfText(call.transcript, 40);
    const passages = forwardPassages(text, 9000);
    if (!passages) return { call: call.label, items: [] };
    const out = await chat('fast', [
      { role: 'system', content: GROUND },
      { role: 'user', content: 'Earnings call of ' + companyName + ' held ' + call.label + '. Forward-looking passages from the transcript:\n\n' + passages +
        '\n\nExtract explicit management guidance on headline numbers (revenue/volume growth, EBITDA or operating margin, profit, capex, order book, debt). ' +
        'Return JSON {"items":[{"metric":"","promise":"short, with the number","period":"e.g. FY27 or next 2 quarters","quote":"<=20 words verbatim"}]}. Max 5 items, most material first. Empty list if none.' },
    ], true);
    const res = { call: call.label, items: (out.items || []).slice(0, 5) };
    FINN.store.set(key, res);
    return res;
  }

  // Narrative vs numbers: what was promised on past calls vs what the reported numbers show.
  async function trackGuidance(c, onStep) {
    const calls = c.concalls.filter((x) => x.transcript).slice(0, 4);
    if (!calls.length) throw new Error('No concall transcripts are listed for ' + c.name + ' on screener.in.');
    const cacheKey = 'finn.gt.' + c.sym + '.' + calls[0].label;
    const hit = FINN.store.get(cacheKey, null);
    if (hit) { usage.cache++; saveUsage(); return hit; }

    const extracted = [];
    for (let i = 0; i < calls.length; i++) {
      onStep('Reading ' + calls[i].label + ' transcript (' + (i + 1) + '/' + calls.length + ')');
      try { extracted.push(await extractGuidance(calls[i], c.name)); }
      catch (e) { extracted.push({ call: calls[i].label, items: [], error: e.message }); }
    }
    const items = extracted.filter((e) => e.items.length);
    if (!items.length) {
      const errs = extracted.filter((e) => e.error).map((e) => e.call + ': ' + e.error);
      throw new Error(errs.length ? 'Could not read transcripts — ' + errs.join('; ') : 'No explicit numeric guidance found in the last ' + calls.length + ' calls.');
    }
    onStep('Checking promises against reported numbers');
    const out = await chat('smart', [
      { role: 'system', content: GROUND },
      { role: 'user', content: 'GUIDANCE GIVEN ON EARNINGS CALLS (oldest last):\n' + JSON.stringify(items) +
        '\n\nREPORTED NUMBERS:\n' + FINN.factSheet(c) +
        '\n\nFor each guidance item whose period has at least partly elapsed, compare promise with delivery using the reported numbers. ' +
        'If the period has not elapsed, verdict "pending" with the run-rate so far. Return JSON {"rows":[{"said":"call label","metric":"","promised":"","delivered":"","verdict":"met|partial|missed|pending","why":"<=18 words"}],' +
        '"credibility":"high|medium|low","takeaway":"2 sentences: how much to trust current guidance and the single number to watch next quarter"}' },
    ], true);
    const res = {
      rows: (out.rows || []).map((r) => Object.assign(r, { verdict: ['met', 'partial', 'missed', 'pending'].indexOf(r.verdict) >= 0 ? r.verdict : 'partial' })),
      credibility: out.credibility || 'medium',
      takeaway: out.takeaway || '',
      calls: calls.map((x) => x.label),
      guidance: items,
      at: Date.now(),
    };
    FINN.store.set(cacheKey, res);
    return res;
  }

  async function ask(c, question, history) {
    const gt = FINN.store.get('finn.gt.' + c.sym + '.' + ((c.concalls[0] || {}).label || ''), null);
    const ctx = FINN.factSheet(c) + (c.about ? '\nAbout: ' + c.about : '') + (gt ? '\nGuidance from earnings calls: ' + JSON.stringify(gt.guidance) : '');
    const msgs = [{ role: 'system', content: GROUND + '\n\nMATERIAL:\n' + ctx }];
    (history || []).slice(-6).forEach((m) => msgs.push({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));
    msgs.push({ role: 'user', content: question + '\n(Answer in under 90 words. Cite the table or call you used, e.g. [Quarterly], [Cash flow], [Concall Aug 2026].)' });
    return chat('fast', msgs, false);
  }

  // One-line read of a filing, used on demand for non-standard announcements.
  async function explainFiling(a, companyName) {
    const out = await chat('fast', [
      { role: 'system', content: 'You triage stock-exchange filings for a fund manager. One sentence, max 25 words: what happened and whether it matters. No speculation beyond the text.' },
      { role: 'user', content: companyName + ' filing: ' + a.title + (a.summary ? ' — ' + a.summary : '') },
    ], false);
    return out.trim();
  }

  // ---------- results straight from the results filing (PDF) ----------
  function numArr(a) { return Array.isArray(a) ? a.slice(0, 3).map((v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v))) : [null, null, null]; }
  async function readResults(filing, c) {
    const key = 'finn.rf.' + filing.href;
    const hit = FINN.store.get(key, null);
    if (hit) { usage.cache++; saveUsage(); return hit; }
    const text = (await pdfText(filing.href, 8)).replace(/\s+/g, ' ').slice(0, 24000);
    if (text.length < 200) throw new Error('Filing PDF has no readable text (likely a scan)');
    const out = await chat('smart', [
      { role: 'system', content: 'You extract numbers from Indian listed-company quarterly results filings. Use only the text given. Never guess.' },
      { role: 'user', content: 'Results filing of ' + c.name + ':\n' + text +
        '\n\nFrom the CONSOLIDATED statement (standalone only if no consolidated), take three columns: this quarter, the previous quarter, and the same quarter last year. ' +
        'Return JSON {"period":"e.g. Sep 2026","basis":"consolidated|standalone","unit":"e.g. ₹ crore or ₹ lakh","revenue":[cur,prevQ,lastYearQ],"ebitda":[...],"pbt":[...],"pat":[...]} ' +
        'where revenue = revenue from operations; ebitda = PBT + finance costs + depreciation − other income (compute it); pbt = profit before tax (before exceptional items if shown separately, else as reported); pat = net profit for the period. Numbers only, null if absent.' },
    ], true);
    const res = { period: out.period || '', basis: out.basis || '', unit: out.unit || '', rows: { Revenue: numArr(out.revenue), EBITDA: numArr(out.ebitda), PBT: numArr(out.pbt), PAT: numArr(out.pat) } };
    if (!res.rows.Revenue[0]) throw new Error('Could not find the results table in this filing');
    FINN.store.set(key, res);
    return res;
  }

  // ---------- who is the new person? (SEBI requires a brief profile in appointment filings) ----------
  async function readProfile(filing, c) {
    const key = 'finn.pf2.' + (filing.href || filing.title);
    const hit = FINN.store.get(key, null);
    if (hit) { usage.cache++; saveUsage(); return hit; }
    let text = filing.title + '. ' + (filing.summary || '');
    if (filing.href) { try { text += '\n' + (await pdfText(filing.href, 6)).replace(/\s+/g, ' ').slice(0, 15000); } catch (e) { /* summary only */ } }
    // Public-profile lookup (e.g. LinkedIn) for the people named — push-side enrichment allowed by the brief.
    const co = c.name.replace(/\s+(Ltd|Limited)\.?$/i, '');
    const names = FINN.peopleIn(filing.title + ' ' + (filing.summary || '') + ' ' + text.slice(0, 3000)).slice(0, 2);
    const web = [];
    if (FINN.webSearch) {
      for (const n of names) {
        try { (await FINN.webSearch.web(n + ' ' + co + ' linkedin', 4)).forEach((r) => web.push(Object.assign({ who: n }, r))); } catch (e) { /* optional */ }
      }
    }
    const webTxt = web.length ? '\n\nPUBLIC PROFILE SEARCH RESULTS (use only if clearly the same person — same company or role; cite as [n]):\n' +
      web.map((r, i) => '[' + (i + 1) + '] (' + r.who + ') ' + r.title + ': ' + (r.snippet || '') + ' <' + r.uri + '>').join('\n') : '';
    const out = await chat('fast', [
      { role: 'system', content: 'You read management-change filings for an investor. Use only the filing text and the search results given; never add facts from memory. Mark web-sourced bullets with [n].' },
      { role: 'user', content: c.name + ' filing:\n' + text + webTxt + '\n\nReturn JSON {"people":[{"name":"","role":"","change":"appointed|resigned|retired|re-appointed|other","effective":"date or \'\'","background":["<=4 short bullets: experience, past employers, education — only if stated"],"profile":"[n] of the matching public profile, or \'\'"}],"why":"one line: why it matters to a shareholder, or \'\'"}' },
    ], true);
    const people = (out.people || []).slice(0, 4).map((p) => {
      const n = parseInt(String(p.profile || '').replace(/\D/g, ''), 10);
      const prof = n && web[n - 1] ? web[n - 1] : web.find((r) => r.who && p.name && r.who.split(' ').slice(-1)[0] === p.name.split(' ').slice(-1)[0] && /linkedin\.com\/in\//.test(r.uri));
      return Object.assign({}, p, { profileUrl: prof ? prof.uri : null, profileSrc: prof ? (/linkedin/.test(prof.uri) ? 'LinkedIn' : 'web') : null });
    });
    const res = { people, why: out.why || '', webUsed: web.length };
    FINN.store.set(key, res);
    return res;
  }

  // ---------- business snapshot: what it does, segments, revenue mix (from the investor deck / annual report) ----------
  const SEG = /(segment|vertical|division|business mix|revenue mix|revenue break|share of revenue|% of (total )?revenue|contribut|geograph|domestic|export|international|product mix|portfolio mix|customer mix|we are|leading|manufactur|operat)/i;
  async function businessSnapshot(c) {
    const deck = c.concalls.find((x) => x.ppt);
    const doc = deck ? { url: deck.ppt, label: 'Investor presentation ' + deck.label, pages: 30 } : c.annualReports[0] ? { url: c.annualReports[0].href, label: c.annualReports[0].text.replace(/from (bse|nse)/i, '').trim(), pages: 45 } : null;
    if (!doc) throw new Error('No investor presentation or annual report is listed for this company.');
    const key = 'finn.bs.' + doc.url;
    const hit = FINN.store.get(key, null);
    if (hit) { usage.cache++; saveUsage(); return hit; }
    const raw = (await pdfText(doc.url, doc.pages)).replace(/\s+/g, ' ');
    if (raw.length < 80) throw new Error('The document has no readable text (it may be scanned images).');
    const parts = raw.split(/(?<=[.?!])\s+|\s{2,}/).filter((x) => x.length > 25 && x.length < 500 && SEG.test(x));
    const text = (parts.join('\n') || raw).slice(0, 12000);
    const out = await chat('fast', [
      { role: 'system', content: 'You summarise a company\'s business for an investor using ONLY the document text given. Never guess numbers; use null when a share is not stated.' },
      { role: 'user', content: c.name + ' — ' + doc.label + ' (excerpts):\n' + text +
        '\n\nReturn JSON {"what":"one sentence: what the company does and for whom","segments":[{"name":"","share_pct":number|null,"growth_pct":number|null,"note":"<=10 words"}],"geography":[{"name":"","share_pct":number|null}],"period":"period the mix refers to, e.g. FY26 or Q2 FY27","moat":"one line on competitive position, only if stated"}. Max 6 segments.' },
    ], true);
    const res = { what: out.what || '', segments: (out.segments || []).slice(0, 6), geography: (out.geography || []).slice(0, 4), period: out.period || '', moat: out.moat || '', source: doc.label, url: doc.url };
    FINN.store.set(key, res);
    return res;
  }

  // Latest call's explicit guidance on headline numbers (one transcript, cheap model, cached).
  async function latestGuidance(c) {
    const call = c.concalls.find((x) => x.transcript);
    if (!call) throw new Error('No concall transcript is listed for this company.');
    const r = await extractGuidance(call, c.name);
    return Object.assign({ url: call.transcript }, r);
  }

  // ---------- bull vs bear, grounded in the numbers (+ concall guidance if read) ----------
  async function bullBear(c) {
    const key = 'finn.bb.' + c.sym + '.' + new Date().toDateString();
    const hit = FINN.store.get(key, null);
    if (hit) { usage.cache++; saveUsage(); return hit; }
    const gt = FINN.store.get('finn.gt.' + c.sym + '.' + ((c.concalls[0] || {}).label || ''), null);
    const out = await chat('smart', [
      { role: 'system', content: GROUND },
      { role: 'user', content: FINN.factSheet(c) + (gt ? '\nConcall guidance: ' + JSON.stringify(gt.guidance) : '') + (c.about ? '\nBusiness: ' + c.about : '') +
        '\n\nWrite the tightest bull and bear case an investment committee would want. Each point must cite a number from the material. ' +
        'Return JSON {"bull":["3 bullets, <=18 words"],"bear":["3 bullets, <=18 words"],"swing":"the one metric that decides which case wins, <=15 words"}' },
    ], true);
    const res = { bull: (out.bull || []).slice(0, 3), bear: (out.bear || []).slice(0, 3), swing: out.swing || '' };
    FINN.store.set(key, res);
    return res;
  }

  // ---------- Ask FINN: general agent with Google Search + FINN's own data as context ----------
  const AGENT = 'You are FINN, an investment research assistant for an Indian public-markets fund. ' +
    'Answer clearly and concisely for a busy investor: lead with the answer, then 2-5 short bullets with numbers. Use ₹ and Indian conventions (crore, lakh, FY). ' +
    'When FINN DATA is provided, treat it as the authoritative source for company numbers and filings, and say so. ' +
    'Use Google Search for news, prices, events, people and anything after the data. Never invent numbers; if unsure, say what to check. Not investment advice.';
  async function agent(question, history, context, ctxInfo, onStep, forceFinn) {
    const st = FINN.settings();
    let results = [];
    const useGrounding = !forceFinn && !!(cfg().search && st.webMode === 'google' && cfg().key);
    if (!useGrounding && st.webMode !== 'off' && FINN.webSearch) {
      if (onStep) onStep('Searching the web');
      try { results = await FINN.webSearch.forQuestion(question, ctxInfo); } catch (e) { results = []; }
      if (onStep) onStep(results.length ? 'Reading ' + results.length + ' sources' : 'Thinking');
    }
    const web = results.length ? '\n\nWEB RESULTS (cite as [n]):\n' + results.map((r, i) => '[' + (i + 1) + '] ' + r.title + (r.publisher ? ' — ' + r.publisher : '') +
      (r.date ? ' (' + new Date(r.date).toDateString() + ')' : '') + (r.snippet ? ': ' + r.snippet : '')).join('\n') : '';
    const msgs = [{ role: 'system', content: AGENT + (results.length ? ' Cite web facts with [n] matching WEB RESULTS. Headlines are not full articles — say so when it matters.' : '') +
      (context ? '\n\nFINN DATA (from filings and reported financials):\n' + context : '') + web }];
    (history || []).slice(-8).forEach((m) => msgs.push({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));
    msgs.push({ role: 'user', content: question });
    let r;
    try { r = await call('smart', msgs, { search: useGrounding }); }
    catch (e) {
      if (!useGrounding) throw e;
      // Google Search grounding has its own (small) quota → same question with FINN's free search.
      return agent(question, history, context, ctxInfo, onStep, true);
    }
    if (results.length) { r.sources = results.map((x) => ({ title: x.publisher || x.title, uri: x.uri, headline: x.title })); r.queries = []; }
    return r;
  }

  // Settings → Test AI: check primary and backup separately and say exactly what happened.
  async function ping() {
    const lines = [];
    let ok = false;
    const msgs = [{ role: 'user', content: 'Reply with exactly: OK' }];
    const c = cfg();
    if (c.key) {
      try {
        let r = null, lastE = null;
        if (c.provider === 'openai') r = await openaiCall(c.fast, msgs, {});
        else {
          try { r = await geminiCall(c.fast, msgs, {}); } catch (e) {
            if (!/HTTP (404|429)/.test(e.message)) throw e;
            lastE = e;
            const pick = await discoverGemini(c.key);
            for (const m of [pick.fast].concat(pick.all)) {
              try { r = await geminiCall(m, msgs, {}); break; } catch (e2) { lastE = e2; if (!/HTTP (404|429)/.test(e2.message)) throw e2; }
            }
          }
        }
        if (!r) throw lastE;
        ok = true; lines.push('✓ ' + PROVIDERS[c.provider].label + ' working · ' + r.model);
      } catch (e) { lines.push('✕ ' + PROVIDERS[c.provider].label + ': ' + friendly(e).message + ' — ' + String(e.message).slice(0, 160)); }
    }
    if (FINN.settings().backupKey || window.FINN_BACKUP_KEY) {
      try { const r = await backupCall(msgs, {}); ok = true; lines.push('✓ Backup working · ' + r.model); }
      catch (e) { lines.push('✕ Backup: ' + String(e.message).slice(0, 160)); }
    } else lines.push('• No backup key — add a free Groq key for reliability');
    return { ok, lines };
  }

  FINN.ai = { ping, businessSnapshot, latestGuidance, usage: () => usage, PROVIDERS, enabled, cfg, agent, discoverGemini, trackGuidance, ask, explainFiling, pdfText, forwardPassages, readResults, readProfile, bullBear };
})(window.FINN = window.FINN || {});
