# Production Deployment Guide: Tech Innovation News Show

This guide provides end-to-end instructions for deploying the **Tech Innovation News Show** to production for free using:
- **Neon** for Serverless PostgreSQL with `pgvector` (Database)
- **Render** for the Node.js Express API (Backend Web Service)
- **Vercel** for the React Vite SPA (Frontend)
- **GitHub Actions** for free daily 6:00 PM IST automated broadcast generation

---

## Architecture & Hosting Targets

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│        Frontend (Vercel)        │       │         Backend (Render)        │
│  https://<project>.vercel.app   │──────►│   https://<app>.onrender.com    │
└─────────────────────────────────┘       └────────────────┬────────────────┘
                                                           │
                                                           ▼
                                          ┌─────────────────────────────────┐
                                          │     Database (Neon PostgreSQL)  │
                                          │ AWS Singapore + pgvector v0.8.6 │
                                          └─────────────────────────────────┘
```

---

## Step 1: Push Code to GitHub

1. Open [GitHub](https://github.com) and create a new repository (e.g. `tech-news-innovation-show`).
2. Make it **Public** or **Private**.
3. In your local terminal, link and push your code:
   ```bash
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPOSITORY_NAME>.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Deploy Backend to Render

1. Log in to [Render](https://dashboard.render.com).
2. Click **New +** $\to$ **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your GitHub repository.
4. Configure the Web Service settings:
   - **Name:** `tech-news-backend` (or your preferred name)
   - **Region:** `Singapore` (select the region closest to your Neon database for lowest latency)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node src/server.js`
   - **Instance Type:** `Free`
5. Scroll down to **Environment Variables** and add the following keys:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations & sanitizes error logs |
| `PORT` | `10000` | Render default listening port |
| `DATABASE_URL` | *(Copy from `backend/.env`)* | Connection string to your Neon PostgreSQL instance |
| `GEMINI_API_KEY` | *(Copy from `backend/.env`)* | Your Google Gemini API Studio key |
| `OPERATOR_API_KEY` | `057be09c0c8152d8f221435099a2c821` | Operator secret key for admin mutations |
| `CLIENT_URL` | `http://localhost:5173` | Temporary value; will update with your Vercel URL in Step 4 |

6. Click **Deploy Web Service**.
7. Wait 2–3 minutes for deployment to finish. Once live, Render will display your backend URL:
   `https://tech-news-backend-xxxx.onrender.com`
8. **Verify Backend Health:**
   Open `https://tech-news-backend-xxxx.onrender.com/health` in your browser. You should receive:
   ```json
   {
     "status": "ok",
     "service": "tech-news-backend",
     "database": "connected",
     "ai": "configured (Google Gemini)",
     "operatorAuth": "active"
   }
   ```

---

## Step 3: Deploy Frontend to Vercel

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** $\to$ **Project**.
3. Import your GitHub repository (`tech-news-innovation-show`).
4. Configure the Project Settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** Click **Edit** and choose `frontend`
   - **Build and Output Settings:** Leave default (`npm run build`, output `dist`)
5. Expand **Environment Variables** and add:

| Key | Value | Notes |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://tech-news-backend-xxxx.onrender.com` | **Do not** add a trailing slash `/` |

6. Click **Deploy**.
7. Within 1–2 minutes, Vercel will complete the build and assign your domain:
   `https://tech-news-innovation-show-xxxx.vercel.app`

---

## Step 4: The CORS Handshake (Crucial Step!)

Because the backend enforces a strict whitelist CORS policy (Phase 1 Security), it will reject requests from your new Vercel domain until you add it to `CLIENT_URL`.

1. Go back to your [Render Dashboard](https://dashboard.render.com).
2. Select your `tech-news-backend` service $\to$ **Environment**.
3. Update the `CLIENT_URL` variable to your actual Vercel domain:
   ```text
   CLIENT_URL=https://tech-news-innovation-show-xxxx.vercel.app
   ```
   *(If you want both Vercel and local development to work simultaneously, separate them by comma)*:
   ```text
   CLIENT_URL=https://tech-news-innovation-show-xxxx.vercel.app,http://localhost:5173
   ```
4. Click **Save Changes**. Render will automatically redeploy with the updated origin whitelist.

---

## Step 5: Test and Verify Production

1. Open your Vercel URL (`https://tech-news-innovation-show-xxxx.vercel.app`) in your browser.
2. Check the Status Indicators in the left sidebar:
   - 🟢 `API Server: Online`
   - 🟢 `PostgreSQL (Neon): Connected`
   - 🔵 `Google Gemini: Ready`
3. Test Public Features:
   - Browse the 150+ articles.
   - Click the **Daily Broadcasts** tab $\to$ play an episode audio file, test the speed selector (`1x`, `1.25x`, `1.5x`), and use the range scrubber.
   - Use the **Ask This Episode** box to ask a question (e.g. *"What is the main topic of this episode?"*).
   - Check the **Platform Trends** tab to view live analytics and category distribution.
4. Test Operator Admin Features:
   - In the sidebar, click **Key / Operator** $\to$ paste your key: `057be09c0c8152d8f221435099a2c821`.
   - Click **Ingest Latest RSS** or **Process with AI** to confirm that privileged database mutations succeed.

---

## Step 6: Free Automated Daily Scheduling (GitHub Actions)

Render Free Tier instances spin down into a sleep state after 15 minutes of inactivity. To ensure the daily 6:00 PM IST episode generation runs automatically without paying for a Render Cron worker, use the included GitHub Actions workflow (`.github/workflows/daily-broadcast.yml`):

1. Go to your GitHub repository $\to$ **Settings** $\to$ **Secrets and variables** $\to$ **Actions**.
2. Click **New repository secret** and add:
   - Name: `BACKEND_API_URL`  
     Value: `https://tech-news-backend-xxxx.onrender.com`
   - Name: `OPERATOR_API_KEY`  
     Value: `057be09c0c8152d8f221435099a2c821`
3. The workflow will run every day at **12:30 PM UTC (6:00 PM IST)** automatically:
   - Wakes up the Render backend.
   - Calls `POST /api/episodes/daily-job` with your operator key.
   - Selects candidate stories, writes the radio script, produces audio, and indexes chunks for RAG.
4. You can also trigger it manually anytime by navigating to the **Actions** tab in GitHub and clicking **Run workflow**.
