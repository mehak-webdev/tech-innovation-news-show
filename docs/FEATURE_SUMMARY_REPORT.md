# Tech Innovation News Show — Comprehensive Feature Summary Report

**Project Title:** Tech Innovation News Show  
**Degree / Context:** B.Tech CSE Capstone Project (Project-2)  
**Report Generation Date:** October 29, 2026  
**Status:** Production Ready (Phases 1, 2, 3, 4 & Frontend Redesign Completed)  
**Test Coverage:** 54/54 automated tests passing (9 test suites, 0 failures)  

---

## 1. Executive Project Summary

**Tech Innovation News Show** is an automated, AI-driven technology news curation and daily audio broadcasting platform. It continuously ingests stories from premier tech journalism outlets (The Verge, TechCrunch, Engadget, Ars Technica), performs editorial synthesis and importance scoring using **Google Gemini AI**, compiles prioritized stories into broadcast-ready radio scripts, synthesizes natural spoken voice audio via Text-to-Speech (TTS), and enables grounded, interactive conversational Q&A over broadcast content using **Retrieval-Augmented Generation (RAG)** powered by **Neon Serverless PostgreSQL** and `pgvector`.

### Technology Stack Overview

| Layer | Technologies Used | Key Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS | High-performance SPA with modern dark technology aesthetic, responsive vertical sidebar layout, custom audio player, and real-time dashboard |
| **Backend** | Node.js, Express (ES Modules) | RESTful API server, background pipeline coordinator, streaming audio server, and secure operator auth gateway |
| **Database & Vector** | Neon Serverless PostgreSQL with `pgvector` (v0.8.6) | Relational storage for articles, categories, episodes, and 768-dimensional vector embeddings for cosine similarity search |
| **AI & LLM** | Google Gemini (`gemini-2.5-flash`, `text-embedding-004`) | Editorial analysis, categorization, script writing, query answering, and semantic vector embedding generation |
| **News Ingestion** | `rss-parser` | Periodic, resilient multi-source XML/RSS scraping and canonical URL deduplication |
| **Audio & Storage** | Node.js WAV Engine, AWS S3 / Cloudflare R2 / Local Disk | Exact RIFF/WAV metadata duration parsing, persistent cloud/local audio storage, and HTTP 206 Partial Content Range streaming |
| **Security & Auth** | Node.js `crypto`, `express-rate-limit`, CORS Whitelist | Constant-time operator authentication (`timingSafeEqual`), layered rate limiting, strict CORS whitelisting, and input sanitization |

---

## 2. Complete Feature Inventory by Phase & Module

### 🛡️ Phase 1 — Security, Authentication & Infrastructure Defense
1. **Operator Authentication Gate (`X-Operator-Key`):**
   - Protects state-changing and quota-expensive endpoints (`POST /api/articles/ingest`, `POST /api/articles/process`, `POST /api/episodes/generate`, etc.).
   - Employs `crypto.timingSafeEqual` with constant-time buffer comparison to prevent timing side-channel attacks.
   - Fails closed: if the server key is unconfigured or blank, protected endpoints deny all access (HTTP 401).
   - Zero frontend credential exposure: operator secrets are stored strictly in client-side `sessionStorage` per browser tab, never bundled into static code.
2. **Strict Whitelist CORS Policy:**
   - Blocks unauthorized cross-origin requests with HTTP 403 Forbidden.
   - Enforces strict origin matching in production (`CLIENT_URL`), with automated local Vite development fallback (`localhost:5173`).
3. **Layered Endpoint Rate Limiting:**
   - Tiered rate limits protecting against Denial of Service and API quota depletion:
     - General API: 120 req/min
     - RSS Ingestion: 10 req/hr
     - AI Article Processing: 30 req/min
     - Episode Generation: 5 req/hr (prod) / 100 req/hr (dev/test)
     - RAG Q&A Queries: 20 req/min
   - Employs standard headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) and returns informative HTTP 429 JSON payloads.
4. **Strict Input Validation & Sanitization:**
   - Middleware filters (`validateIdParam`, `validateProcessLimit`, `validateAskQuestion`, `validateArticlesQuery`) intercept invalid parameters before touching controllers, rejecting malformed requests with structured HTTP 400 Bad Request responses.
