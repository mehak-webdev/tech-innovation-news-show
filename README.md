# Tech Innovation News Show

An automated technology news show platform that gathers daily tech news, generates audio episodes and transcripts, and provides interactive Q&A and analytics.

---

## Tech Stack
- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Node.js, Express (ES Modules)
- **Database:** PostgreSQL (Neon Serverless or Local)
- **AI Processing:** Google Gemini API (`@google/genai`)
- **Data Ingestion:** RSS Parser (`rss-parser`)
- **Planned for Phase 4+:** Daily broadcast script generation, TTS audio narration, and RAG-based Q&A

---

## Project Structure (Monorepo)

```text
tech_news_innovation_show/
│
├── .gitignore                   # Ignores dependencies, .env, and build artifacts
├── README.md                    # Project documentation & team setup guide
│
├── backend/                     # Express API Server & Database Layer
│   ├── .env.example             # Template for backend environment variables
│   ├── .gitignore               # Backend-specific ignore rules
│   ├── package.json             # Dependencies: express, cors, dotenv, nodemon, pg, rss-parser, @google/genai
│   └── src/
│       ├── db/
│       │   ├── index.js         # PostgreSQL connection pool with SSL support
│       │   ├── migrate.js       # Phase 2 SQL table schemas (sources, categories, articles)
│       │   └── migrate_phase3.js # Phase 3 SQL migration (AI processing fields)
│       ├── services/
│       │   ├── newsIngester.js  # RSS ingestion & URL-based deduplication
│       │   ├── aiProcessor.js   # Google Gemini structured editorial analysis
│       │   └── articlePipeline.js # Batch AI processing controller (trial limit, retry)
│       └── server.js            # Express server & API endpoints
│
└── frontend/                    # React + Vite Client
    ├── .env.example             # Template for frontend environment variables
    ├── .gitignore               # Frontend-specific ignore rules
    ├── index.html               # Main HTML entry point
    ├── package.json             # React, Vite, Tailwind CSS dependencies
    ├── postcss.config.js        # PostCSS configuration
    ├── tailwind.config.js       # Tailwind CSS configuration
    ├── vite.config.js           # Vite development server config (port 5173)
    └── src/
        ├── App.jsx              # News feed dashboard, AI scores, filters, and trial trigger
        ├── index.css            # Tailwind directives
        └── main.jsx             # React DOM entry point
```

---

## Getting Started (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or newer recommended)
- [Git](https://git-scm.com/)
- A PostgreSQL Database (e.g. Free [Neon Serverless Postgres](https://neon.tech) or local PostgreSQL)
- A Google Gemini API Key (free tier available at [Google AI Studio](https://aistudio.google.com/))

---

### First-Time Setup Instructions

#### 1. Clone the repository
```bash
git clone <repository-url>
cd tech_news_innovation_show
```

#### 2. Configure Environment Variables
Copy `.env.example` into local `.env` files:

- **Backend:**
  ```powershell
  copy backend\.env.example backend\.env
  ```
  *(or on macOS/Linux: `cp backend/.env.example backend/.env`)*

- **Frontend:**
  ```powershell
  copy frontend\.env.example frontend\.env
  ```
  *(or on macOS/Linux: `cp frontend/.env.example frontend/.env`)*

In `backend/.env`, set:
```text
PORT=5000
CLIENT_URL=http://localhost:5173
DATABASE_URL=postgresql://<user>:<password>@<host>/<dbname>?sslmode=require
GEMINI_API_KEY=your_gemini_api_key_here
```

#### 3. Install Dependencies
```bash
# Backend dependencies
cd backend
npm install
cd ..

# Frontend dependencies
cd frontend
npm install
cd ..
```

#### 4. Run Database Migrations
```bash
cd backend
npm run migrate           # Creates sources, categories, and articles tables
npm run migrate:phase3    # Adds AI processing & scoring columns
cd ..
```

---

### Running the Application

Open **two separate terminal windows**:

#### Terminal 1 — Backend Server
```bash
cd backend
npm run dev
```
* **Runs at:** `http://localhost:5000`
* **Health Check:** `http://localhost:5000/health` (reports server, database, and Gemini status)

#### Terminal 2 — Frontend Application
```bash
cd frontend
npm run dev
```
* **Runs at:** `http://localhost:5173`
* Open `http://localhost:5173` in your browser.

---

## API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server, PostgreSQL, and Gemini status |
| `GET` | `/api/sources` | Lists active news sources (TechCrunch, The Verge) |
| `GET` | `/api/articles` | Returns articles (supports `?sort=importance` and `?status=completed`) |
| `POST` | `/api/articles/ingest` | Triggers RSS ingestion and URL deduplication |
| `POST` | `/api/articles/process?limit=3` | Processes pending articles using Google Gemini (trial limit: 3) |
| `POST` | `/api/articles/:id/retry` | Retries AI processing for a single failed/pending article |

---

## Importance Scoring Rubric (1–100 Points)

Articles are scored according to four editorial criteria:
1. **Technical Innovation & Novelty (0–30 pts):** Breakthroughs vs. routine version updates.
2. **Industry & Market Impact (0–30 pts):** Platform/business influence across tech ecosystems.
3. **Developer Relevance (0–25 pts):** Actionable relevance for software engineers and builders.
4. **Timeliness & Urgency (0–15 pts):** Significance of the announcement today.

---

## Security & Usage Controls

1. **Backend Exclusivity:** API keys are never sent to the browser or stored in frontend code.
2. **Cost & Token Caps:** Content is truncated to 1,500 characters (~300 words) prior to AI processing.
3. **Trial Batch Limits:** The default AI processing endpoint limits batches to 3 articles during development.
4. **Editorial Transparency:** Clear visual separation between original publisher reporting and AI-generated executive summaries and scores.

---

## Project Roadmap

- [x] **Phase 1: Project Initialization** (Git repo, backend scaffold with `GET /health`, frontend with Vite & Tailwind, live connectivity check).
- [x] **Phase 2: Database Foundation & Ingestion Prototype** (PostgreSQL schema, migration scripts, RSS parsing with `rss-parser`, URL deduplication, and React Articles Feed UI).
- [x] **Phase 3: AI-Powered Article Processing** (Google Gemini integration, structured summaries, importance scoring rubric 1-100, trial batch processing, and ranked React feed).
- [ ] **Phase 4: Episode Script & Audio Generation** (Top-ranked story selection, daily 3-minute broadcast script synthesis, TTS audio narration, and player controls).
- [ ] **Phase 5: Interactive Q&A ("Ask This Episode")** (Vector search / RAG for episode questioning).
- [ ] **Phase 6: News Analytics & Insights** (Topic breakdown, trends charts, source statistics).
- [ ] **Phase 7: Cloud Deployment** (Vercel for frontend, Render/Railway for backend, Neon for PostgreSQL).
