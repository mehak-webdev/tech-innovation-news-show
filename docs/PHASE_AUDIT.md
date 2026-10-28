# Phase Audit & Verification Matrix: Tech Innovation News Show

**Project:** Tech Innovation News Show (B.Tech CSE Project-2)  
**Audit Date:** 2026-10-28  
**Verification Scope:** Phase 1 (Security & Documentation), Phase 2 (Daily Automation & Scheduling), Phase 3 (Persistent Audio, Categories & RAG)  
**Total Automated Tests:** 49 passing tests (8 test suites, 0 failures)

---

## 1. Executive Summary & Verification Methodology

Every major capability from Phases 1, 2, and 3 was audited directly against the actual codebase, PostgreSQL database, and automated test runners. Status definitions are strictly adhered to:

- **Verified:** Implemented and confirmed by a successful relevant test or direct system verification.
- **Partially verified:** Core functionality works, but environment-dependent constraints (e.g. cloud scheduler or AWS bucket) require external activation.
- **Failed:** A test or direct inspection demonstrated incorrect behavior (all discovered issues fixed below).
- **Not implemented:** The required functionality is absent.
- **Not verified:** Code exists, but depends on unconfigured external third-party production credentials.

---

## 2. Comprehensive Phase Verification Matrix

| Phase | Requirement | Evidence | Status | Issue Discovered | Action Taken | Retest Result |
|---|---|---|---|---|---|---|
| **Phase 1** | Operator Authentication via `X-Operator-Key` header | `backend/src/middleware/auth.js`, `apiAutomation.test.js` | **Verified** | None. Uses `crypto.timingSafeEqual` and fails closed on missing/empty key. | Enforced across all 6 mutation routes. | Passes (HTTP 401 on missing/invalid key). |
| **Phase 1** | Route Protection on State-Changing/Expensive Endpoints | `backend/src/server.js` lines 259, 277, 297, 322, 373, 477 | **Verified** | Initial routes did not include `POST /api/episodes/daily-job`. | Added `requireOperatorAuth` and `dailyJobLimiter`. | Verified: All 6 mutation endpoints return 401 without key. |
| **Phase 1** | Public Read Access Preservation | `backend/src/server.js`, `apiContract.test.js` | **Verified** | None. Public endpoints remain open. | Verified `/health`, `/api/sources`, `/api/articles`, `/api/episodes`, `/api/analytics`. | Passes: HTTP 200 without headers. |
| **Phase 1** | Strict Whitelist CORS Policy | `backend/src/server.js` lines 50-87 | **Verified** | None. Rejects unauthorized origins with 403 Forbidden. | Whitelist strictly mirrors `CLIENT_URL` + localhost in dev. | Verified: Tested with origin headers. |
| **Phase 1** | Layered Rate Limiting | `backend/src/middleware/rateLimiters.js` | **Verified** | None. Individual windows for ingestion (10/hr), generation (5/hr), Q&A (20/min). | Configured standard headers and 429 payloads. | Passes: 429 Too Many Requests payload verified. |
| **Phase 1** | Input Validation & Safe Sanitization | `backend/src/middleware/validation.js`, `apiContract.test.js` | **Verified** | Malformed queries previously triggered unhandled 500s. | Created `validateIdParam`, `validateProcessLimit`, `validateAskQuestion`, `validateArticlesQuery`. | Passes: Rejects invalid input with 400 Bad Request. |
| **Phase 1** | Safe Error Responses & Zero Secret Leaks | `backend/src/server.js` lines 507-530, `apiContract.test.js` | **Verified** | Stack traces could leak connection strings. | Central error handler sanitizes messages in production. | Passes: Health check & error bodies verified free of secrets. |
| **Phase 1** | Frontend Credential Isolation | `frontend/.env`, `frontend/.env.example`, `frontend/src/App.jsx` | **Verified** | None. Frontend contains only `VITE_API_URL`. Operator key stored in browser `sessionStorage`. | Verified bundle contains zero keys or DB credentials. | Verified: Vite production build inspect clean. |
| **Phase 2** | Asia/Kolkata (IST) Calendar Day Calculation | `backend/src/utils/timezone.js`, `timezone.test.js` | **Verified** | UTC midnight differs from IST (+5:30) midnight. | Implemented `getISTDateString`, `isSameISTDay`, `calculateUTCCronForIST`. | Passes: 5/5 unit tests pass for date boundary transitions. |
| **Phase 2** | Smart Article Selection & Composite Scoring | `backend/src/services/smartArticleSelector.js`, `smartArticleSelector.test.js` | **Verified** | URL tracking params created duplicate stories. | Normalizes canonical URLs, strips tracking query params, applies recency bonus. | Passes: 8/8 unit tests pass for dedup and scoring. |
| **Phase 2** | Category Diversity Enforcement | `backend/src/services/smartArticleSelector.js` | **Verified** | Episodes could be dominated by single category. | Grouped candidate stories and enforced round-robin diversity. | Passes: Test confirms diverse category representation. |
| **Phase 2** | Minimum Article Threshold & Safe Skip | `backend/src/services/smartArticleSelector.js` | **Verified** | Pipeline crashed when fewer than 3 stories existed. | Skips safely, records `skipped_insufficient_articles` diagnostic. | Passes: Returns structured skip report without throwing. |
| **Phase 2** | Concurrency Safety & Stale Lock Stealing | `backend/src/services/episodePipeline.js` lines 50-95 | **Verified** | Multiple concurrent requests caused duplicate DB records. | Implemented database row locking and 10-minute stale lock timeout. | Passes: Concurrent requests receive `in_progress` (409) or cached result. |
| **Phase 2** | Resumable Staged Pipeline | `backend/src/services/episodePipeline.js` | **Verified** | Pipeline failures restarted from beginning, burning Gemini tokens. | Implemented granular stages: `selecting_articles` → `generating_script` → `generating_audio` → `indexing_rag` → `completed`. | Passes: Existing valid scripts/audio are reused on retry. |
| **Phase 2** | Scheduled Daily Job Workflow | `backend/src/jobs/dailyEpisodeJob.js`, `apiAutomation.test.js` | **Partially verified** | `dailyEpisodeJob.js` passed a raw number instead of `{ limit: maxToProcess }`. | Fixed parameter passing and mapped `succeeded`/`failed` counts. | Code verified locally. External cloud scheduler (Render Cron) requires deployment. |
| **Phase 3** | Exact Audio Duration from WAV Header | `backend/src/services/audioStorage.js`, `audioStorage.test.js` | **Verified** | Duration was previously estimated by script character length. | Created `parseWavMetadata` to extract byteRate and dataSize from RIFF header. | Passes: 6/6 tests pass for exact duration parsing. |
| **Phase 3** | Persistent Audio Object Storage (S3 / Cloudflare R2) | `backend/src/services/audioStorage.js`, `server.js` | **Partially verified** | Render ephemeral disks wipe `public/audio` on reboot. | Integrated `@aws-sdk/client-s3` with fallback to local disk. | Dual-mode verified locally. Active S3 upload requires S3 credentials in prod. |
| **Phase 3** | Audio Streaming Endpoint (HTTP 206 Partial Content) | `backend/src/server.js`, `audioStorage.js`, `apiContract.test.js` | **Verified** | HTML5 `<audio>` player could not scrub or seek. | Implemented `GET /api/episodes/:id/audio` supporting HTTP `Range` headers. | Passes: Range requests return HTTP 206 with correct byte slices. |
| **Phase 3** | Canonical News Categories in PostgreSQL | `backend/src/db/migrate_phase3_storage_categories.js`, `categories.test.js` | **Verified** | `articles.category_id` was NULL for all 194 articles. | Ran migration: created 7 canonical categories and backfilled all 194 rows. | Passes: 100% of articles linked to `categories(id)`. |
| **Phase 3** | Deterministic AI Category Alias Mapping | `backend/src/services/categoryMapper.js`, `categories.test.js` | **Verified** | Freeform Gemini categories fragmented analytics charts. | Implemented deterministic alias mapper matching keywords to canonical IDs. | Passes: 9/9 category mapping tests pass. |
| **Phase 3** | Analytics Table Join Consistency | `backend/src/services/analyticsService.js`, `apiContract.test.js` | **Verified** | Analytics queried unindexed `ai_category` text strings. | Updated SQL queries to join `categories c ON a.category_id = c.id`. | Passes: Analytics returns canonical category breakdown. |
| **Phase 3** | 768-Dimension Embedding Validation | `backend/src/services/embeddingService.js`, `ragGrounded.test.js` | **Verified** | Mismatched embedding dimensions cause pgvector insert crashes. | Strict dimension check (`vector.length === 768`). | Passes: Vector dimension verified. |
| **Phase 3** | Mathematical Vector Metric Consistency | `backend/src/services/ragRetriever.js`, `ragGrounded.test.js` | **Verified** | pgvector `<=>` operator returns cosine distance ($1 - \cos\theta$), not similarity. | Calculated similarity as $1 - \text{distance}$ with 0.50 threshold. | Passes: Formula mathematically confirmed in tests. |
| **Phase 3** | Cross-Episode Isolation in RAG Retrieval | `backend/src/services/ragRetriever.js` line 47 | **Verified** | None. Query uses `WHERE episode_id = $2`. | Enforces strict scoping to the queried episode. | Verified: No cross-episode leakage. |
| **Phase 3** | Safe Refusal on Out-of-Scope Queries | `backend/src/services/ragAnswerer.js` | **Verified** | None. Queries with top score < 0.50 are refused immediately. | Bypasses LLM call on ungrounded queries, saving quota. | Passes: Returns honest refusal without hallucinations. |
| **Phase 3** | Prompt Injection Quarantining | `backend/src/services/ragAnswerer.js` | **Verified** | Untrusted news content could override assistant system instructions. | Wrapped retrieved text in XML `<passage>` tags with strict anti-override directive. | Verified: Prompt structure inspected and secured. |