5. **Centralized Error Handling & Diagnostics:**
   - Standardized central error handler sanitizes stack traces and database credentials in production environments.
   - `/health` endpoint exposes system health (API, Neon DB, Gemini AI, storage mode) without leaking environment keys or connection strings.

---

### ⏱️ Phase 2 — Daily Episode Automation, IST Scheduling & Smart Selection
1. **Asia/Kolkata (IST) Calendar Boundary Management:**
   - Eliminates UTC vs. local timezone date drifts by calculating calendar days strictly within the `Asia/Kolkata` (+05:30) timezone.
   - Generates deterministic, timezone-aware daily cron triggers and prevents missed or duplicated daily broadcasts.
2. **Smart Article Selection & Composite Scoring:**
   - Algorithmic candidate article evaluation using multi-factor composite scoring:
     $$\text{Score} = (\text{Importance Score} \times 0.60) + (\text{Recency Bonus} \times 0.25) + (\text{Source Credibility} \times 0.15)$$
   - Automatically skips stale articles and prefers fresh breaking stories.
3. **Canonical URL & Title Deduplication:**
   - Strips URL tracking parameters (`utm_*`, `ref`, `fbclid`) and trailing slashes to establish canonical article URLs.
   - Normalizes titles (punctuation stripping, entity removal, lowercasing) to filter out syndicate cross-posts across different publishers.
4. **Round-Robin Category Diversity Enforcement:**
   - Ensures daily broadcasts feature a balanced spread of tech disciplines (AI, Cybersecurity, Hardware, Software, Startups) rather than being dominated by a single topic.
5. **Safe Skip & Minimum Story Safeguards:**
   - Requires a minimum threshold of 3 high-confidence analyzed stories before triggering broadcast generation.
   - Safely records a structured skip reason (`skipped_insufficient_articles`) rather than crashing or generating hollow episodes.
6. **Concurrency Safety & Atomic Row Locking:**
   - Prevents duplicate episode creation under concurrent requests through PostgreSQL row locks (`SELECT ... FOR UPDATE`) and a 10-minute stale lock timeout.
7. **Resumable Multi-Stage Pipeline:**
   - Episode pipeline partitioned into distinct checkpoints:
     `selecting_articles` $\to$ `generating_script` $\to$ `generating_audio` $\to$ `indexing_rag` $\to$ `completed`
   - If TTS generation fails due to a network blip, the generated Gemini script is preserved, allowing the pipeline to resume without burning LLM tokens.

---

### 🎙️ Phase 3 — Persistent Audio, Categories & Grounded RAG
1. **Exact RIFF/WAV Header Duration Extraction:**
   - Pure byte-level WAV parser (`parseWavMetadata`) that extracts sample rate, bits per sample, channels, and byte rate directly from the audio buffer.
   - Computes millisecond-accurate playback durations instead of guessing from text word count.
2. **Dual-Mode Audio Storage Architecture:**
   - Seamless pluggable storage supporting local disk storage (`backend/public/audio/`) and persistent cloud object storage (AWS S3 / Cloudflare R2).
   - Prevents audio file loss when deployed to ephemeral hosting environments like Render.
3. **HTTP 206 Partial Content Audio Streaming:**
   - Custom audio route (`GET /api/episodes/:id/audio`) supporting HTTP `Range` headers (`bytes=start-end`).
   - Enables instant audio seeking, timeline scrubbing, and efficient browser caching on desktop and mobile browsers.
4. **Canonical PostgreSQL News Taxonomy:**
   - Normalized relational `categories` table with 7 core technology domains:
     - *Artificial Intelligence & Machine Learning*
     - *Software Engineering & Cloud Infrastructure*
     - *Cybersecurity & Privacy*
     - *Hardware, Semiconductors & Devices*
     - *Startups, Venture & Tech Business*
     - *Policy, Regulation & Society*
     - *General Innovation & Emerging Tech*
5. **Deterministic AI Category Alias Mapping:**
   - Normalizes arbitrary Gemini-generated category strings (e.g., "LLM", "Deep Learning", "AWS", "Ransomware") into fixed canonical database IDs.
