# FINN — Financial Investment Agent

**[⬇ Download the Android app (FINN.apk)](https://github.com/AayushKumar26/enam-finn/releases/download/v3.4/FINN.apk)** · Android 7+ · install, open, done

An Android app that does an investor's first hour of the day in 30 seconds. It reads every exchange filing and price move across a portfolio, shows only what matters, and can research any NSE/BSE company on demand.

> **Install:** download the APK on your phone → tap it → allow "Install unknown apps" if asked → open FINN. Tap **Portfolio → Settings → Run diagnostics** to check every live data source.

## What makes it different

Most investor apps add data. FINN removes it: it ranks, groups and cross-checks, so the investor sees what changed, why it matters, and what to do.

| Investor's question | What FINN does |
|---|---|
| *What happened overnight?* | **FINN Brief** — 3–5 lines covering tripped thesis rules, a results-season summary, material filings (grouped when several holdings file the same kind) and unexplained moves |
| *Results season — who beat?* | One **results board** ranking every holding by PAT YoY. Tap a row and FINN reads the **actual results PDF** for Revenue, EBITDA, PBT and PAT, QoQ and YoY |
| *A CFO resigned — who's the new one?* | FINN reads the **brief profile inside the appointment filing** (required by SEBI) and summarises experience and past employers, with a one-tap LinkedIn lookup |
| *Why is my stock up 6%?* | If no filing explains a move past your threshold, it is flagged as an **unexplained move** — often the most valuable alert |
| *Is this company any good?* | **FINN's take** — one plain-English sentence — plus a five-pillar **FINN Score** and a **12-check red-flag scan** |
| *Can I trust management?* | **Said vs. Done** reads the last four concall transcripts, extracts every numeric promise and checks it against reported numbers, giving a credibility rating |
| *What would change my mind?* | **Tripwires** — your own kill-criteria per stock, checked on every refresh and pushed to the top of the brief |
| *Anything else?* | **Ask FINN** — a floating AI agent on every screen. It answers with Google Search (cited sources and the searches it ran) plus FINN's own data for the screen you're on (portfolio or company) |
| *What do these terms mean?* | Every metric is **tappable** for a plain-English definition and why it matters |
| *Tell the team* | A **one-tap memo** to WhatsApp or email |

## Coverage of the brief

**Push**
- *Windowed digest:* New since last visit, 24H, 3D, 7D, 30D or a custom date range. Filings are classified into the reference doc's 17 categories and prioritised; routine filings are collapsed.
- *Triggered alerts:* you choose which announcement types to be alerted on (⚡), plus configurable end-of-day thresholds (± price %, volume × 20-day average) and your own tripwires. A background check (every 5–60 minutes) sends an Android notification the moment something new crosses a line; nothing is sent twice.
- *Presentation:* management change → incoming person's background, from the filing plus public profiles (LinkedIn), with the profile linked; quarterly results → first cut of headline numbers QoQ/YoY from the filing; every other type → the exchange's one-line summary, or an on-demand ✦ Explain.

**Pull** — for any NSE/BSE ticker, found through live search across all listings:
- Business snapshot (segments, revenue mix, geography, from the investor presentation), financial snapshot, trajectory (quarterly and annual charts, compounded growth)
- Balance sheet (borrowings, leverage, interest cover) and cash quality (profit vs operating cash, FCF, working capital)
- Guidance (explicit targets from the latest call, with quotes), narrative vs numbers (Said vs. Done), and a bull vs bear case

**Portfolio** — 16 holdings across sectors and sizes, a five-pillar health heatmap, and add/remove any listing.

## Data sources

| Data | Source |
|---|---|
| Corporate announcements | NSE corporate-announcements feed, falling back to the BSE announcements API (exact timestamps, filing PDFs) |
| End-of-day price & volume | Yahoo Finance (`.NS` / `.BO`) |
| Financial statements, annual-report and concall links | screener.in company pages, as the brief suggests |
| Guidance, bios, results numbers | Read directly from the primary PDFs (transcripts and filings) |

The pull side uses only primary data. The AI is instructed to use nothing but the supplied filings, numbers and transcripts.

## Engineering decisions

- **Native HTTP bridge.** Exchange sites need cookies and a Referer header, which a browser page cannot send. The app ships a small Android bridge (worker thread, cookie jar) and falls back to the WebView's own requests automatically. Every native call is wrapped so a fault degrades instead of crashing.
- **Works on free tiers.** Ask FINN does its own web search (Google News RSS + DuckDuckGo, no key, no quota), so each question costs one ordinary AI call. On a rate limit it waits briefly, tries lighter models, then an optional free backup provider (Groq, OpenAI-compatible). Google Search grounding is available as an option and falls back automatically.
- **Renamed tickers.** Companies get renamed and demerged (Zomato → Eternal, Tata Motors → TMPV/TMCV). FINN maps known renames, otherwise resolves through search, and explains the change; unknown tickers get "did you mean" suggestions.
- **On-device diagnostics.** Settings → Run diagnostics tests every live source (financials, search, NSE, BSE, prices, news, web, PDF reading, AI) from the phone and produces a copyable report.
- **Self-healing AI.** Gemini model names are retired regularly (2.5 was shut down on 16 Oct 2026). FINN defaults to Google's `latest` aliases; on a 404 it lists the models the key can use, picks the newest stable Flash and Flash-Lite, and retries. Settings → Test AI shows the live model.
- **Visible efficiency.** Settings shows today's AI calls, tokens, extraction-vs-judgment routing and calls saved by the cache.
- **Model routing and cost.** A cheap model extracts (guidance, bios); a stronger model judges (Said vs. Done, bull/bear, results tables). Transcripts are pre-filtered to forward-looking sentences (about 5–10× fewer tokens), and every PDF read is cached on the device. The Gemini free tier is enough.
- **Deterministic first.** Classification, the FINN Score, red flags, results maths, alerts and FINN's take are plain code: instant, free and testable. AI is used only where language must be read.
- **Freshness is the user's choice.** Data can be reused for 5 seconds up to 6 hours. Cached data shows instantly while it refreshes in the background, pull-to-refresh is supported, and the last good copy is used when offline.
- **Tiny footprint.** A dependency-free HTML/JS app inside a native shell, about 450 KB in total. pdf.js is loaded only when a PDF is read.

## Tests

`node tests/run_tests.js` (Playwright) runs 103 checks across eleven scenarios, including a full sweep of every screen, tab, window and filter:
- unit tests (classifier on real exchange subject lines, date and number parsing, sparse-company edge cases)
- in-app flow through the native bridge (NSE filings, reading results and bios from filing PDFs, bull/bear, Said vs. Done, glossary, settings)
- Ask FINN agent: popup, Google sources, portfolio and company context, Android back
- retired Gemini model → automatic recovery
- Gemini free quota exhausted → clear guidance, then Groq backup
- Google grounding quota hit → free search fallback
- renamed tickers (ZOMATO → ETERNAL, TATAMOTORS → TMPV) and unknown tickers with suggestions
- brief compliance: notifications without duplicates, custom period, LinkedIn-enriched bio, segment mix, guidance list, efficiency meter
- NSE blocked → BSE fallback
- browser without bridge or AI key
- fully offline

## Left out, and next

- Notifications when the app is fully closed or killed. This needs a small scheduled server; today FINN checks while the app is open or in memory.
- Segment revenue mix parsed from annual-report PDFs; peer comparison; a voice brief.

## Build

`APKTOOL=/path/to/apktool.jar [FINN_KEY=gemini-key] [FINN_BACKUP_KEY=groq-key] ./build_apk.sh` (Java 11+). The key is injected only into that build; the repo never contains one.
