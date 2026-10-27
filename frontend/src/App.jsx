import { useState, useEffect, useRef } from 'react';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking');
  const [backendData, setBackendData] = useState(null);

  // Tab navigation
  const [activeTab, setActiveTab] = useState('articles'); // 'articles' | 'episodes'

  // Articles state
  const [articles, setArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  // Episodes state
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [isGeneratingEpisode, setIsGeneratingEpisode] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const audioRef = useRef(null);

  // Shared
  const [notification, setNotification] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState('latest');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // ── Health check ────────────────────────────────────────────────────────────
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

  // ── Fetch articles ──────────────────────────────────────────────────────────
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

  // ── Fetch episodes ──────────────────────────────────────────────────────────
  const fetchEpisodes = async () => {
    setLoadingEpisodes(true);
    try {
      const response = await fetch(`${apiUrl}/api/episodes`);
      if (response.ok) {
        const data = await response.json();
        setEpisodes(data.episodes || []);
      }
    } catch (err) {
      console.error('Failed to fetch episodes:', err);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  // ── Fetch full episode detail ────────────────────────────────────────────────
  const fetchEpisodeDetail = async (id) => {
    try {
      const response = await fetch(`${apiUrl}/api/episodes/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedEpisode(data.episode);
        setShowTranscript(false);
      }
    } catch (err) {
      console.error('Failed to fetch episode detail:', err);
    }
  };

  // ── Ingest RSS ──────────────────────────────────────────────────────────────
  const handleIngestNews = async () => {
    setIsIngesting(true);
    try {
      const response = await fetch(`${apiUrl}/api/articles/ingest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.stats) {
        showNotification('success', `Ingestion Complete: Added ${data.stats.articlesInserted} new articles, skipped ${data.stats.duplicatesSkipped} duplicates.`);
        await fetchArticles();
      }
    } catch (err) {
      showNotification('error', `Ingestion failed: ${err.message}`);
    } finally {
      setIsIngesting(false);
    }
  };

  // ── AI Processing ───────────────────────────────────────────────────────────
  const handleProcessAI = async () => {
    setIsProcessingAI(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${apiUrl}/api/articles/process?limit=3`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (data.stats) {
        showNotification('success', `AI Processing Complete: Analyzed ${data.stats.succeeded} articles (${data.stats.failed} failed).`);
        await fetchArticles();
      } else if (data.message) {
        showNotification('info', data.message);
        await fetchArticles();
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        showNotification('error', 'Processing is taking longer than expected. Refresh to see updated results.');
      } else {
        showNotification('error', `AI Processing failed: ${err.message}`);
      }
      await fetchArticles();
    } finally {
      clearTimeout(timeoutId);
      setIsProcessingAI(false);
    }
  };

  // ── Generate Episode ────────────────────────────────────────────────────────
  const handleGenerateEpisode = async () => {
    setIsGeneratingEpisode(true);
    setSelectedEpisode(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(`${apiUrl}/api/episodes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (data.episode?.status === 'audio_ready') {
        showNotification('success', `Episode generated! "${data.episode.title}" is ready to play.`);
        setSelectedEpisode(null);
        await fetchEpisodes();
        await fetchEpisodeDetail(data.episode.id);
      } else if (data.episode?.status === 'failed') {
        showNotification('error', `Episode generation failed: ${data.episode.error_message}`);
      } else if (data.episode) {
        showNotification('info', `Episode status: ${data.episode.status}. ${data.message}`);
        await fetchEpisodes();
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        showNotification('info', 'Generation is taking slightly longer in the background. Please wait a few seconds and refresh.');
      } else {
        showNotification('error', `Episode generation failed: ${err.message}`);
      }
    } finally {
      clearTimeout(timeoutId);
      setIsGeneratingEpisode(false);
    }
  };

  // ── Retry article ───────────────────────────────────────────────────────────
  const handleRetryArticle = async (id) => {
    try {
      const response = await fetch(`${apiUrl}/api/articles/${id}/retry`, { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        showNotification('success', `Article #${id} reprocessed successfully!`);
        await fetchArticles();
      } else {
        showNotification('error', data.error || 'Retry failed');
      }
    } catch (err) {
      showNotification('error', `Retry failed: ${err.message}`);
    }
  };

  function showNotification(type, message) {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 8000);
  }

  useEffect(() => { checkBackend(); }, [apiUrl]);
  useEffect(() => { fetchArticles(); }, [apiUrl, activeFilter, sortBy]);
  useEffect(() => {
    if (activeTab === 'episodes') fetchEpisodes();
  }, [activeTab]);

  const isDbConnected = backendData?.database === 'connected';
  const isAiConfigured = backendData?.ai?.includes('configured');
  const completedCount = articles.filter(a => a.processing_status === 'completed').length;
  const pendingCount = articles.filter(
    a => a.processing_status === 'pending' || a.processing_status === 'failed'
  ).length;

  const statusColor = (score) => {
    if (score >= 75) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (score >= 50) return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const episodeStatusBadge = (status) => {
    const map = {
      audio_ready: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      script_ready: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      draft: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      failed: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
    return map[status] || 'bg-slate-800 text-slate-400 border-slate-700';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-white">

      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              TN
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">Tech Innovation News Show</h1>
              <p className="text-xs text-slate-400">Phase 4 • Episode Generation & Audio Player</p>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-2 text-xs">
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400 mr-1.5">API:</span>
              {backendStatus === 'connected' ? (
                <span className="text-emerald-400 font-medium flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1"></span>Connected</span>
              ) : (
                <span className="text-rose-400 font-medium">Offline</span>
              )}
            </div>
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400 mr-1.5">DB:</span>
              {isDbConnected ? (
                <span className="text-emerald-400 font-medium flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1"></span>PostgreSQL</span>
              ) : (
                <span className="text-amber-400 font-medium">Disconnected</span>
              )}
            </div>
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400 mr-1.5">AI:</span>
              {isAiConfigured ? (
                <span className="text-cyan-400 font-medium flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-1 animate-pulse"></span>Gemini</span>
              ) : (
                <span className="text-amber-400 font-medium">No Key</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-6xl mx-auto px-6 py-8 flex-1 w-full space-y-8">

        {/* Notification Banner */}
        {notification && (
          <div className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
            notification.type === 'error' ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
            : notification.type === 'info' ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
            : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
          }`}>
            <div className="flex items-center space-x-2">
              <span>{notification.type === 'error' ? '⚠️' : notification.type === 'info' ? 'ℹ️' : '✅'}</span>
              <span>{notification.message}</span>
            </div>
            <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white ml-4 font-bold">✕</button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-slate-900/60 border border-slate-800 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('articles')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'articles' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            📰 Articles Feed
          </button>
          <button
            onClick={() => setActiveTab('episodes')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'episodes' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🎙️ Episodes
          </button>
        </div>

        {/* ════════════ ARTICLES TAB ════════════ */}
        {activeTab === 'articles' && (
          <div className="space-y-6">
            {/* Actions Bar */}
            <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <button
                  onClick={handleProcessAI}
                  disabled={isProcessingAI || !isDbConnected || pendingCount === 0}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition flex items-center space-x-2 ${
                    isProcessingAI || !isDbConnected || pendingCount === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/10'
                  }`}
                >
                  {isProcessingAI ? (
                    <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span><span>Analyzing in parallel (~5-8s)...</span></>
                  ) : pendingCount === 0 ? (
                    <span>✅ All Articles Analyzed ({completedCount})</span>
                  ) : (
                    <span>✨ Process with AI (Next 3 · {pendingCount} pending)</span>
                  )}
                </button>
                <button
                  onClick={handleIngestNews}
                  disabled={isIngesting || !isDbConnected}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center space-x-1.5"
                >
                  {isIngesting ? <><span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span><span>Fetching RSS...</span></> : <span>📥 Ingest Latest RSS</span>}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex text-xs">
                  {['all', 'completed', 'pending'].map(f => (
                    <button key={f} onClick={() => setActiveFilter(f)}
                      className={`px-3 py-1.5 rounded-lg transition capitalize ${activeFilter === f ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}>
                      {f === 'completed' ? 'AI Analyzed' : f === 'pending' ? 'Pending' : 'All'}
                    </button>
                  ))}
                </div>
                <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex text-xs">
                  {[['latest', 'Latest'], ['importance', '⭐ Importance']].map(([val, label]) => (
                    <button key={val} onClick={() => setSortBy(val)}
                      className={`px-3 py-1.5 rounded-lg transition ${sortBy === val ? 'bg-slate-800 text-cyan-400 font-medium' : 'text-slate-400 hover:text-slate-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Articles List */}
            {loadingArticles ? (
              <div className="py-20 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-slate-400">Loading articles...</p>
              </div>
            ) : articles.length > 0 ? (
              <div className="space-y-5">
                {articles.map(article => {
                  const isCompleted = article.processing_status === 'completed';
                  const isFailed = article.processing_status === 'failed';
                  const keyPoints = Array.isArray(article.ai_key_points) ? article.ai_key_points : [];
                  return (
                    <div key={article.id} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700 transition shadow-sm space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">{article.source_name || 'Tech News'}</span>
                          {article.ai_category && <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">{article.ai_category}</span>}
                        </div>
                        <div className="flex items-center space-x-2">
                          {isCompleted && article.importance_score && (
                            <span className={`px-3 py-1 rounded-full font-bold border flex items-center space-x-1 ${statusColor(article.importance_score)}`}>
                              <span>⭐ {article.importance_score}/100</span>
                            </span>
                          )}
                          {!isCompleted && !isFailed && <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">⏳ Pending</span>}
                          {isFailed && (
                            <div className="flex items-center space-x-2">
                              <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">⚠️ Failed</span>
                              <button onClick={() => handleRetryArticle(article.id)} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">Retry</button>
                            </div>
                          )}
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-white leading-snug">{article.title}</h3>
                      {isCompleted && (
                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-3">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 mb-1">🤖 AI Summary</div>
                            <p className="text-sm text-slate-200 leading-relaxed">{article.ai_summary}</p>
                          </div>
                          {keyPoints.length > 0 && (
                            <div className="pt-2 border-t border-slate-800/60">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Key Takeaways</div>
                              <ul className="space-y-1 text-xs text-slate-300">
                                {keyPoints.map((pt, i) => <li key={i} className="flex items-start space-x-2"><span className="text-cyan-400 mt-1">•</span><span>{pt}</span></li>)}
                              </ul>
                            </div>
                          )}
                          {article.importance_reason && (
                            <div className="pt-2 border-t border-slate-800/60 text-xs text-slate-400 italic">
                              <span className="font-semibold text-slate-300">Rationale: </span>"{article.importance_reason}"
                            </div>
                          )}
                        </div>
                      )}
                      {!isCompleted && article.summary && <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{article.summary}</p>}
                      {isFailed && article.processing_error && (
                        <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/20 text-xs text-rose-300">
                          <strong>Failure:</strong> {article.processing_error}
                        </div>
                      )}
                      <div className="pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
                        <span>Published {article.published_at ? new Date(article.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently'} by {article.author || article.source_name}</span>
                        <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center space-x-1"><span>Read Original</span><span>↗</span></a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 space-y-4">
                <div className="text-4xl">📭</div>
                <h3 className="text-base font-bold text-white">No Articles Found</h3>
                <p className="text-xs text-slate-400">Change the filter or click "Ingest Latest RSS" to fetch new stories.</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════ EPISODES TAB ════════════ */}
        {activeTab === 'episodes' && (
          <div className="space-y-6">
            {/* Episode Actions Bar */}
            <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white">Generate Today's Episode</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Requires ≥3 AI-analyzed articles. Generates script + audio via Google Gemini.
                </p>
              </div>
              <button
                onClick={handleGenerateEpisode}
                disabled={isGeneratingEpisode || !isDbConnected || completedCount < 3}
                className={`px-5 py-3 rounded-xl text-sm font-semibold transition flex items-center space-x-2 shadow-lg ${
                  isGeneratingEpisode || !isDbConnected || completedCount < 3
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20'
                }`}
              >
                {isGeneratingEpisode ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span><span>Generating episode... (~30s)</span></>
                ) : completedCount < 3 ? (
                  <span>🔒 Need ≥3 AI-analyzed articles (have {completedCount})</span>
                ) : (
                  <span>🎙️ Generate Today's Episode</span>
                )}
              </button>
            </div>

            {/* AI Disclaimer */}
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/20 text-xs text-amber-200 flex items-start space-x-3">
              <span className="text-lg mt-0.5">⚠️</span>
              <span>
                <strong className="text-amber-300">Editorial Disclaimer:</strong> All episode scripts and audio are generated by AI (Google Gemini).
                Summaries and commentary reflect automated analysis and <strong>have not been reviewed by a human editor</strong>.
                Always verify facts against the linked original sources before sharing.
              </span>
            </div>

            {/* Selected Episode Player */}
            {selectedEpisode && (
              <div className="bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border mb-2 ${episodeStatusBadge(selectedEpisode.status)}`}>
                      {selectedEpisode.status === 'audio_ready' ? '🎧 Ready to Play' : selectedEpisode.status}
                    </div>
                    <h3 className="text-xl font-bold text-white">{selectedEpisode.title}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(selectedEpisode.episode_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      {selectedEpisode.duration_seconds && ` · ~${Math.round(selectedEpisode.duration_seconds / 60)} min`}
                    </p>
                  </div>
                  <button onClick={() => setSelectedEpisode(null)} className="text-slate-500 hover:text-white text-lg">✕</button>
                </div>

                {/* Audio Player */}
                {selectedEpisode.status === 'audio_ready' && selectedEpisode.audio_url && (
                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                    <p className="text-xs text-slate-400 mb-2 font-medium">🎵 Episode Audio</p>
                    <audio
                      ref={audioRef}
                      controls
                      className="w-full"
                      src={`${apiUrl}${selectedEpisode.audio_url}`}
                    >
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}

                {/* Source Articles */}
                {selectedEpisode.articles && selectedEpisode.articles.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-3">📎 Stories in This Episode</h4>
                    <div className="space-y-2">
                      {selectedEpisode.articles.map((a, i) => (
                        <div key={a.id} className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded-lg px-4 py-2.5 text-xs">
                          <div className="flex items-center space-x-3">
                            <span className="text-slate-500 font-mono w-4">{i + 1}.</span>
                            <div>
                              <span className="text-slate-200 font-medium line-clamp-1">{a.title}</span>
                              <div className="flex items-center space-x-2 mt-0.5">
                                <span className="text-slate-500">{a.source_name}</span>
                                {a.importance_score && <span className="text-cyan-400">⭐ {a.importance_score}</span>}
                              </div>
                            </div>
                          </div>
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 ml-4 flex-shrink-0">↗</a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transcript Toggle */}
                {selectedEpisode.script && (
                  <div>
                    <button
                      onClick={() => setShowTranscript(!showTranscript)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center space-x-1"
                    >
                      <span>{showTranscript ? '▲ Hide Transcript' : '▼ Show Full Transcript'}</span>
                    </button>
                    {showTranscript && (
                      <div className="mt-3 bg-slate-950/80 border border-slate-800/60 rounded-xl p-5 max-h-96 overflow-y-auto">
                        <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">📄 Episode Transcript</p>
                        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">{selectedEpisode.script}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Episode List */}
            {loadingEpisodes ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-slate-400">Loading episodes...</p>
              </div>
            ) : episodes.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">All Episodes</h3>
                {episodes.map(ep => (
                  <div
                    key={ep.id}
                    onClick={() => fetchEpisodeDetail(ep.id)}
                    className={`bg-slate-900/60 border rounded-xl p-4 cursor-pointer hover:border-slate-700 transition flex items-center justify-between gap-4 ${selectedEpisode?.id === ep.id ? 'border-cyan-500/40' : 'border-slate-800/80'}`}
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-white">{ep.title}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(ep.episode_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        {ep.duration_seconds && ` · ~${Math.round(ep.duration_seconds / 60)} min`}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${episodeStatusBadge(ep.status)}`}>
                        {ep.status === 'audio_ready' ? '🎧 Ready' : ep.status}
                      </span>
                      {ep.status === 'audio_ready' && <span className="text-slate-400 text-xs">▶ Play</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : !isGeneratingEpisode && (
              <div className="text-center py-16 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 space-y-4">
                <div className="text-4xl">🎙️</div>
                <h3 className="text-base font-bold text-white">No Episodes Yet</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Make sure you have at least 3 AI-analyzed articles, then click "Generate Today's Episode" above!
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/80 py-6 text-center space-y-1">
        <p className="text-xs text-slate-500">Tech Innovation News Show · Phase 4: Episode Generation & Audio Player</p>
        <p className="text-[11px] text-slate-600">🤖 AI-generated content. Not editorially reviewed. Verify facts with original sources.</p>
      </footer>
    </div>
  );
}
