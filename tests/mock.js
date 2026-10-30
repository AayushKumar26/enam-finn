// Mock screener.in / Yahoo / Gemini so the app's live code paths can be exercised offline.
const fs = require('fs');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dstr(daysAgo){ const d=new Date(Date.now()-daysAgo*864e5); return d.getDate()+' '+MON[d.getMonth()]; }
function hash(s){ let h=0; for(const ch of s) h=(h*31+ch.charCodeAt(0))>>>0; return h; }
function table(headers, rows){
  return '<table class="data-table responsive-text-nowrap"><thead><tr><th class="text"></th>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+
   rows.map(([l,vals])=>'<tr><td class="text"><button class="button-plain">'+l+'&nbsp;<span class="blue-icon">+</span></button></td>'+vals.map(v=>'<td>'+(v==null?'':v.toLocaleString('en-IN')+(/%/.test(l)?'%':''))+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
function mkpage(sym){
  const h=hash(sym), g=1+((h%30)-5)/100, base=500+(h%5000);
  const qh=['Sep 2024','Dec 2024','Mar 2025','Jun 2025','Sep 2025','Dec 2025','Mar 2026','Jun 2026','Sep 2026'];
  const sales=qh.map((_,i)=>Math.round(base*Math.pow(g,i/4)*(1+0.05*Math.sin(i))));
  const opm=qh.map((_,i)=>15+((h>>i)%5)-2);
  const op=sales.map((s,i)=>Math.round(s*opm[i]/100));
  const pbt=op.map(o=>Math.round(o*0.75)); const np=pbt.map(p=>Math.round(p*0.75));
  const yh=['Mar 2019','Mar 2020','Mar 2021','Mar 2022','Mar 2023','Mar 2024','Mar 2025','Mar 2026','TTM'];
  const ys=yh.map((_,i)=>Math.round(base*3.6*Math.pow(g,i)));
  const yop=ys.map(s=>Math.round(s*0.16)), ynp=yop.map(o=>Math.round(o*0.55));
  const cfo=ynp.map((n,i)=>Math.round(n*(0.5+((h>>i)%8)/10)));
  const bank = sym==='HDFCBANK';
  const salesL = bank?'Revenue':'Sales', opL = bank?'Financing Profit':'Operating Profit', opmL = bank?'Financing Margin %':'OPM %';
  const shh=['Sep 2025','Dec 2025','Mar 2026','Jun 2026','Sep 2026'];
  const prom = shh.map((_,i)=> +(55 - (h%3)*i*0.6).toFixed(2));
  const ann=[
    ['Outcome of Board Meeting - Financial Results for the quarter ended Sep 30, 2026', dstr(0)+' - Q2 revenue up '+Math.round((g-1)*100*4)+'% YoY; board approves interim dividend.'],
    ['Announcement under Regulation 30 (LODR)-Change in Management', dstr(1)+' - Resignation of Mr. Rakesh Kumar Gupta as Chief Financial Officer; Ms. Anita Desai appointed CFO effective Nov 1.'],
    ['Compliance Certificate under Regulation 74(5)', dstr(1)+' - Routine RTA certificate.'],
    ['Announcement under Regulation 30 (LODR)-Analyst / Investor Meet - Intimation', dstr(3)+' - Meetings with funds on 5 Nov.'],
    ['Acquisition of 51% stake in XYZ Pvt Ltd', dstr(5)+' - Rs 120 crore cash deal adds new segment.'],
  ].filter((_,i)=> (h+i)%3!==0 || i===0);
  return `<html><body><div id="top"><h1 class="h2 shrink-text">${sym} Industries Ltd</h1>
  <div class="company-info" data-company-id="${h%9000}"><div class="company-profile"><div class="about"><p>${sym} makes widgets and services across India with three segments and exports to 40 countries. It is a leading player with 25% market share.</p></div></div>
  <ul id="top-ratios">
   <li><span class="name">Market Cap</span><span class="value">₹ <span class="number">${(base*40).toLocaleString('en-IN')}</span> Cr.</span></li>
   <li><span class="name">Current Price</span><span class="value">₹ <span class="number">${(base*1.3).toFixed(0)}</span></span></li>
   <li><span class="name">High / Low</span><span class="value">₹ <span class="number">${(base*1.6).toFixed(0)}</span> / <span class="number">${(base*1.0).toFixed(0)}</span></span></li>
   <li><span class="name">Stock P/E</span><span class="value"><span class="number">32.4</span></span></li>
   <li><span class="name">Book Value</span><span class="value">₹ <span class="number">210</span></span></li>
   <li><span class="name">Dividend Yield</span><span class="value"><span class="number">0.45</span> %</span></li>
   <li><span class="name">ROCE</span><span class="value"><span class="number">${12+h%20}</span> %</span></li>
   <li><span class="name">ROE</span><span class="value"><span class="number">${10+h%15}</span> %</span></li>
  </ul></div></div>
  <section id="analysis"><div class="pros"><ul><li>Debt free</li></ul></div><div class="cons"><ul><li>Low growth</li></ul></div></section>
  <section id="quarters">${table(qh,[[salesL,sales],['Expenses',sales.map((s,i)=>s-op[i])],[opL,op],[opmL,opm],['Other Income',sales.map(()=>12)],['Interest',sales.map(()=>bank?400:8)],['Depreciation',sales.map(()=>20)],['Profit before tax',pbt],['Tax %',qh.map(()=>25)],['Net Profit',np],['EPS in Rs',np.map(n=>+(n/50).toFixed(2))]])}</section>
  <section id="profit-loss">${table(yh,[[salesL,ys],[opL,yop],[opmL,yh.map(()=>16)],['Other Income',ys.map(()=>50)],['Interest',ys.map(()=>bank?1600:30)],['Depreciation',ys.map(()=>80)],['Profit before tax',yop.map(o=>Math.round(o*0.73))],['Tax %',yh.map(()=>h%2?25:12)],['Net Profit',ynp]])}
   <table class="ranges-table"><tr><th colspan="2">Compounded Sales Growth</th></tr><tr><td>10 Years:</td><td>14%</td></tr><tr><td>5 Years:</td><td>${Math.round((g-1)*100)}%</td></tr><tr><td>3 Years:</td><td>12%</td></tr><tr><td>TTM:</td><td>9%</td></tr></table>
   <table class="ranges-table"><tr><th colspan="2">Compounded Profit Growth</th></tr><tr><td>10 Years:</td><td>18%</td></tr><tr><td>5 Years:</td><td>11%</td></tr><tr><td>3 Years:</td><td>-4%</td></tr><tr><td>TTM:</td><td>6%</td></tr></table></section>
  <section id="balance-sheet">${table(yh.slice(0,8),[['Equity Capital',yh.slice(0,8).map((_,i)=>50+(h%2?i*3:0))],['Reserves',ys.slice(0,8).map(s=>Math.round(s*0.6))],['Borrowings',ys.slice(0,8).map((s,i)=>Math.round(s*0.1*(1+(h%3)*i/4)))],['Total Liabilities',ys.slice(0,8)],['Fixed Assets',ys.slice(0,8).map(s=>Math.round(s*0.4))],['CWIP',ys.slice(0,8).map(s=>Math.round(s*0.05*(h%4)))]])}</section>
  <section id="cash-flow">${table(yh.slice(0,8),[['Cash from Operating Activity',cfo.slice(0,8)],['Cash from Investing Activity',cfo.slice(0,8).map(c=>-c)],['Free Cash Flow',cfo.slice(0,8).map((c,i)=>c-Math.round(ys[i]*0.08))]])}</section>
  <section id="ratios">${table(yh.slice(0,8),[['Debtor Days',yh.slice(0,8).map((_,i)=>40+i*(h%5))],['Inventory Days',yh.slice(0,8).map(()=>60)],['Cash Conversion Cycle',yh.slice(0,8).map((_,i)=>50+i*(h%7))],['ROCE %',yh.slice(0,8).map(()=>12+h%20)]])}</section>
  <section id="shareholding"><div id="quarterly-shp">${table(shh,[['Promoters',prom],['FIIs',shh.map((_,i)=>20+i*0.4)],['DIIs',shh.map(()=>12.2)],['Public',shh.map((_,i)=>12.8-i*0.3)]])}</div></section>
  <section id="documents">
   <div class="documents announcements"><h3>Announcements</h3><ul class="list-links">${ann.map(a=>'<li><a href="https://www.bseindia.com/x/'+hash(a[0]+sym)+'.pdf" target="_blank">'+a[0]+'<div class="ink-600 smaller">'+a[1]+'</div></a></li>').join('')}</ul></div>
   <div class="documents annual-reports"><h3>Annual reports</h3><ul class="list-links"><li><a href="https://www.bseindia.com/ar26.pdf">Financial Year 2026 from bse</a></li><li><a href="https://www.bseindia.com/ar25.pdf">Financial Year 2025 from bse</a></li></ul></div>
   <div class="documents credit-ratings"><h3>Credit ratings</h3><ul class="list-links"><li><a href="https://crisil.com/r.html">Rating update 26 May from crisil</a></li></ul></div>
   <div class="documents concalls"><h3>Concalls</h3><ul class="list-links">
    <li class="flex"><div class="ink-600">Aug 2026</div><a class="concall-link" href="https://www.bseindia.com/t1.pdf">Transcript</a><div class="concall-link">Notes</div><a class="concall-link" href="https://www.bseindia.com/p1.pdf">PPT</a></li>
    <li class="flex"><div class="ink-600">May 2026</div><a class="concall-link" href="https://www.bseindia.com/t2.pdf">Transcript</a><a class="concall-link" href="https://www.bseindia.com/p2.pdf">PPT</a></li>
   </ul></div></section></body></html>`;
}
function yahoo(sym){
  const h=hash(sym); const n=250; const ts=[],close=[],vol=[];
  let p=500+(h%3000);
  for(let i=0;i<n;i++){ ts.push(Math.floor(Date.now()/1000)-(n-i)*86400); p*=1+Math.sin(i/9+h)*0.01; close.push(+p.toFixed(2)); vol.push(100000+(i*37%50000)); }
  const shock=[(h%13)-6, -(h%9)][h%2]; close[n-1]=+(close[n-2]*(1+shock/100)).toFixed(2); vol[n-1]= h%3===0 ? 400000 : 120000;
  return {chart:{result:[{timestamp:ts,indicators:{quote:[{close,volume:vol}]}}]}};
}
module.exports = async function install(page, opts={}){
  opts = opts || {};
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const cors = {'Access-Control-Allow-Origin':'*'};
    let m;
    if ((m = url.match(/screener\.in\/company\/([^/]+)\/(consolidated\/)?$/)) && ['ZOMATO', 'TATAMOTORS', 'XYZFAKE', 'NOSUCHCO'].includes(decodeURIComponent(m[1]))) return route.fulfill({status:404, headers:cors, contentType:'text/html', body:'<h1>Page not found</h1>'});
    if ((m = url.match(/screener\.in\/company\/([^/]+)\/(consolidated\/)?$/))) return route.fulfill({status:200, headers:{...cors,'content-type':'text/html'}, body: page_(decodeURIComponent(m[1]))});
    if (url.includes('screener.in/api/company/search')) { const q=new URL(url).searchParams.get('q'); return route.fulfill({status:200, headers:cors, contentType:'application/json', body: JSON.stringify([{id:1,name:'Reliance Industries Ltd',url:'/company/RELIANCE/consolidated/'},{id:2,name:'Reliance Infrastructure Ltd',url:'/company/RELINFRA/consolidated/'},{id:3,name:'Reliance Power Ltd',url:'/company/RPOWER/consolidated/'},{id:4,name:'Reliance Industrial Infrastructure Ltd',url:'/company/RIIL/'},{id:5,name:'Reliance Chemotex Industries Ltd',url:'/company/503162/'},{id:6,name:'Search everywhere: '+q,url:'/full-text-search/?q='+q}])}); }
    if ((m = url.match(/finance\/chart\/([^.?]+)\./))) return route.fulfill({status:200, headers:cors, contentType:'application/json', body: JSON.stringify(yahoo(m[1]))});
    if (url.includes('nseindia.com/api/corporate-announcements')) {
      const sym = new URL(url).searchParams.get('symbol'); const h = hash(sym);
      const at = (hrs) => { const d = new Date(Date.now() - hrs*3600e3); const p=(n)=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':00'; };
      const list = [
        { desc: 'Financial Result Updates', attchmntText: sym+' has informed the Exchange about Financial Results for the quarter ended September 30, 2026', attchmntFile: 'https://nsearchives.nseindia.com/corporate/res_'+sym+'.pdf', sort_date: at(3+h%5) },
        { desc: 'Change in Management', attchmntText: 'Appointment of Ms. Anita Desai as Chief Financial Officer and resignation of Mr. Rakesh Kumar Gupta', attchmntFile: 'https://nsearchives.nseindia.com/corporate/apt_'+sym+'.pdf', sort_date: at(10) },
        { desc: 'Certificate under SEBI (Depositories and Participants) Regulations, 2018', attchmntText: 'Certificate under Reg 74(5)', attchmntFile: 'https://nsearchives.nseindia.com/corporate/c.pdf', sort_date: at(20) },
        { desc: 'Spurt in Volume', attchmntText: 'Clarification sought on increase in volume; company states no undisclosed information', attchmntFile: 'https://nsearchives.nseindia.com/corporate/s.pdf', sort_date: at(30) },
        { desc: 'Acquisition', attchmntText: 'Acquisition of 51% stake in a precision-tools maker for Rs 120 crore', attchmntFile: 'https://nsearchives.nseindia.com/corporate/acq_'+sym+'.pdf', sort_date: at(60) },
        { desc: 'Board Meeting Intimation', attchmntText: 'Board meeting on 12-Nov-2026 to consider unaudited financial results', attchmntFile: 'https://nsearchives.nseindia.com/corporate/bm.pdf', sort_date: at(200) },
      ].filter((_, i) => i === 0 || (h + i) % 4 !== 0);
      if (opts.nseDown) return route.fulfill({status:403, headers:cors, body:'blocked'});
      return route.fulfill({status:200, headers:cors, contentType:'application/json', body: JSON.stringify(list)});
    }
    if (url === 'https://www.nseindia.com/') return route.fulfill({status:200, headers:cors, contentType:'text/html', body:'<html>nse</html>'});
    if (url.includes('api.bseindia.com')) {
      return route.fulfill({status:200, headers:cors, contentType:'application/json', body: JSON.stringify({Table:[
        {NEWSSUB:'Outcome of Board Meeting - Financial Results', HEADLINE:'Board approved unaudited results for quarter ended 30 Sep 2026', CATEGORYNAME:'Result', SUBCATNAME:'Financial Results', ATTACHMENTNAME:'res_bse.pdf', NEWS_DT: new Date(Date.now()-5*3600e3).toISOString().slice(0,19)},
        {NEWSSUB:'Credit Rating', HEADLINE:'CRISIL reaffirms AA+/Stable', CATEGORYNAME:'Company Update', SUBCATNAME:'Credit Rating', ATTACHMENTNAME:'cr.pdf', NEWS_DT: new Date(Date.now()-40*3600e3).toISOString().slice(0,19)}]})});
    }
    if (url.endsWith('.pdf') && (url.includes('/res_') || url.includes('AttachLive/res'))) return route.fulfill({status:200, headers:cors, contentType:'application/pdf', body: fs.readFileSync(__dirname + '/results.pdf')});
    if (url.endsWith('.pdf') && url.includes('/apt_')) return route.fulfill({status:200, headers:cors, contentType:'application/pdf', body: fs.readFileSync(__dirname + '/appoint.pdf')});
    if (url.endsWith('.pdf') && /\/p\d\.pdf$/.test(url)) return route.fulfill({status:200, headers:cors, contentType:'application/pdf', body: fs.readFileSync(__dirname + '/deck.pdf')});
    if (url.endsWith('.pdf') && url.includes('/t')) return route.fulfill({status:200, headers:cors, contentType:'application/pdf', body: fs.readFileSync(__dirname + '/transcript.pdf')});
    if (url.includes('news.google.com/rss/search')) {
      const q = new URL(url).searchParams.get('q');
      const d = (h) => new Date(Date.now() - h * 3600e3).toUTCString();
      const items = [['Shares jump after strong Q2 results', 'Economic Times', 3], ['Brokerages raise target price post earnings', 'Moneycontrol', 9], ['Company wins large export order', 'Business Standard', 30]]
        .map(([t, src, h], i) => '<item><title>' + q.replace(' share', '') + ': ' + t + ' - ' + src + '</title><link>https://news.google.com/rss/articles/' + encodeURIComponent(q) + i + '</link><pubDate>' + d(h) + '</pubDate><source url="https://x.com">' + src + '</source></item>').join('');
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/rss+xml', body: '<?xml version="1.0"?><rss><channel>' + items + '</channel></rss>' });
    }
    if (url.includes('html.duckduckgo.com')) {
      const q = new URL(url).searchParams.get('q');
      const res = (/linkedin/i.test(q) ? [['- CFO - Auto components | LinkedIn', 'https://in.linkedin.com/in/anita-desai-ca'], ['profile', 'https://example.com/people']] : [['Investor relations', 'https://example.com/ir'], ['Annual report highlights', 'https://example.com/ar']]).map(([t, u]) =>
        '<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=' + encodeURIComponent(u) + '&rut=x">' + q + ' ' + t + '</a><a class="result__snippet">Snippet about ' + t.toLowerCase() + '.</a></div>').join('');
      return route.fulfill({ status: 200, headers: cors, contentType: 'text/html', body: '<html><body>' + res + '</body></html>' });
    }
    if (url.includes('api.groq.com/openai/v1/models')) return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }, { id: 'llama-4-70b-versatile' }, { id: 'llama-guard-4-12b' }] }) });
    if (url.includes('api.groq.com/openai/v1/chat/completions')) {
      global.__groq = (global.__groq || 0) + 1;
      const bodyG = JSON.parse(route.request().postData());
      const last = bodyG.messages[bodyG.messages.length - 1].content;
      const txt = /Reply with exactly/.test(last) ? 'OK' : '**Backup answer** from ' + bodyG.model + ' using web results [1].';
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: txt } }] }) });
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      const req = route.request();
      if (req.method() === 'GET' && /\/models\?/.test(url)) {
        return route.fulfill({status:200, headers:cors, contentType:'application/json', body: JSON.stringify({models:[
          {name:'models/gemini-3.6-flash', supportedGenerationMethods:['generateContent','countTokens']},
          {name:'models/gemini-3.8-flash-preview', supportedGenerationMethods:['generateContent']},
          {name:'models/gemini-3.1-flash-lite', supportedGenerationMethods:['generateContent']},
          {name:'models/gemini-3.6-flash-image', supportedGenerationMethods:['generateContent']},
          {name:'models/text-embedding-005', supportedGenerationMethods:['embedContent']}]})});
      }
      const model = decodeURIComponent((url.match(/models\/([^:]+):generateContent/) || [])[1] || '');
      global.__geminiModels = (global.__geminiModels || []).concat([model]);
      const retired = /2\.5/.test(model) || (opts.aliasGone && /latest/.test(model));
      if (opts.geminiQuota) return route.fulfill({status:429, headers:cors, contentType:'application/json', body: JSON.stringify({error:{code:429, message:'You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: ' + model, status:'RESOURCE_EXHAUSTED'}})});
      if (opts.groundingQuota && /google_search/.test(req.postData() || '')) return route.fulfill({status:429, headers:cors, contentType:'application/json', body: JSON.stringify({error:{code:429, message:'Quota exceeded for grounding requests. Please retry in 40s.', status:'RESOURCE_EXHAUSTED'}})});
      if (retired) return route.fulfill({status:404, headers:cors, contentType:'application/json', body: JSON.stringify({error:{code:404, message:'models/'+model+' is not found for API version v1beta', status:'NOT_FOUND'}})});
      const body = JSON.parse(req.postData());
      const sys = (body.systemInstruction && body.systemInstruction.parts[0].text) || '';
      const last = body.contents[body.contents.length-1].parts[0].text;
      const search = !!(body.tools && body.tools.length);
      let content, gm;
      if (last.includes('Extract explicit management guidance')) content = '```json\n{"items":[{"metric":"Revenue growth","promise":"25% growth in FY27","period":"FY27","quote":"We expect revenue growth of 25% for FY27"},{"metric":"EBITDA margin","promise":"4.2% by Q4","period":"Q4 FY27","quote":"We will reach an EBITDA margin of 4.2%"}]}\n```';
      else if (last.includes('GUIDANCE GIVEN')) content = '{"rows":[{"said":"Aug 2026","metric":"Revenue growth","promised":"25% in FY27","delivered":"H1 run-rate +19% YoY","verdict":"partial","why":"Tracking below the 25% promise after two quarters"},{"said":"May 2026","metric":"EBITDA margin","promised":"4.2% by Q4","delivered":"OPM 16% in Sep 2026","verdict":"met","why":"Margin already above guided level"}],"credibility":"medium","takeaway":"Management hits margin promises but over-promises on growth. Watch Q3 revenue growth: below 22% means FY27 guidance is missed."}';
      else if (last.includes('Results filing of')) content = '{"period":"Sep 2026","basis":"consolidated","unit":"₹ crore","revenue":[3420.5,3050.2,2710.8],"ebitda":[435.4,385.9,330.9],"pbt":[402.3,350.6,298.1],"pat":[301.7,262.9,223.4]}';
      else if (sys.includes('management-change filings')) content = '{"people":[{"name":"Anita Desai","role":"Chief Financial Officer","change":"appointed","effective":"1 Nov 2026","profile":"[1]","background":["Chartered Accountant, 22 years experience","CFO of a listed auto-components company for 7 years [1]","Earlier at Deloitte"]},{"name":"Rakesh Kumar Gupta","role":"CFO","change":"resigned","effective":"","background":[]}],"why":"Orderly CFO handover with an experienced listed-company CFO."}';
      else if (last.includes('Max 6 segments')) content = '{"what":"Contract manufacturer of phones and electronics for global brands","segments":[{"name":"Mobile & EMS","share_pct":82,"growth_pct":34,"note":"largest"},{"name":"Consumer Electronics","share_pct":9,"growth_pct":null,"note":""},{"name":"Home Appliances","share_pct":6,"growth_pct":null,"note":""},{"name":"Lighting","share_pct":3,"growth_pct":null,"note":""}],"geography":[{"name":"Domestic","share_pct":88},{"name":"Exports","share_pct":12}],"period":"Q2 FY27","moat":"Leading EMS player serving global brands"}';
      else if (last.includes('tightest bull and bear')) content = '{"bull":["Revenue +26% YoY in Sep 2026 on 16% OPM","ROCE 31% with debt/equity 0.2x","Cash from operations covers capex"],"bear":["3-yr profit CAGR only 4%","OPM down 300bp YoY","Cash conversion 0.5x"],"swing":"Whether OPM recovers above 16% next quarter"}';
      else if (last.includes('Reply with exactly')) content = 'OK';
      else if (sys.includes('WEB RESULTS')) {
        const ctxNote = sys.includes('FINN DATA') ? 'Using your FINN data: ' + ((sys.match(/Company: ([^\n]+)/)||[])[1] || 'portfolio of ' + ((sys.match(/Portfolio \((\d+)/)||[])[1]) + ' holdings') + '.' : 'No FINN data attached.';
        const n = (sys.match(/^\[\d+\]/gm) || []).length;
        content = '**Short answer:** shares rose after strong Q2 results [1], and brokers raised targets [2].\n\n- ' + n + ' web sources read\n- ' + ctxNote;
      }
      else if (search) {
        const ctxNote = sys.includes('FINN DATA') ? 'Using your FINN data: ' + ((sys.match(/Company: ([^\n]+)/)||[])[1] || 'portfolio of ' + ((sys.match(/Portfolio \((\d+)/)||[])[1]) + ' holdings') + '.' : 'No FINN data attached.';
        content = '**Short answer:** DIXON rose after strong Q2 numbers.\n\n- Revenue grew **26% YoY** per the results filing\n- Brokerages raised targets after the call\n- ' + ctxNote + '\n\nSee [the filing](https://www.nseindia.com/x.pdf) for detail.';
        gm = { webSearchQueries: ['Dixon Technologies share price today', 'Dixon Q2 FY27 results'], groundingChunks: [{web:{uri:'https://www.reuters.com/a', title:'reuters.com'}}, {web:{uri:'https://economictimes.indiatimes.com/b', title:'economictimes.indiatimes.com'}}, {web:{uri:'https://www.reuters.com/a', title:'reuters.com'}}] };
      } else content = 'Cash conversion averaged 0.8x over three years [Cash flow].';
      const cand = { content: { role:'model', parts: [{ text: content }] }, finishReason: 'STOP' };
      if (gm) cand.groundingMetadata = gm;
      return route.fulfill({status:200, headers:cors, contentType:'application/json', body: JSON.stringify({candidates:[cand]})});
    }
    if (url.startsWith('file:')) return route.continue();
    return route.fulfill({status:404, headers:cors, body:''});
  });
  function page_(s){ return mkpage(s); }
};
