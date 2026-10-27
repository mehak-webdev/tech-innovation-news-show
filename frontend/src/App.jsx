import { useState, useEffect } from 'react';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking');
  const [backendData, setBackendData] = useState(null);

  // Articles state
  const [articles, setArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [notification, setNotification] = useState(null);

  // Filtering & Sorting state
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'completed', 'pending'
  const [sortBy, setSortBy] = useState('latest'); // 'latest', 'importance'

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // 1. Health check
  const checkBackend = async () => {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setBackendData(data);
      setBackendStatus('connected');
    } catch (err) {
      setBackendStatus('disconnected');
    }
  };

  // 2. Fetch articles from DB
  const fetchArticles = async () => {
    setLoadingArticles(true);
    try {
      const params = new URLSearchParams();
      if (sortBy === 'importance') params.append('sort', 'importance');
      if (activeFilter !== 'all') params.append('status', activeFilter);

      const response = await fetch(`${apiUrl}/api/articles?${params.toString()}`);
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
    try {
      const response = await fetch(`${apiUrl}/api/articles/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.stats) {
        setNotification({
          type: 'success',
          message: `Ingestion Complete: Added ${data.stats.articlesInserted} new articles, skipped ${data.stats.duplicatesSkipped} duplicates.`
        });
        await fetchArticles();
      }
    } catch (err) {
      setNotification({ type: 'error', message: `Ingestion failed: ${err.message}` });
    } finally {
      setIsIngesting(false);
    }
  };

  // 4. Trigger AI Article Processing (Trial: 3 articles)
  const handleProcessAI = async () => {
    setIsProcessingAI(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`${apiUrl}/api/articles/process?limit=3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (data.stats) {
        setNotification({
          type: 'success',
          message: `AI Processing Complete: Analyzed ${data.stats.succeeded} articles successfully (${data.stats.failed} failed).`
        });
        await fetchArticles();
      } else if (data.message) {
        setNotification({ type: 'info', message: data.message });
        await fetchArticles();
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setNotification({ type: 'error', message: 'Processing is taking longer than expected. Please refresh the page to see updated results.' });
      } else {
        setNotification({ type: 'error', message: `AI Processing failed: ${err.message}` });
      }
      await fetchArticles();
    } finally {
      clearTimeout(timeoutId);
      setIsProcessingAI(false);
    }
  };

  // 5. Retry a specific article
  const handleRetryArticle = async (id) => {
    try {
      const response = await fetch(`${apiUrl}/api/articles/${id}/retry`, { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        setNotification({ type: 'success', message: `Article ID #${id} reprocessed successfully!` });
        await fetchArticles();
      } else {
        alert(data.error || 'Retry failed');
      }
    } catch (err) {
      alert(`Retry failed: ${err.message}`);
    }
  };

  useEffect(() => {
    checkBackend();
  }, [apiUrl]);

  useEffect(() => {
    fetchArticles();
  }, [apiUrl, activeFilter, sortBy]);

  const isDbConnected = backendData?.database === 'connected';
  const isAiConfigured = backendData?.ai?.includes('configured');

  const pendingCount = articles.filter(
    (a) => a.processing_status === 'pending' || a.processing_status === 'failed' || a.processing_status === 'processing'
  ).length;
  const completedCount = articles.filter((a) => a.processing_status === 'completed').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-white">
      {/* Header / Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              TN
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Tech Innovation News Show
              </h1>
              <p className="text-xs text-slate-400">Phase 3 • AI Summarization & Importance Ranking</p>
            </div>
          </div>

          {/* Diagnostics Pills */}
          <div className="flex items-center flex-wrap gap-2 text-xs">
            {/* Backend API */}
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400 mr-1.5">API:</span>
              {backendStatus === 'connected' ? (
                <span className="text-emerald-400 font-medium flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1"></span> Connected
                </span>
              ) : (
                <span className="text-rose-400 font-medium">Offline</span>
              )}
            </div>

            {/* PostgreSQL */}
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400 mr-1.5">DB:</span>
              {isDbConnected ? (
                <span className="text-emerald-400 font-medium flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1"></span> PostgreSQL
                </span>
              ) : (
                <span className="text-amber-400 font-medium">Checking</span>
              )}
            </div>

            {/* Gemini AI */}
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400 mr-1.5">AI Engine:</span>
              {isAiConfigured ? (
                <span className="text-cyan-400 font-medium flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-1 animate-pulse"></span> Google Gemini
                </span>
              ) : (
                <span className="text-amber-400 font-medium">
                  {backendData?.ai || 'Missing GEMINI_API_KEY'}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-8 flex-1 w-full space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            🤖 Phase 3: AI-Powered Editorial Pipeline
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Smart Summaries & Importance Rankings
          </h2>
          <p className="text-sm text-slate-400">
            Articles ingested from TechCrunch & The Verge, analyzed by Google Gemini with concise executive summaries, key takeaways, and objective importance scores (1–100).
          </p>
        </div>

        {/* Global Notification Banner */}
        {notification && (
          <div className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
            notification.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
          }`}>
            <div className="flex items-center space-x-2">
              <span>{notification.type === 'error' ? '⚠️' : '✅'}</span>
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-white text-sm ml-4 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Action Controls Bar */}
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              onClick={handleProcessAI}
              disabled={isProcessingAI || !isDbConnected || pendingCount === 0}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition flex items-center space-x-2 shadow-lg shadow-cyan-500/10 ${
                isProcessingAI || !isDbConnected || pendingCount === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white'
              }`}
            >
              {isProcessingAI ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Analyzing 3 articles in parallel (~5-8s)...</span>
                </>
              ) : pendingCount === 0 ? (
                <>
                  <span>✅ All Articles Analyzed ({completedCount})</span>
                </>
              ) : (
                <>
                  <span>✨ Process with AI (Next 3 • {pendingCount} pending)</span>
                </>
              )}
            </button>

            <button
              onClick={handleIngestNews}
              disabled={isIngesting || !isDbConnected}
              className="px-4 py-2.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center space-x-1.5"
            >
              {isIngesting ? (
                <>
                  <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                  <span>Fetching RSS...</span>
                </>
              ) : (
                <>
                  <span>📥 Ingest Latest RSS</span>
                </>
              )}
            </button>
          </div>

          {/* Filters & Sorting */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            {/* Filter Tabs */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex text-xs">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeFilter === 'all'
                    ? 'bg-slate-800 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveFilter('completed')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeFilter === 'completed'
                    ? 'bg-slate-800 text-cyan-400 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                AI Analyzed
              </button>
              <button
                onClick={() => setActiveFilter('pending')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeFilter === 'pending'
                    ? 'bg-slate-800 text-amber-400 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Pending
              </button>
            </div>

            {/* Sort Toggle */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex text-xs">
              <button
                onClick={() => setSortBy('latest')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  sortBy === 'latest'
                    ? 'bg-slate-800 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Latest
              </button>
              <button
                onClick={() => setSortBy('importance')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  sortBy === 'importance'
                    ? 'bg-slate-800 text-cyan-400 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ⭐ Importance
              </button>
            </div>
          </div>
        </div>

        {/* Articles Feed */}
        {loadingArticles ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-slate-400">Loading articles from database...</p>
          </div>
        ) : articles.length > 0 ? (
          <div className="space-y-5">
            {articles.map((article) => {
              const isCompleted = article.processing_status === 'completed';
              const isFailed = article.processing_status === 'failed';
              const keyPoints = Array.isArray(article.ai_key_points) ? article.ai_key_points : [];

              return (
                <div
                  key={article.id}
                  className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700 transition shadow-sm space-y-4"
                >
                  {/* Top Meta Line: Badges & Scores */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                        {article.source_name || 'Tech News'}
                      </span>
                      {article.ai_category && (
                        <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                          {article.ai_category}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      {isCompleted && (
                        <span className={`px-3 py-1 rounded-full font-bold flex items-center space-x-1 ${
                          article.importance_score >= 75
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : article.importance_score >= 50
                            ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          <span>⭐ Score:</span>
                          <span>{article.importance_score}/100</span>
                        </span>
                      )}

                      {!isCompleted && !isFailed && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          ⏳ Pending AI Analysis
                        </span>
                      )}

                      {isFailed && (
                        <div className="flex items-center space-x-2">
                          <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            ⚠️ Analysis Failed
                          </span>
                          <button
                            onClick={() => handleRetryArticle(article.id)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Headline */}
                  <h3 className="text-xl font-bold text-white leading-snug">
                    {article.title}
                  </h3>

                  {/* AI Generated Section */}
                  {isCompleted && (
                    <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 mb-1 flex items-center space-x-1.5">
                          <span>🤖 Executive AI Summary</span>
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed font-normal">
                          {article.ai_summary}
                        </p>
                      </div>

                      {keyPoints.length > 0 && (
                        <div className="pt-2 border-t border-slate-800/60">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                            Key Takeaways
                          </div>
                          <ul className="space-y-1 text-xs text-slate-300">
                            {keyPoints.map((point, idx) => (
                              <li key={idx} className="flex items-start space-x-2">
                                <span className="text-cyan-400 leading-none mt-1">•</span>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {article.importance_reason && (
                        <div className="pt-2 border-t border-slate-800/60 text-xs text-slate-400 italic">
                          <span className="font-semibold text-slate-300">Editorial Rationale: </span>
                          "{article.importance_reason}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback to original excerpt if not processed */}
                  {!isCompleted && article.summary && (
                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                      {article.summary}
                    </p>
                  )}

                  {/* Failure reason callout */}
                  {isFailed && article.processing_error && (
                    <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/20 text-xs text-rose-300">
                      <strong>Failure Note:</strong> {article.processing_error}
                    </div>
                  )}

                  {/* Footer / Attribution */}
                  <div className="pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
                    <div>
                      Published {article.published_at ? new Date(article.published_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      }) : 'Recently'} by {article.author || article.source_name}
                    </div>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center space-x-1"
                    >
                      <span>Read Original Source</span>
                      <span>↗</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 space-y-4">
            <div className="text-4xl">📭</div>
            <h3 className="text-base font-bold text-white">No Articles Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Try changing your active filter, or click "Ingest Latest RSS" to fetch new stories into the database.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500 space-y-1">
        <p>Tech Innovation News Show • Phase 3: AI Article Processing</p>
        <p className="text-[11px] text-slate-600">
          🤖 Summaries and importance scores are generated by Google Gemini and reflect objective news criteria, not editorial endorsements.
        </p>
      </footer>
    </div>
  );
}
