# Tech Innovation News Show

An automated technology news show platform that gathers daily tech news, generates audio episodes and transcripts, and provides interactive Q&A and analytics.

---

## Tech Stack
- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Node.js, Express (ES Modules)
- **Database:** PostgreSQL (Planned for Phase 2)
- **AI / Media (Later Phases):** Article summarization, TTS audio narration, and RAG-based Q&A

---

## Project Structure (Monorepo)

```text
tech_news_innovation_show/
│
├── .gitignore                   # Ignores dependencies, .env, and build artifacts
├── README.md                    # Project documentation & team setup guide
│
├── backend/                     # Express API Server
│   ├── .env.example             # Template for backend environment variables
│   ├── .gitignore               # Backend-specific ignore rules
│   ├── package.json             # Dependencies: express, cors, dotenv, nodemon
│   └── src/
│       └── server.js            # Express server & GET /health endpoint
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
        ├── App.jsx              # Main dashboard with live API health diagnostics
        ├── index.css            # Tailwind directives
        └── main.jsx             # React DOM entry point
```

---

## Getting Started (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or newer recommended)
- [Git](https://git-scm.com/)

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

---

### Running the Application

To run the full stack locally, open **two separate terminal windows**:

#### Terminal 1 — Backend Server
```bash
cd backend
npm run dev
```
* **Runs at:** `http://localhost:5000`
* **Health Check:** `http://localhost:5000/health` (returns JSON status)

#### Terminal 2 — Frontend Application
```bash
cd frontend
npm run dev
```
* **Runs at:** `http://localhost:5173`
* Open your browser to `http://localhost:5173`. You should see the **Tech Innovation News Show** landing page with a green **"Backend Connected"** status pill.

---

## API Endpoints Reference

| Method | Endpoint | Description | Sample Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | API Welcome message & available routes | `{"message": "Welcome to the Tech Innovation News Show API"}` |
| `GET` | `/health` | Server health & uptime check | `{"status": "ok", "service": "tech-news-backend", "timestamp": "..."}` |

---

## Team Collaboration Guide

To ensure both team members can work smoothly without stepping on each other's code:

### 1. Branching Strategy
- **Never commit directly to `main`.**
- Create a feature branch for each task:
  ```bash
  # For backend features
  git checkout -b feature/backend-<feature-name>

  # For frontend features
  git checkout -b feature/frontend-<feature-name>
  ```

### 2. Daily Workflow
1. **Pull the latest changes before starting work:**
   ```bash
   git checkout main
   git pull origin main
   ```
2. **Switch to your feature branch and bring it up to date:**
   ```bash
   git checkout feature/your-feature
   git merge main
   ```
3. **Make your changes, test them locally, and commit:**
   ```bash
   git add .
   git commit -m "feat: descriptive summary of changes"
   ```
4. **Push your branch to GitHub:**
   ```bash
   git push -u origin feature/your-feature
   ```
5. **Open a Pull Request (PR)** on GitHub targeting `main`. Have your partner review and approve before merging.

### 3. Avoiding Conflicts
- Keep changes scoped: Frontend work stays in `frontend/`, backend work stays in `backend/`.
- Never commit `.env` files — each student maintains their own local `.env`.

---

## Project Roadmap

- [x] **Phase 1: Project Initialization** (Git repo, backend scaffold with `GET /health`, frontend with Vite & Tailwind, live connectivity check).
- [ ] **Phase 2: Database & Data Modeling** (PostgreSQL schema, migrations, connection pool).
- [ ] **Phase 3: News Ingestion Pipeline** (Fetching, parsing, and storing raw tech articles).
- [ ] **Phase 4: AI Summarization & Script Generation** (Article deduplication, bullet summaries, daily show script).
- [ ] **Phase 5: Audio Generation & Media Player** (Text-to-speech audio rendering, frontend episode player).
- [ ] **Phase 6: Interactive Q&A ("Ask This Episode")** (Vector search / RAG for episode questioning).
- [ ] **Phase 7: News Analytics & Insights** (Topic breakdown, trends charts, source statistics).
- [ ] **Phase 8: Cloud Deployment** (Vercel for frontend, Render/Railway for backend, Neon for PostgreSQL).