6. **768-Dimension Semantic Embedding Pipeline:**
   - Generates mathematical vector embeddings using Google's `text-embedding-004` model.
   - Validates vector integrity (strictly 768 dimensions) before inserting into PostgreSQL `pgvector`.
7. **Mathematically Grounded RAG Retrieval:**
   - Overcomes pgvector's `<=>` cosine distance metric by calculating normalized cosine similarity:
     $$\text{Cosine Similarity} = 1 - \text{Cosine Distance}$$
   - Enforces strict cross-episode isolation (`WHERE episode_id = $2`) preventing cross-episode memory leaks.
8. **Prompt Injection Quarantining & Honest Refusal:**
   - Wraps retrieved news passages in structured XML delimiters (`<passage>`) with explicit system instructions preventing prompt override.
   - Automatic refusal: queries scoring below 0.50 semantic similarity are immediately declined with an honest refusal message without invoking Gemini, preventing hallucinations and saving API quota.

---

### 💻 Frontend Polish & Studio UI
1. **Sleek Desktop Vertical Sidebar Layout:**
   - Modern, executive-style dashboard layout featuring a fixed, sticky left sidebar (`w-64`/`w-72`).
   - Persistent brand header with `TN` gradient emblem, `AI Broadcast` indicator, and live count badges for Articles and Broadcasts.
   - Pinned system health panel at the bottom displaying real-time API, Database, and AI status.
   - Quick one-click RSS ingestion trigger directly in the sidebar.
2. **Responsive Mobile Adaptation:**
   - Smoothly transforms on mobile screens (`< md`) into a compact top header with touch-friendly horizontal tab navigation, eliminating horizontal overflow.
3. **Dashboard Overview & Interactive KPI Cards:**
   - 4 live metric cards: **Total Stories** (150), **AI Analyzed** (32), **Pending Queue** (118), and **Broadcasts** (2).
   - Clicking any metric card acts as an instant shortcut filter/tab jump.
4. **HTML Entity Decoding Engine:**
   - Pure JavaScript entity decoder (`decodeHtmlEntities`) converting encoded RSS characters (`&#8217;` $\to$ `'`, `&#8220;` $\to$ `"`, `&amp;` $\to$ `&`, etc.) into clean, readable prose without using insecure `dangerouslySetInnerHTML`.
5. **Custom Range Audio Player:**
   - Purpose-built audio player with play/pause, range scrubbing timeline, duration timer, playback speed selector (`1x`, `1.25x`, `1.5x`), and audio mute toggle.
6. **Grounded RAG "Ask This Episode" Interface:**
   - Interactive Q&A console with preset prompt pills, 250-character limit counter, confidence score badges, primary source citation links, and honest refusal cards for out-of-scope inquiries.
7. **Distraction-Free Reader Mode:**
   - Accessible toggle switching typography to serif (`font-serif`), enlarging font size, expanding line-height, and centering editorial copy in a distraction-free column.
8. **Platform Analytics & Editorial Trends:**
   - Visual canonical category distribution progress bars, publisher source comparison, and editorial leaderboard.

---

## 3. Database Schema Architecture

```
┌──────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│    categories    │       │       articles       │       │       episodes       │
├──────────────────┤       ├──────────────────────┤       ├──────────────────────┤
│ id (PK)          │◄──┐   │ id (PK)              │   ┌──►│ id (PK)              │
│ name             │   └───│ category_id (FK)     │   │   │ episode_date (IST)   │
│ slug             │       │ title                │   │   │ title                │
│ description      │       │ url (Unique)         │   │   │ script               │
│ created_at       │       │ summary              │   │   │ audio_url            │
└──────────────────┘       │ ai_summary           │   │   │ audio_duration_sec   │
                           │ importance_score     │   │   │ status               │
                           │ processing_status    │   │   │ created_at           │
                           │ published_at         │   │   └──────────────────────┘
                           │ source_name          │   │              ▲
                           └──────────────────────┘   │              │
                                      ▲               │              │
                                      │               │   ┌──────────┴───────────┐
                           ┌──────────┴───────────┐   │   │    episode_chunks    │
                           │   episode_articles   │   │   ├──────────────────────┤
                           ├──────────────────────┤   │   │ id (PK)              │
                           │ episode_id (FK)      │───┘   │ episode_id (FK)      │
                           │ article_id (FK)      │       │ chunk_index          │
                           │ story_order          │       │ chunk_text           │
                           └──────────────────────┘       │ embedding vector(768)│
                                                          └──────────────────────┘
```

