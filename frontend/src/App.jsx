import { useState, useEffect } from 'react';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking');
  const [backendData, setBackendData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Articles state
  const [articles, setArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStats, setIngestStats] = useState(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // 1. Health check
  const checkBackend = async () => {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setBackendData(data);
      setBackendStatus('connected');
    } catch (err) {
      setBackendStatus('disconnected');
      setErrorMsg(err.message);
    }
  };

  // 2. Fetch articles from DB
  const fetchArticles = async () => {
    setLoadingArticles(true);
    try {
      const response = await fetch(`${apiUrl}/api/articles`);
      if (response.ok) {
        const data = await response.json();
        setArticles(data.articles || []);
      }
    } catch (err) {
      console.error('Failed to fetch articles:', err);
    } finally {
      setLoadingArticles(false);
    }
  };

  // 3. Trigger RSS News Ingestion
  const handleIngestNews = async () => {
    setIsIngesting(true);
    setIngestStats(null);
    try {
      const response = await fetch(`${apiUrl}/api/articles/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.stats) {
        setIngestStats(data.stats);
        await fetchArticles(); // Refresh list after ingestion
      }
    } catch (err) {
      alert(`Ingestion failed: ${err.message}`);
    } finally {
      setIsIngesting(false);
    }
  };

  useEffect(() => {
    checkBackend();
    fetchArticles();
  }, [apiUrl]);

  const isDbConnected = backendData?.database === 'connected';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-white">
      {/* Header / Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              TN
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Tech Innovation News Show
              </h1>
              <p className="text-xs text-slate-400">Student Project • Phase 2 Database & Ingestion</p>
            </div>
          </div>

          {/* Diagnostics Pills */}
          <div className="flex items-center space-x-3 text-xs">
            {/* Backend API Pill */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">API:</span>
              {backendStatus === 'checking' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  Checking
                </span>
              )}
              {backendStatus === 'connected' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-400"></span>
                  Connected
                </span>
              )}
              {backendStatus === 'disconnected' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                  <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-rose-400"></span>
                  Offline
                </span>
              )}
            </div>

            {/* PostgreSQL DB Pill */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">Database:</span>
              {isDbConnected ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-400"></span>
                  PostgreSQL
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  {backendData?.database || 'Pending DB Config'}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-10 flex-1 w-full space-y-10">
        {/* Hero Section */}
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            📰 Phase 2: PostgreSQL News Aggregation Active
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Live Tech News Feed & Storage Prototype
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            Real technology articles ingested from verified RSS feeds (TechCrunch & The Verge), stored in PostgreSQL with URL deduplication.
          </p>
        </div>

        {/* Action Controls & Feed Stats Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
          <div>
            <h3 className="text-base font-semibold text-white">
              Database Articles ({articles.length})
            </h3>
            <p className="text-xs text-slate-400">
              Fetched from PostgreSQL • Deduplicated by URL
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleIngestNews}
              disabled={isIngesting || !isDbConnected}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition flex items-center space-x-2 shadow-lg shadow-cyan-500/10 ${
                isIngesting || !isDbConnected
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold'
              }`}
            >
              {isIngesting ? (
                <>
                  <span className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                  <span>Ingesting RSS Feeds...</span>
                </>
              ) : (
                <>
                  <span>📥 Fetch & Ingest Latest News</span>
                </>
              )}
            </button>
            <button
              onClick={fetchArticles}
              disabled={loadingArticles}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Refresh articles from database"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Ingest Feedback Banner */}
        {ingestStats && (
          <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-base">✅</span>
              <span>
                <strong>Ingestion Complete:</strong> Added{' '}
                <span className="font-bold text-white">{ingestStats.articlesInserted}</span> new articles,
                skipped <span className="font-bold text-white">{ingestStats.duplicatesSkipped}</span> existing duplicates across {ingestStats.totalSources} sources.
              </span>
            </div>
            <button
              onClick={() => setIngestStats(null)}
              className="text-slate-400 hover:text-white text-sm ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Articles Feed */}
        {loadingArticles ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-slate-400">Loading articles from PostgreSQL database...</p>
          </div>
        ) : articles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {articles.map((article) => (
              <div
                key={article.id}
                className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition hover:shadow-lg space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                      {article.source_name || 'Tech News'}
                    </span>
                    <span className="text-slate-500">
                      {article.published_at
                        ? new Date(article.published_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : 'Recent'}
                    </span>
                  </div>

                  <h4 className="text-base font-semibold text-white leading-snug line-clamp-2">
                    {article.title}
                  </h4>

                  {article.summary && (
                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                      {article.summary}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500 truncate max-w-[200px]">
                    By {article.author || 'Editorial Team'}
                  </span>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center space-x-1"
                  >
                    <span>Read Article</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 space-y-4">
            <div className="text-4xl">📭</div>
            <h3 className="text-base font-bold text-white">No Articles in Database Yet</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {!isDbConnected
                ? 'Configure your DATABASE_URL in backend/.env and run migrations to connect PostgreSQL.'
                : 'Your database is connected! Click "Fetch & Ingest Latest News" above to pull the latest headlines from TechCrunch and The Verge.'}
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        Tech Innovation News Show • Phase 2: PostgreSQL & RSS Ingestion
      </footer>
    </div>
  );
}