---

## 3. Discovered Issues & Action Log

### Issue 1 (P1): Nodemon File Watcher Loop on Windows
- **Cause:** Nodemon watched all files (`*.*`) by default in `backend/`, restarting repeatedly whenever tests or temporary logs were touched.
- **Fix:** Created `backend/nodemon.json` to restrict watching to `src/` and ignore `public/`, `tests/`, and `node_modules/`.
- **Status:** **Resolved & Verified**.

### Issue 2 (P2): Server IP Binding Timeout
- **Cause:** Express bound to `::` (IPv6), causing IPv4 loopback requests from `127.0.0.1` to time out on Windows.
- **Fix:** Bound server explicitly to `0.0.0.0:5000` in `backend/src/server.js`.
- **Status:** **Resolved & Verified**.

### Issue 3 (P2): Parameter Mismatch in Daily Episode Job
- **Cause:** `dailyEpisodeJob.js` called `processPendingArticles(maxToProcess)` passing a number instead of `{ limit: maxToProcess }`.
- **Fix:** Updated invocation to `processPendingArticles({ limit: maxToProcess })` and mapped `succeeded`/`failed` result counts.
- **Status:** **Resolved & Verified**.

### Issue 4 (P2): Audio Player URL Concatenation
- **Cause:** In `frontend/src/App.jsx`, audio src used `${apiUrl}${selectedEpisode.audio_url}` unconditionally. If `audio_url` was an absolute cloud CDN URL, this produced a malformed URL.
- **Fix:** Added check: `selectedEpisode.audio_url.startsWith('http') ? selectedEpisode.audio_url : `${apiUrl}${selectedEpisode.audio_url}``. Added visual error banner for audio playback failures.
- **Status:** **Resolved & Verified**.

---

## 4. Verification Evidence & Automated Test Summary

Command executed:
```powershell
npm --prefix backend test
```

Output:
```text
✔ API Daily Automation & Security Enforcement (4/4 passed)
✔ Phase 4: API Contract & Route Integration Verification (8/8 passed)
✔ Phase 3: Persistent Audio Storage & WAV Parsing (6/6 passed)
✔ Phase 3: Canonical Categories & Deterministic Mapping (9/9 passed)
✔ Pipeline Resumability & Verification Safeguards (4/4 passed)
✔ Phase 3: Grounded RAG, Chunking & Cosine Metrics (5/5 passed)
✔ Smart Article Selection & Deduplication (8/8 passed)
✔ Timezone Utilities (Asia/Kolkata / IST) (5/5 passed)

Total: 49 passing, 0 failing across 8 test suites. Duration: ~2.8s
```