---

## 4. API Endpoints Reference Catalog

### Public Read Endpoints (Zero Authentication Required)
- `GET /health` — Real-time health check, DB connection status, Gemini configuration, and storage diagnostics.
- `GET /api/sources` — Verified list of active RSS technology publishers.
- `GET /api/articles` — Paginated list of ingested articles (supports `status` and `sort` query filters).
- `GET /api/episodes` — Chronological archive of daily broadcast episodes with duration and audio URLs.
- `GET /api/episodes/:id` — Detailed episode metadata, host script, and covered story list.
- `GET /api/episodes/:id/audio` — HTTP 206 Partial Content Range streaming audio endpoint.
- `POST /api/episodes/:id/ask` — Grounded RAG question answering with confidence ratings and citations.
- `GET /api/analytics` — Platform metrics, canonical category distribution, and top-rated stories.

### Protected Operator Endpoints (Requires `X-Operator-Key` Header)
- `POST /api/articles/ingest` — Triggers live RSS ingestion from The Verge, TechCrunch, Engadget, and Ars Technica.
- `POST /api/articles/process` — Triggers Gemini batch editorial analysis and importance scoring.
- `POST /api/articles/:id/retry` — Manually resets and re-analyzes a failed article.
- `POST /api/episodes/generate` — Generates a daily broadcast episode (selection + script + TTS + RAG indexing).
- `POST /api/episodes/daily-job` — Production cron endpoint executing the complete end-to-end daily broadcast job.
- `POST /api/episodes/:id/reindex` — Re-chunks and re-embeds an existing episode for RAG Q&A.

---

## 5. Automated Testing & Verification Metrics

- **Total Test Suites:** 9 suites
- **Total Automated Tests:** 54 passing tests
- **Failing / Skipped Tests:** 0
- **Test Execution Time:** ~2.8 seconds
- **Production Frontend Bundle:** 0 errors (Vite v6.4.5, bundle time ~3.8s)

```text
✔ API Daily Automation & Security Enforcement (4/4 passed)
✔ Phase 4: API Contract & Route Integration Verification (8/8 passed)
✔ Phase 3: Persistent Audio Storage & WAV Parsing (6/6 passed)
✔ Phase 3: Canonical Categories & Deterministic Mapping (9/9 passed)
✔ Pipeline Resumability & Verification Safeguards (4/4 passed)
✔ Phase 3: Grounded RAG, Chunking & Cosine Metrics (5/5 passed)
✔ Smart Article Selection & Deduplication (8/8 passed)
✔ Timezone Utilities (Asia/Kolkata / IST) (5/5 passed)
✔ Phase 4: HTML Entity Decoding & Text Formatting (5/5 passed)
```

---

## 6. Viva / Academic Presentation Highlights

When presenting this project to examiners or project evaluators, the following key engineering decisions demonstrate exceptional rigor:

1. **Defense Against LLM Hallucinations:** Grounded RAG uses strict cosine similarity thresholding (0.50 cutoff). If a user asks an irrelevant question (e.g., *"Who won the cricket match?"*), the system refuses cleanly without hallucinating or wasting API credits.
2. **Security & Financial Quota Protection:** Expensive Gemini endpoints are protected by constant-time operator authentication (`crypto.timingSafeEqual`) and layered rate limiters, preventing denial-of-wallet attacks.
3. **Resilient Pipeline Architecture:** Audio streaming uses HTTP 206 Range headers for fast seeking. The daily generation pipeline uses database locks to prevent race conditions and resumes from checkpoints if a stage encounters a network glitch.
4. **Timezone Awareness:** All calendar operations are locked to `Asia/Kolkata` (IST), eliminating the classic midnight UTC date-boundary defect in production scheduling.

