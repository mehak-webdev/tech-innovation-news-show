# Tech Innovation News Show

An automated, full-stack technology news platform and daily innovation broadcast show. Gathers news from premier sources, extracts structured editorial insights with Google Gemini, synthesizes professional daily radio broadcast episodes with AI voice audio, provides grounded "Ask This Episode" RAG Q&A, and visualizes real-time editorial analytics.

---

## Tech Stack
- **Frontend:** React 18, Vite, Tailwind CSS (Single Page Application)
- **Backend:** Node.js, Express (ES Modules)
- **Database:** PostgreSQL (Neon Serverless PostgreSQL with `pgvector` semantic vector store)
- **AI Engine:** Google Gemini API (`@google/genai`)
  - **Editorial Analysis & Scoring:** `gemini-3.5-flash-lite` (with failover)
  - **Broadcast Script Generation:** `gemini-3.5-flash-lite`
  - **Spoken Voice Audio (TTS):** `gemini-3.8-flash-tts`
  - **Embeddings & Vector Search:** `gemini-embedding-001` with `pgvector`
- **Data Ingestion:** RSS Parser (`rss-parser`) with URL deduplication

---

## Architecture & Completed Phases

- [x] **Phase 1: Foundation & Setup** — Monorepo layout, Express backend with `/health`, React + Vite + Tailwind frontend, environment templates, and Git workflow.
- [x] **Phase 2: Database Schema & News Ingestion** — Neon PostgreSQL connection pool, schema (`sources`, `categories`, `articles`), RSS ingestion from TechCrunch & The Verge, URL deduplication, and articles feed.
- [x] **Phase 3: AI-Powered Editorial Pipeline** — Google Gemini structured analysis (`ai_summary`, `ai_category`, `ai_key_points`, `importance_score` 1–100), parallel processing pipeline with stuck-state auto-healing and retry support.
- [x] **Phase 4: Episode Generation & Spoken Audio** — Gemini radio broadcast script generator, Gemini TTS spoken audio (`.wav`), durable storage, full transcript viewer, source attribution, and React audio player.
- [x] **Phase 5: Grounded RAG "Ask This Episode"** — PostgreSQL `pgvector` semantic chunk store, `gemini-embedding-001`, cosine distance retrieval, anti-hallucination threshold, prompt injection defense, and interactive Q&A UI.
- [x] **Phase 6: Platform Analytics & Production Deployment** — Live PostgreSQL aggregation metrics (`/api/analytics`), visual category distribution, source comparison, editorial leaderboard, and deployment configuration for Neon, Render, and Vercel.

---

## Project Structure

```text
tech_news_innovation_show/
├── .gitignore                      # Root ignore (node_modules, .env, build output)
├── package.json                    # Root scripts for build and migration
├── README.md                       # Comprehensive setup and production guide
│
├── backend/                        # Express API & PostgreSQL Database Layer
│   ├── .env.example                # Secret configuration template
│   ├── public/audio/               # Generated podcast WAV audio files
│   ├── package.json                # Dependencies: express, cors, dotenv, pg, @google/genai, rss-parser
│   └── src/
│       ├── db/
│       │   ├── index.js            # Neon PostgreSQL pool with SSL & auto-reconnect
│       │   ├── migrate.js          # Phase 2 tables: sources, categories, articles
│       │   ├── migrate_phase3.js   # Phase 3 columns: ai_summary, importance_score, etc.
│       │   ├── migrate_phase4.js   # Phase 4 tables: episodes, episode_articles
│       │   └── migrate_phase5.js   # Phase 5 table: episode_chunks with pgvector(768)
│       ├── services/
│       │   ├── newsIngester.js     # RSS feed ingestion & URL deduplication
│       │   ├── aiProcessor.js      # Gemini structured analysis & importance scoring
│       │   ├── articlePipeline.js  # Batch AI processing with retry support
│       │   ├── episodeScriptGenerator.js # Gemini daily broadcast radio script writer
│       │   ├── ttsGenerator.js     # Gemini TTS native WAV audio synthesizer
│       │   ├── episodePipeline.js  # 6-stage idempotent episode generation controller
│       │   ├── embeddingService.js # Text chunker & Gemini 768-dim embeddings
│       │   ├── ragIndexer.js       # Vector chunk indexer for episodes & articles
│       │   ├── ragRetriever.js     # pgvector cosine similarity search
│       │   ├── ragAnswerer.js      # Grounded Q&A with anti-injection defense
│       │   └── analyticsService.js # PostgreSQL real-time KPI & trend aggregation
│       └── server.js               # Express API endpoints & static audio server
│
└── frontend/                       # React 18 + Vite + Tailwind Client
    ├── .env.example                # Frontend configuration template
    ├── index.html                  # HTML entry point
    ├── vite.config.js              # Vite bundler config
    └── src/
        ├── App.jsx                 # Triple-tab UI: Feed, Episodes Player, Analytics Dashboard
        ├── index.css               # Tailwind CSS directives
        └── main.jsx                # React DOM mount point
```

---

## Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)
- A free [Neon PostgreSQL](https://neon.tech) database (supports `pgvector`)
- A free Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

### 1. Clone & Configure Secrets
```bash
git clone <repository-url>
cd tech_news_innovation_show

# Copy environment templates
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

In `backend/.env`:
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
DATABASE_URL=postgresql://<user>:<password>@<neon-host>/neondb?sslmode=require
GEMINI_API_KEY=your_gemini_api_key_here
```

In `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000
```

### 2. Install Dependencies & Run Database Migrations
```bash
# Install backend packages
cd backend && npm install && cd ..

# Install frontend packages
cd frontend && npm install && cd ..

# Run all database migrations
npm run migrate
npm run migrate:phase3
npm run migrate:phase4
npm run migrate:phase5
```

### 3. Start Development Servers
Open two terminal windows:

**Terminal 1 (Backend API):**
```bash
cd backend
npm run dev
# Server runs on http://localhost:5000
```

**Terminal 2 (Frontend Client):**
```bash
cd frontend
npm run dev
# Application runs on http://localhost:5173
```

---

## API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server status, Neon PostgreSQL connection, and Gemini status |
| `GET` | `/api/analytics` | Real-time platform KPIs, category concentration, and source stats |
| `GET` | `/api/sources` | Lists active news feeds (TechCrunch, The Verge) |
| `GET` | `/api/articles` | Filter and sort news stories (`?sort=importance&status=completed`) |
| `POST` | `/api/articles/ingest` | Triggers RSS ingestion and URL deduplication |
| `POST` | `/api/articles/process?limit=3` | Runs AI editorial analysis on pending articles |
| `POST` | `/api/articles/:id/retry` | Reprocesses an individual article |
| `GET` | `/api/episodes` | Lists all news broadcast episodes |
| `GET` | `/api/episodes/latest` | Fetches the most recent playable episode |
| `GET` | `/api/episodes/:id` | Returns episode audio, transcript, and linked story details |
| `POST` | `/api/episodes/generate` | Generates today's script, audio, and vector indexes |
| `POST` | `/api/episodes/:id/ask` | Grounded RAG Q&A against the episode and covered stories |
| `POST` | `/api/episodes/:id/reindex` | Re-indexes vector embeddings for an episode |

---

## Production Deployment Guide (Free Tier)

### 1. Database (Neon Serverless PostgreSQL)
- **Status:** Already cloud-hosted over SSL.
- **pgvector:** Natively enabled via `migrate_phase5.js`.
- **Backups:** Neon automatically maintains point-in-time recovery and snapshot branching. You can fork or restore your database state directly in the Neon console under **Branches**.
- **Offline Backup Command:**
  ```bash
  pg_dump "$DATABASE_URL" > neon_backup.sql
  ```

### 2. Backend Deployment (Render Web Service)
1. Push your repository to GitHub.
2. Sign up at [Render](https://render.com) and click **New + → Web Service**.
3. Connect your GitHub repository.
4. Set the following build settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Under **Environment Variables**, add:
   - `DATABASE_URL`: Your full Neon connection string with `?sslmode=require`
   - `GEMINI_API_KEY`: Your Google AI Studio API key
   - `NODE_ENV`: `production`
   - `CLIENT_URL`: Your deployed frontend URL (e.g. `https://tech-news-show.vercel.app`)
6. Click **Create Web Service**. Note your backend URL: `https://tech-news-backend.onrender.com`.

### 3. Frontend Deployment (Vercel)
1. Sign up at [Vercel](https://vercel.com) and click **Add New Project**.
2. Select your GitHub repository.
3. In project settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
4. Under **Environment Variables**, add:
   - `VITE_API_URL`: `https://tech-news-backend.onrender.com` (your Render backend URL)
5. Click **Deploy**. Vercel will build and assign your production domain.
6. Return to Render and update `CLIENT_URL` with your exact Vercel domain.

---

## Production Smoke-Check Checklist

After deploying to production, verify these 6 user journeys:

- [ ] **1. Health Endpoint:** Open `https://<your-backend>.onrender.com/health` → verify `database: "connected"` and `ai: "configured"`.
- [ ] **2. Live Articles Feed:** Open frontend URL → verify articles render with category badges and original source links.
- [ ] **3. Ingestion & Analysis:** Click *Ingest Latest RSS* and *Process with AI Trial* → verify database updates live.
- [ ] **4. Analytics Dashboard:** Switch to 📊 **Analytics Trends** tab → verify KPI cards, category distribution bars, and editorial leaderboard populate real data from PostgreSQL.
- [ ] **5. Episode Playback:** Switch to 🎙️ **Episodes** tab → click **▶ Play** on Episode #3 to verify WAV audio streaming and transcript toggle.
- [ ] **6. Grounded RAG Q&A:** In the episode player, click *"What are the key headlines in this show?"* → verify a concise, cited answer returns in under 2 seconds.

---

## Security & Privacy Highlights

1. **Zero Secret Leaks:** API keys and database credentials exist strictly on the backend server. The client-side bundle contains no secret tokens.
2. **Untrusted Data Isolation:** All user queries and external news articles are quarantined inside `<source_passages>` XML blocks in Gemini prompts with strict anti-override directives to prevent prompt injection.
3. **Anti-Hallucination Threshold:** Vector search queries with a similarity score below 0.50 are immediately rejected with an honest *"This episode does not contain enough information..."* response, preventing speculative answers and saving API tokens.
4. **Ephemeral Questions:** User questions asked in RAG Q&A are processed in real time and are not stored in PostgreSQL.

---

## Team & Project Identity
- **Repository:** `tech_news_innovation_show`
- **Author:** `mehak-webdev`
- **Course:** SEM 7 Project-2
