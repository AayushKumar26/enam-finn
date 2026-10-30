# Submission checklist (from the brief)

| Brief asks for | Where |
|---|---|
| Mobile-first prototype, easy to try on a phone | `FINN.apk`: install on any Android 7+ phone. `web/index.html` also opens in a browser for a quick look |
| GitHub repository | This repo |
| AI build history | Export of the AI coding-assistant conversation used to build FINN (share link) |
| Short writeup in the covering email | Draft below |
| Send to | assessment@enam.com · subject **ENAM - IIT screening - 2027** |

---

# Covering email (draft)

**Subject:** ENAM - IIT screening - 2027

Hello ENAM team,

Please find my submission for the FINN build challenge.

- **App (Android):** FINN.apk (attached / link)
- **Repo:** <GitHub link>
- **AI build history:** <conversation share link>

**What I built.** FINN is an Android app that does an investor's first hour of the day in 30 seconds. My point of view is that the scarce skill is *filtering*, so every screen ranks, groups and cross-checks rather than adding more data.

- **Push.** A FINN Brief shows the 3–5 things that matter, plus a windowed digest of every NSE/BSE filing across a 16-stock portfolio. You can choose New since last visit, 24H, 3D, 7D, 30D or a custom date range. Filings are classified into the 17 reference categories; routine ones are collapsed and results are grouped into one board.
- **Triggered alerts.** These cover the announcement types you choose, price moves beyond ±X%, volume above Y× its 20-day average, and your own thesis tripwires. They arrive as phone notifications the moment a background check finds something new.
- **Results.** FINN reads the actual results PDF and gives a first cut of Revenue, EBITDA, PBT and PAT, QoQ and YoY.
- **Management changes.** FINN reads the appointee's brief profile from the filing, enriches it from public profiles (LinkedIn), and links the profile.
- **Pull.** This works for any NSE/BSE ticker, including renamed ones such as ZOMATO → ETERNAL. It covers:
  - business snapshot: segments and revenue mix from the investor presentation
  - financial snapshot and trajectory
  - balance sheet and cash quality, with a 12-check forensic red-flag scan
  - FINN Score, five pillars graded
  - explicit guidance from the latest call
  - *Said vs. Done*: every numeric promise from the last four concall transcripts checked against reported numbers, with a credibility rating
  - bull vs bear
- **Ask FINN.** A floating agent on every screen. It searches the web and the news, combines that with FINN's own data for the screen you're on, and cites every source.

**Key decisions and trade-offs.**

- *Primary data on the pull side:* financial statements, annual reports, investor presentations and transcripts only. The model is told to use nothing else. Ask FINN is the one place web sources are allowed, and they are cited.
- *Deterministic first:* classification, scores, red flags, results maths, alerts and "FINN's take" are plain code. They are instant, free and testable. AI is used only where language must be read.
- *Cost:* a cheap model for extraction and a stronger one only for judgment. Transcripts are pre-filtered to forward-looking sentences (about 5–10× fewer tokens), and every PDF read is cached on the device. An in-app meter shows calls, tokens and calls saved by the cache. It runs on Gemini's free tier, falls back to lighter models on rate limits, and can use an optional free backup provider.
- *Resilience:* exchange sites need cookies and Referer headers, so a small native network bridge handles them. NSE falls back to BSE, then to cached data. Retired AI models are detected and replaced automatically. On-device diagnostics test every live source.
- *Tiny footprint:* a dependency-free HTML/JS app in a native Android shell, about 0.5 MB.

**Deliberately left out.**

- Alerts while the app is fully closed or killed. These need a small server running the same scan; today FINN checks while the app is open or in memory.
- Peer comparison.
- Voice.
- Parsing full 300-page annual reports.

**Where I'd take it next.**

- A server-side scan with true push notifications.
- Watchlists shared across a team, with each person's tripwires.
- Peer and sector context in the brief.
- Concall tone shift across quarters.
- A spoken 60-second morning brief.

Thank you,
Aayush
