# Tech Innovation News Show

An automated technology news show platform that gathers daily tech news, generates audio episodes and transcripts, and provides interactive Q&A and analytics.

---

## Tech Stack
- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Node.js, Express (ES Modules)
- **Database:** PostgreSQL (Neon Serverless or Local)
- **Data Ingestion:** RSS Parser (`rss-parser`)
- **AI / Media (Later Phases):** Article summarization, TTS audio narration, and RAG-based Q&A

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
│   ├── package.json             # Dependencies: express, cors, dotenv, nodemon, pg, rss-parser
│   └── src/
│       ├── db/
│       │   ├── index.js         # PostgreSQL connection pool with SSL support
│       │   └── migrate.js       # SQL table schemas (sources, categories, articles)
│       ├── services/
│       │   └── newsIngester.js  # RSS ingestion & URL-based deduplication
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
        ├── App.jsx              # News feed dashboard, DB diagnostics, and ingestion control
        ├── index.css            # Tailwind directives
        └── main.jsx             # React DOM entry point
```

---

## Getting Started (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or newer recommended)
- [Git](https://git-scm.com/)
- A PostgreSQL Database (e.g. Free [Neon Serverless Postgres](https://neon.tech) or local PostgreSQL)

---

### First-Time Setup Instructions

If you are cloning this repository for the first time:

#### 1. Clone the repository
```bash
git clone <repository-url>
cd tech_news_innovation_show
```

#### 2. Configure Environment Variables
Copy the `.env.example` templates into local `.env` files:

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
```

#### 3. Install Dependencies
Run `npm install` inside both folders:

```bash
# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

#### 4. Run Database Migrations
Once your `DATABASE_URL` is configured in `backend/.env`, create the tables and initial seed sources:

```bash
cd backend
npm run migrate
cd ..
```

---

### Running the Application

To run the full stack locally, open **two separate terminal windows**:

#### Terminal 1 — Backend Server
```bash
cd backend
npm run dev
```
* **Runs at:** `http://localhost:5000`
* **Health Check:** `http://localhost:5000/health` (reports server and database connectivity)

#### Terminal 2 — Frontend Application
```bash
cd frontend
npm run dev
```
* **Runs at:** `http://localhost:5173`
* Open your browser to `http://localhost:5173`. You will see the **Tech Innovation News Show** live feed with live status badges for both the API and PostgreSQL.

---

## API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | API Welcome message & available routes |
| `GET` | `/health` | Server & PostgreSQL connectivity status |
| `GET` | `/api/sources` | Lists active news sources (TechCrunch, The Verge) |
| `GET` | `/api/articles` | Returns the latest 25 ingested articles with source metadata |
| `POST` | `/api/articles/ingest` | Triggers manual RSS ingestion and URL deduplication |

---

## Database Safety Guidelines

1. **Keep Secrets Out of Version Control:** Never commit database credentials or connection strings.
2. **Local Environment Only:** Keep `DATABASE_URL` exclusively in `backend/.env`, which is ignored by `.gitignore`.
3. **Commit Templates Only:** Keep `backend/.env.example` free of secret credentials.
4. **Parameterized Queries:** Always use parameterized SQL placeholders (`$1`, `$2`) to prevent SQL Injection attacks.

---

## Project Roadmap

- [x] **Phase 1: Project Initialization** (Git repo, backend scaffold with `GET /health`, frontend with Vite & Tailwind, live connectivity check).
- [x] **Phase 2: Database Foundation & Ingestion Prototype** (PostgreSQL connection pool, migration scripts, RSS parsing with `rss-parser`, URL deduplication, and React Articles Feed UI).
- [ ] **Phase 3: Automated Pipeline & Source Expansion** (Background cron jobs, additional tech feeds, content sanitization, and source filtering).
- [ ] **Phase 4: AI Summarization & Script Generation** (Article deduplication, bullet summaries, daily show script).
- [ ] **Phase 5: Audio Generation & Media Player** (Text-to-speech audio rendering, frontend episode player).
- [ ] **Phase 6: Interactive Q&A ("Ask This Episode")** (Vector search / RAG for episode questioning).
- [ ] **Phase 7: News Analytics & Insights** (Topic breakdown, trends charts, source statistics).
- [ ] **Phase 8: Cloud Deployment** (Vercel for frontend, Render/Railway for backend, Neon for PostgreSQL).
