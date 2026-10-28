import { useState, useEffect, useRef } from 'react';
import { decodeHtmlEntities, formatRelativeTime } from './utils/textUtils.js';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking');
  const [backendData, setBackendData] = useState(null);

  // Tab navigation: 'articles' | 'episodes' | 'analytics'
  const [activeTab, setActiveTab] = useState('articles');

  // Reader Mode state (improves article typography, line-height, and minimizes technical chrome)
  const [readerMode, setReaderMode] = useState(false);

  // Articles state
  const [articles, setArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [expandedArticles, setExpandedArticles] = useState({});

  // Episodes state
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [isGeneratingEpisode, setIsGeneratingEpisode] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioError, setAudioError] = useState(null);
  
  // Custom audio player state
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // RAG Q&A state
  const [askQuestion, setAskQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState(null);
  const [askError, setAskError] = useState(null);

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Operator Mode State (Phase 1 Security: stored strictly in sessionStorage)
  const [operatorKey, setOperatorKey] = useState(() => {
    try {
      return sessionStorage.getItem('tech_news_operator_key') || '';
    } catch {
      return '';
    }
  });
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  // Shared Filters & Notifications
  const [notification, setNotification] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'completed' | 'pending'
  const [sortBy, setSortBy] = useState('latest'); // 'latest' | 'importance'

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // ── Operator Auth Helpers ───────────────────────────────────────────────────
  const getOperatorHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (operatorKey) {
      headers['X-Operator-Key'] = operatorKey;
    }
    return headers;
  };

  const handleSaveOperatorKey = (newKey) => {
    const trimmed = (newKey || '').trim();
    try {
      if (trimmed) {
        sessionStorage.setItem('tech_news_operator_key', trimmed);
      } else {
        sessionStorage.removeItem('tech_news_operator_key');
      }
    } catch (e) {
      console.warn('sessionStorage is not accessible:', e);
    }
    setOperatorKey(trimmed);
    setKeyInput('');
    setShowKeyModal(false);
    if (trimmed) {
      showNotification('success', 'Operator key saved for this browser session. Privileged actions unlocked.');
    } else {
      showNotification('info', 'Operator key cleared. Reverted to standard Reader Mode.');
    }
  };

  // ── Health Check ────────────────────────────────────────────────────────────
  const checkBackend = async () => {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setBackendData(data);
      setBackendStatus('connected');
    } catch {
      setBackendStatus('disconnected');
    }
  };

  // ── Fetch Articles ──────────────────────────────────────────────────────────
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

  // ── Fetch Episodes ──────────────────────────────────────────────────────────
  const fetchEpisodes = async () => {
    setLoadingEpisodes(true);
    try {
      const response = await fetch(`${apiUrl}/api/episodes`);
      if (response.ok) {
        const data = await response.json();
        const eps = data.episodes || [];
        setEpisodes(eps);
        if (!selectedEpisode && eps.length > 0) {
          fetchEpisodeDetail(eps[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch episodes:', err);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  // ── Fetch Platform Analytics ────────────────────────────────────────────────
  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const response = await fetch(`${apiUrl}/api/analytics`);
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // ── Fetch Episode Detail ────────────────────────────────────────────────────
  const fetchEpisodeDetail = async (id) => {
    try {
      const response = await fetch(`${apiUrl}/api/episodes/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedEpisode(data.episode);
        setShowTranscript(false);
        setAudioError(null);
        setIsPlaying(false);
        setCurrentTime(0);
        setAskQuestion('');
        setAskAnswer(null);
        setAskError(null);
      }
    } catch (err) {
      console.error('Failed to fetch episode detail:', err);
    }
  };

  // ── Ingest RSS (Protected Operator Route) ──────────────────────────────────
  const handleIngestNews = async () => {
    if (!operatorKey) {
      setShowKeyModal(true);
      showNotification('info', 'Operator Authentication Required: Enter your key to ingest fresh RSS headlines.');
      return;
    }
    setIsIngesting(true);
    try {
      const response = await fetch(`${apiUrl}/api/articles/ingest`, {
        method: 'POST',
        headers: getOperatorHeaders()
      });
      const data = await response.json();
      if (response.status === 401) {
        showNotification('error', `Authentication Failed (401): ${data.message || 'Invalid operator key.'}`);
        setShowKeyModal(true);
        return;
      }
      if (response.status === 429) {
        showNotification('error', `Rate Limit Exceeded (429): ${data.message}`);
        return;
      }
      if (data.stats) {
        showNotification('success', `Ingestion Complete: Added ${data.stats.articlesInserted} new stories, skipped ${data.stats.duplicatesSkipped} duplicates.`);
        await fetchArticles();
      } else {
        showNotification('info', data.message || 'Ingestion completed');
        await fetchArticles();
      }
    } catch (err) {
      showNotification('error', `Ingestion failed: ${err.message}`);
    } finally {
      setIsIngesting(false);
    }
  };

  // ── AI Processing (Protected Operator Route) ────────────────────────────────
  const handleProcessAI = async () => {
    if (!operatorKey) {
      setShowKeyModal(true);
      showNotification('info', 'Operator Authentication Required: Enter your key to run Gemini editorial analysis.');
      return;
    }
    setIsProcessingAI(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${apiUrl}/api/articles/process?limit=3`, {
        method: 'POST',
        headers: getOperatorHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (response.status === 401) {
        showNotification('error', `Authentication Failed (401): ${data.message || 'Invalid operator key.'}`);
        setShowKeyModal(true);
        return;
      }
      if (response.status === 429) {
        showNotification('error', `Rate Limit Exceeded (429): ${data.message}`);
        return;
      }
      if (data.stats) {
        showNotification('success', `AI Analysis Batch Complete: Successfully analyzed ${data.stats.succeeded} stories (${data.stats.failed} failed).`);
        await fetchArticles();
      } else if (data.message) {
        showNotification('info', data.message);
        await fetchArticles();
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        showNotification('info', 'AI analysis is processing in the background. Refresh in a few seconds to see updated scores.');
      } else {
        showNotification('error', `AI Processing failed: ${err.message}`);
      }
      await fetchArticles();
    } finally {
      clearTimeout(timeoutId);
      setIsProcessingAI(false);
    }
  };

  // ── Generate Episode (Protected Operator Route) ─────────────────────────────
  const handleGenerateEpisode = async () => {
    if (!operatorKey) {
      setShowKeyModal(true);
      showNotification('info', 'Operator Authentication Required: Enter your key to generate a daily broadcast.');
      return;
    }
    setIsGeneratingEpisode(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 95000);
    try {
      const response = await fetch(`${apiUrl}/api/episodes/generate`, {
        method: 'POST',
        headers: getOperatorHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (response.status === 401) {
        showNotification('error', `Authentication Failed (401): ${data.message || 'Invalid operator key.'}`);
        setShowKeyModal(true);
        return;
      }
      if (response.status === 429) {
        showNotification('error', `Rate Limit Exceeded (429): ${data.message}`);
        return;
      }
      if (data.outcome === 'already_exists' || data.cached) {
        showNotification('info', `Today's episode already exists: "${data.episode?.title || 'Daily Episode'}". Playback loaded.`);
        await fetchEpisodes();
        if (data.episode?.id) await fetchEpisodeDetail(data.episode.id);
      } else if (data.outcome === 'in_progress' || response.status === 409) {
        showNotification('info', data.message || 'Episode generation is currently in progress. Please wait a moment.');
      } else if (data.outcome === 'skipped_insufficient_articles' || data.skipped) {
        showNotification('warning', `Episode Generation Skipped: ${data.message || 'Fewer than 3 eligible stories available.'}`);
      } else if (data.episode?.status === 'audio_ready' || data.episode?.status === 'completed') {
        showNotification('success', `Broadcast Generated! "${data.episode.title}" is ready to play.`);
        await fetchEpisodes();
        await fetchEpisodeDetail(data.episode.id);
      } else if (data.episode?.status === 'failed') {
        showNotification('error', `Generation failed: ${data.episode.error_message || data.error}`);
      } else if (data.episode) {
        showNotification('info', `Episode status: ${data.episode.status}. ${data.message || ''}`);
        await fetchEpisodes();
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        showNotification('info', 'Episode generation is completing in the background. Refresh in a few seconds.');
      } else {
        showNotification('error', `Episode generation failed: ${err.message}`);
      }
    } finally {
      clearTimeout(timeoutId);
      setIsGeneratingEpisode(false);
    }
  };

  // ── Ask This Episode (Public Rate-Limited RAG Q&A) ───────────────────────────
  const handleAskEpisode = async (customQ) => {
    const q = (typeof customQ === 'string' ? customQ : askQuestion).trim();
    if (!q || !selectedEpisode) return;
    setAskQuestion(q);
    setAskLoading(true);
    setAskError(null);
    setAskAnswer(null);

    try {
      const response = await fetch(`${apiUrl}/api/episodes/${selectedEpisode.id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
      const data = await response.json();
      if (response.status === 429) {
        throw new Error(data.message || 'Rate limit exceeded: Please wait 1 minute before asking another question.');
      }
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to retrieve answer');
      }
      setAskAnswer(data);
    } catch (err) {
      setAskError(err.message);
    } finally {
      setAskLoading(false);
    }
  };

  // ── Retry Single Article (Protected Operator Route) ─────────────────────────
  const handleRetryArticle = async (id) => {
    if (!operatorKey) {
      setShowKeyModal(true);
      showNotification('info', 'Operator Authentication Required: Enter your key to retry article processing.');
      return;
    }
    try {
      const response = await fetch(`${apiUrl}/api/articles/${id}/retry`, {
        method: 'POST',
        headers: getOperatorHeaders()
      });
      const data = await response.json();
      if (response.status === 401) {
        showNotification('error', `Authentication Failed (401): ${data.message || 'Invalid operator key.'}`);
        setShowKeyModal(true);
        return;
      }
      if (response.status === 429) {
        showNotification('error', `Rate Limit Exceeded (429): ${data.message}`);
        return;
      }
      if (response.ok) {
        showNotification('success', `Story #${id} reprocessed successfully!`);
        await fetchArticles();
      } else {
        showNotification('error', data.message || data.error || 'Retry failed');
      }
    } catch (err) {
      showNotification('error', `Retry failed: ${err.message}`);
    }
  };

  function showNotification(type, message) {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 7000);
  }

  // ── Audio Player Event Handlers ─────────────────────────────────────────────
  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((e) => {
        setAudioError(`Audio playback error: ${e.message}`);
        setIsPlaying(false);
      });
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const changePlaybackSpeed = (speed) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMuted = !isMuted;
    audioRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const formatAudioTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Initial Data Fetching ───────────────────────────────────────────────────
  useEffect(() => { checkBackend(); }, [apiUrl]);
  useEffect(() => { fetchArticles(); }, [apiUrl, activeFilter, sortBy]);
  useEffect(() => {
    if (activeTab === 'episodes') fetchEpisodes();
    if (activeTab === 'analytics') fetchAnalytics();
  }, [activeTab]);

  const isDbConnected = backendData?.database === 'connected';
  const isAiConfigured = backendData?.ai?.includes('configured');
  const completedCount = articles.filter(a => a.processing_status === 'completed').length;
  const pendingCount = articles.filter(
    a => a.processing_status === 'pending' || a.processing_status === 'failed'
  ).length;

  // Category Theme Badges
  const getCategoryBadgeStyle = (categoryName) => {
    const raw = (categoryName || '').toLowerCase();
    if (raw.includes('ai') || raw.includes('machine learning')) {
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    }
    if (raw.includes('cloud') || raw.includes('software')) {
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
    if (raw.includes('hardware') || raw.includes('device') || raw.includes('chip')) {
      return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    }
    if (raw.includes('security') || raw.includes('cyber')) {
      return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
    if (raw.includes('startup') || raw.includes('venture')) {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    }
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  };

  // Importance Score Color & Label
  const getImportanceDisplay = (score) => {
    const s = Number(score) || 0;
    if (s >= 80) return { label: 'Breakthrough', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' };
    if (s >= 65) return { label: 'High Impact', badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' };
    if (s >= 50) return { label: 'Notable', badge: 'bg-blue-500/15 text-blue-300 border-blue-500/40' };
    return { label: 'Routine', badge: 'bg-slate-800 text-slate-400 border-slate-700' };
  };

  // Episode Status Badge
  const episodeStatusBadge = (status) => {
    const map = {
      audio_ready: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      script_ready: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      draft: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      failed: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
    return map[status] || 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const resolvedAudioSrc = selectedEpisode?.audio_url
    ? (selectedEpisode.audio_url.startsWith('http') ? selectedEpisode.audio_url : `${apiUrl}${selectedEpisode.audio_url}`)
    : null;

  return (
    <div className={`min-h-screen bg-[#080D1B] text-[#F8FAFC] flex flex-col justify-between selection:bg-cyan-500 selection:text-slate-950 ${readerMode ? 'font-serif' : 'font-sans'}`}>

      {/* ── Top Header ── */}
      <header className="border-b border-[#263247] bg-[#10182A]/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3.5 transition-colors">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600 flex items-center justify-center font-extrabold text-white shadow-lg shadow-cyan-500/20 text-sm tracking-tight border border-cyan-400/30">
              TN
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#F8FAFC]">Tech Innovation News Show</h1>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                  AI Broadcast
                </span>
              </div>
              <p className="text-xs text-[#94A3B8]">Your daily briefing on what's next in tech.</p>
            </div>
          </div>

          {/* Service Indicators & Modes */}
          <div className="flex items-center flex-wrap gap-2 text-xs">
            
            {/* API Status */}
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#151F32] border border-[#263247]" title="Backend API Health">
              <span className="text-[#94A3B8] mr-1.5 font-medium">API:</span>
              {backendStatus === 'connected' ? (
                <span className="text-emerald-400 font-semibold flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse"></span>Online
                </span>
              ) : (
                <span className="text-rose-400 font-semibold flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1"></span>Offline
                </span>
              )}
            </div>

            {/* DB Status */}
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#151F32] border border-[#263247]" title="Neon PostgreSQL Database">
              <span className="text-[#94A3B8] mr-1.5 font-medium">DB:</span>
              {isDbConnected ? (
                <span className="text-emerald-400 font-semibold flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1"></span>Connected
                </span>
              ) : (
                <span className="text-amber-400 font-semibold">Disconnected</span>
              )}
            </div>

            {/* AI Status */}
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#151F32] border border-[#263247]" title="Google Gemini AI Engine">
              <span className="text-[#94A3B8] mr-1.5 font-medium">AI:</span>
              {isAiConfigured ? (
                <span className="text-cyan-400 font-semibold flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-1"></span>Gemini
                </span>
              ) : (
                <span className="text-amber-400 font-semibold">No Key</span>
              )}
            </div>

            {/* Reader Mode Toggle (Genuine, accessible reading toggle) */}
            <button
              onClick={() => {
                const nextMode = !readerMode;
                setReaderMode(nextMode);
                showNotification('info', nextMode ? '📖 Reader Mode Active: Distraction-free editorial view with spacious typography.' : 'Standard View Restored.');
              }}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border transition ${
                readerMode
                  ? 'bg-cyan-950/80 border-cyan-400/50 text-cyan-300 shadow-sm shadow-cyan-500/20'
                  : 'bg-[#151F32] border-[#263247] text-[#94A3B8] hover:text-white'
              }`}
              title="Toggle Reader Mode (improves article readability and text spacing)"
            >
              <span className="mr-1">{readerMode ? '📖' : '👓'}</span>
              <span>{readerMode ? 'Reader On' : 'Reader Mode'}</span>
            </button>

            {/* Operator Auth Button */}
            <button
              onClick={() => {
                setKeyInput(operatorKey);
                setShowKeyModal(true);
              }}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border transition ${
                operatorKey
                  ? 'bg-amber-950/70 border-amber-500/40 text-amber-300 hover:bg-amber-900/60'
                  : 'bg-[#151F32] border-[#263247] text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
              title={operatorKey ? 'Operator Key active for this session. Click to manage.' : 'Reader mode active. Click to unlock Operator Controls.'}
            >
              <span className="mr-1">{operatorKey ? '🔑' : '🔒'}</span>
              <span>{operatorKey ? 'Operator Active' : 'Operator Key'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className={`mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8 ${readerMode ? 'max-w-4xl' : 'max-w-6xl'}`}>

        {/* Operator Key Modal */}
        {showKeyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080D1B]/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#10182A] border border-[#263247] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <span>🔑</span>
                    <span>Operator Authentication</span>
                  </h3>
                  <p className="text-xs text-[#94A3B8] mt-1">
                    Privileged operations (RSS ingestion, AI analysis, article retries, and broadcast generation) require an operator secret key.
                  </p>
                </div>
                <button
                  onClick={() => setShowKeyModal(false)}
                  className="text-slate-400 hover:text-white text-base font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  Operator Secret Key (X-Operator-Key)
                </label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Enter OPERATOR_API_KEY..."
                  className="w-full bg-[#080D1B] border border-[#263247] focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                />
                <p className="text-[10px] text-[#94A3B8]">
                  Stored strictly in this browser tab's <code className="text-cyan-300">sessionStorage</code>. Never hardcoded into Git or public frontend bundles.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                {operatorKey ? (
                  <button
                    type="button"
                    onClick={() => handleSaveOperatorKey('')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/60 border border-rose-500/40 text-rose-300 hover:bg-rose-900/60 transition"
                  >
                    Clear Key
                  </button>
                ) : <div />}
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowKeyModal(false)}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-[#94A3B8] hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveOperatorKey(keyInput)}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition shadow-md shadow-amber-500/20"
                  >
                    Save for Session
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notification Toast */}
        {notification && (
          <div className={`p-4 rounded-xl border text-xs flex items-center justify-between shadow-lg animate-fadeIn ${
            notification.type === 'error' ? 'bg-rose-950/80 border-rose-500/50 text-rose-200'
            : notification.type === 'warning' ? 'bg-amber-950/80 border-amber-500/50 text-amber-200'
            : notification.type === 'info' ? 'bg-[#151F32] border-cyan-500/40 text-cyan-200'
            : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
          }`}>
            <div className="flex items-center space-x-2.5">
              <span className="text-base">{notification.type === 'error' ? '⚠️' : notification.type === 'warning' ? '⚠️' : notification.type === 'info' ? 'ℹ️' : '✅'}</span>
              <span className="font-medium leading-relaxed">{notification.message}</span>
            </div>
            <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white ml-4 font-bold text-sm">✕</button>
          </div>
        )}

        {/* ── Compact Dashboard Overview (Section 6) ── */}
        {!readerMode && (
          <section className="bg-[#10182A] border border-[#263247] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Your technology briefing</h2>
                <p className="text-xs text-[#94A3B8]">Today's stories, AI insights, and the latest broadcast.</p>
              </div>
              <div className="text-[11px] text-cyan-400 font-mono bg-cyan-950/50 border border-cyan-500/30 px-3 py-1 rounded-full w-fit">
                Asia/Kolkata (IST) Active
              </div>
            </div>

            {/* 4 Interactive Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              
              {/* Card 1: Total Stories */}
              <button
                onClick={() => { setActiveTab('articles'); setActiveFilter('all'); }}
                className="bg-[#151F32] hover:bg-[#151F32]/80 border border-[#263247] rounded-xl p-4 text-left transition group space-y-1"
              >
                <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>Total Stories</span>
                  <span className="text-cyan-400 opacity-60 group-hover:opacity-100 transition">📰</span>
                </div>
                <div className="text-2xl font-bold text-white">{articles.length}</div>
                <div className="text-[11px] text-[#94A3B8]">From major tech RSS feeds</div>
              </button>

              {/* Card 2: AI Analyzed */}
              <button
                onClick={() => { setActiveTab('articles'); setActiveFilter('completed'); }}
                className="bg-[#151F32] hover:bg-[#151F32]/80 border border-[#263247] rounded-xl p-4 text-left transition group space-y-1"
              >
                <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>AI Analyzed</span>
                  <span className="text-emerald-400 opacity-60 group-hover:opacity-100 transition">✨</span>
                </div>
                <div className="text-2xl font-bold text-emerald-400">{completedCount}</div>
                <div className="text-[11px] text-emerald-400/80">
                  {articles.length > 0 ? `${Math.round((completedCount / articles.length) * 100)}% coverage` : '0%'}
                </div>
              </button>

              {/* Card 3: Pending Queue */}
              <button
                onClick={() => { setActiveTab('articles'); setActiveFilter('pending'); }}
                className="bg-[#151F32] hover:bg-[#151F32]/80 border border-[#263247] rounded-xl p-4 text-left transition group space-y-1"
              >
                <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>Pending Queue</span>
                  <span className="text-amber-400 opacity-60 group-hover:opacity-100 transition">⏳</span>
                </div>
                <div className="text-2xl font-bold text-amber-400">{pendingCount}</div>
                <div className="text-[11px] text-amber-400/80">Ready for batch analysis</div>
              </button>

              {/* Card 4: Daily Broadcasts */}
              <button
                onClick={() => setActiveTab('episodes')}
                className="bg-[#151F32] hover:bg-[#151F32]/80 border border-[#263247] rounded-xl p-4 text-left transition group space-y-1"
              >
                <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>Broadcasts</span>
                  <span className="text-blue-400 opacity-60 group-hover:opacity-100 transition">🎙️</span>
                </div>
                <div className="text-2xl font-bold text-blue-400">{episodes.length}</div>
                <div className="text-[11px] text-blue-400/80">Spoken voice audio episodes</div>
              </button>
            </div>
          </section>
        )}

        {/* ── Primary Navigation Tabs ── */}
        <nav className="flex items-center space-x-1.5 bg-[#10182A] border border-[#263247] p-1.5 rounded-2xl w-full sm:w-fit overflow-x-auto">
          <button
            onClick={() => setActiveTab('articles')}
            className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center space-x-2 flex-shrink-0 ${
              activeTab === 'articles'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#151F32]'
            }`}
          >
            <span>📰</span>
            <span>Articles Feed</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[#151F32] text-slate-300">
              {articles.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('episodes')}
            className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center space-x-2 flex-shrink-0 ${
              activeTab === 'episodes'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#151F32]'
            }`}
          >
            <span>🎙️</span>
            <span>Daily Broadcasts</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[#151F32] text-slate-300">
              {episodes.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center space-x-2 flex-shrink-0 ${
              activeTab === 'analytics'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#151F32]'
            }`}
          >
            <span>📊</span>
            <span>Platform Trends</span>
          </button>
        </nav>

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 1: ARTICLES FEED
        ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'articles' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Toolbar: Grouped Primary Actions & Filters */}
            <div className="bg-[#10182A] border border-[#263247] p-4 sm:p-5 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              
              {/* Primary Actions Group */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleProcessAI}
                  disabled={isProcessingAI || !isDbConnected || pendingCount === 0}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 shadow-sm ${
                    isProcessingAI || !isDbConnected || pendingCount === 0
                      ? 'bg-[#151F32] text-slate-500 border border-[#263247] cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold shadow-md shadow-cyan-500/20'
                  }`}
                  title={operatorKey ? 'Analyze pending stories using Gemini' : 'Requires Operator Key'}
                >
                  {isProcessingAI ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                      <span>Analyzing Stories (~5-8s)...</span>
                    </>
                  ) : pendingCount === 0 ? (
                    <span>✅ All Articles Analyzed ({completedCount})</span>
                  ) : (
                    <span>✨ Process with AI (Next 3 · {pendingCount} pending)</span>
                  )}
                </button>

                <button
                  onClick={handleIngestNews}
                  disabled={isIngesting || !isDbConnected}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#151F32] hover:bg-[#263247] text-[#F8FAFC] border border-[#263247] transition flex items-center space-x-2"
                  title={operatorKey ? 'Fetch latest RSS updates' : 'Requires Operator Key'}
                >
                  {isIngesting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></span>
                      <span>Fetching RSS Headlines...</span>
                    </>
                  ) : (
                    <>
                      <span>📥</span>
                      <span>Ingest Latest RSS</span>
                    </>
                  )}
                </button>
              </div>

              {/* Filters & Sorting Controls Group */}
              <div className="flex flex-wrap items-center gap-2.5 justify-start lg:justify-end">
                {/* Status Filter Pills */}
                <div className="bg-[#080D1B] p-1 rounded-xl border border-[#263247] flex text-xs">
                  {[
                    ['all', 'All Stories'],
                    ['completed', 'AI Analyzed'],
                    ['pending', 'Pending']
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setActiveFilter(val)}
                      className={`px-3 py-1.5 rounded-lg transition font-medium ${
                        activeFilter === val
                          ? 'bg-[#151F32] text-cyan-300 shadow-sm border border-[#263247]'
                          : 'text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Sort Order Pills */}
                <div className="bg-[#080D1B] p-1 rounded-xl border border-[#263247] flex text-xs">
                  {[
                    ['latest', '⏱️ Latest'],
                    ['importance', '⭐ Importance']
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setSortBy(val)}
                      className={`px-3 py-1.5 rounded-lg transition font-medium ${
                        sortBy === val
                          ? 'bg-[#151F32] text-cyan-300 shadow-sm border border-[#263247]'
                          : 'text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Articles Feed List */}
            {loadingArticles ? (
              <div className="py-24 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-[#94A3B8]">Loading technology articles from database...</p>
              </div>
            ) : articles.length > 0 ? (
              <div className="space-y-4">
                {articles.map((article) => {
                  const isCompleted = article.processing_status === 'completed';
                  const isFailed = article.processing_status === 'failed';
                  const keyPoints = Array.isArray(article.ai_key_points) ? article.ai_key_points : [];
                  const isExpanded = !!expandedArticles[article.id];
                  const importanceInfo = getImportanceDisplay(article.importance_score);

                  // HTML Entity Decoded Clean Content
                  const cleanTitle = decodeHtmlEntities(article.title);
                  const cleanSummary = decodeHtmlEntities(article.ai_summary || article.summary || '');
                  const cleanReason = decodeHtmlEntities(article.importance_reason || '');

                  return (
                    <article
                      key={article.id}
                      className={`bg-[#10182A] border border-[#263247] rounded-2xl p-5 sm:p-6 hover:border-slate-600/80 transition-all shadow-sm space-y-3.5 ${
                        readerMode ? 'text-base leading-relaxed' : ''
                      }`}
                    >
                      {/* Top Metadata: Publisher, Category, Importance */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-[#151F32] text-[#F8FAFC] border border-[#263247] font-semibold text-[11px]">
                            {article.source_name || 'Tech News'}
                          </span>
                          {article.ai_category && (
                            <span className={`px-2.5 py-0.5 rounded-full border font-medium text-[11px] ${getCategoryBadgeStyle(article.ai_category)}`}>
                              {article.ai_category}
                            </span>
                          )}
                        </div>

                        {/* Status / Score Badges */}
                        <div className="flex items-center space-x-2">
                          {isCompleted && article.importance_score && (
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center space-x-1 ${importanceInfo.badge}`}>
                              <span>⭐ {article.importance_score}/100</span>
                              <span className="hidden sm:inline-block font-normal text-[10px] opacity-80">({importanceInfo.label})</span>
                            </span>
                          )}
                          {!isCompleted && !isFailed && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-medium">
                              ⏳ Pending Analysis
                            </span>
                          )}
                          {isFailed && (
                            <div className="flex items-center space-x-2">
                              <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30 text-xs font-medium">
                                ⚠️ Analysis Failed
                              </span>
                              <button
                                onClick={() => handleRetryArticle(article.id)}
                                className="px-2.5 py-0.5 rounded bg-[#151F32] hover:bg-[#263247] text-slate-200 border border-[#263247] text-xs font-medium transition"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Main Headline (Prominent, Scannable) */}
                      <h3 className="text-lg sm:text-xl font-bold text-[#F8FAFC] leading-snug tracking-tight">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-cyan-400 transition"
                        >
                          {cleanTitle}
                        </a>
                      </h3>

                      {/* AI Structured Editorial Box */}
                      {isCompleted && (
                        <div className="bg-[#080D1B]/90 border border-[#263247] rounded-xl p-4 space-y-3">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 mb-1 flex items-center space-x-1.5">
                              <span>🤖</span>
                              <span>AI Editorial Summary</span>
                            </div>
                            <p className="text-sm text-slate-200 leading-relaxed">
                              {cleanSummary}
                            </p>
                          </div>

                          {/* Key Takeaways */}
                          {keyPoints.length > 0 && (
                            <div className="pt-2.5 border-t border-[#263247]">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                                Key Takeaways
                              </div>
                              <ul className="space-y-1.5 text-xs text-slate-300">
                                {keyPoints.map((pt, i) => (
                                  <li key={i} className="flex items-start space-x-2">
                                    <span className="text-cyan-400 font-bold mt-0.5">•</span>
                                    <span>{decodeHtmlEntities(pt)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Editorial Rationale */}
                          {cleanReason && (
                            <div className="pt-2.5 border-t border-[#263247] text-xs text-[#94A3B8]">
                              <span className="font-semibold text-slate-300">Scoring Rationale: </span>
                              <span className="italic">"{cleanReason}"</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fallback Raw RSS Summary for Pending Articles */}
                      {!isCompleted && cleanSummary && (
                        <div className="text-xs text-[#94A3B8] leading-relaxed">
                          <p className={isExpanded ? '' : 'line-clamp-3'}>
                            {cleanSummary}
                          </p>
                          {cleanSummary.length > 180 && (
                            <button
                              onClick={() => setExpandedArticles(prev => ({ ...prev, [article.id]: !prev[article.id] }))}
                              className="text-cyan-400 hover:text-cyan-300 text-[11px] font-medium pt-1 block"
                            >
                              {isExpanded ? 'Show less' : 'Read more...'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Error Diagnostic if Failed */}
                      {isFailed && article.processing_error && (
                        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300">
                          <strong>Failure Reason:</strong> {article.processing_error}
                        </div>
                      )}

                      {/* Card Footer: Timestamp, Author & Outbound Link */}
                      <div className="pt-2 border-t border-[#263247] flex flex-wrap items-center justify-between text-xs text-[#94A3B8] gap-2">
                        <div className="flex items-center space-x-2">
                          <span>{formatRelativeTime(article.published_at)}</span>
                          {article.author && <span>· By {article.author}</span>}
                        </div>
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1"
                        >
                          <span>Original Source</span>
                          <span>↗</span>
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-20 bg-[#10182A] border border-[#263247] rounded-2xl p-8 space-y-3">
                <div className="text-4xl">📭</div>
                <h3 className="text-base font-bold text-white">No Articles Found</h3>
                <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                  Adjust your filter or click "Ingest Latest RSS" above to fetch the latest headlines.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 2: DAILY BROADCASTS (EPISODES) & RAG ENGINE
        ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'episodes' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Episode Generation Action Banner */}
            <div className="bg-[#10182A] border border-[#263247] p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>🎙️</span>
                  <span>Daily Radio Broadcast Pipeline</span>
                </h3>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Synthesizes daily broadcast script and voice audio from top-scoring tech news via Google Gemini.
                </p>
              </div>
              <button
                onClick={handleGenerateEpisode}
                disabled={isGeneratingEpisode || !isDbConnected || completedCount < 3}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 flex-shrink-0 ${
                  isGeneratingEpisode || !isDbConnected || completedCount < 3
                    ? 'bg-[#151F32] text-slate-500 border border-[#263247] cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold shadow-md shadow-cyan-500/20'
                }`}
                title={operatorKey ? 'Generate daily episode' : 'Requires Operator Key'}
              >
                {isGeneratingEpisode ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                    <span>Synthesizing Voice Audio (~20-30s)...</span>
                  </>
                ) : (
                  <span>⚡ Generate Today's Broadcast</span>
                )}
              </button>
            </div>

            {/* Featured Active Episode View */}
            {selectedEpisode ? (
              <div className="bg-[#10182A] border border-[#263247] rounded-2xl p-6 space-y-6 shadow-sm">
                
                {/* Header Information */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${episodeStatusBadge(selectedEpisode.status)}`}>
                        {selectedEpisode.status === 'audio_ready' ? '🎧 Ready to Stream' : selectedEpisode.status}
                      </span>
                      <span className="text-xs text-[#94A3B8]">
                        Broadcast Date: {selectedEpisode.episode_date}
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      {selectedEpisode.title}
                    </h3>
                  </div>
                  
                  {selectedEpisode.duration_seconds && (
                    <div className="px-3 py-1 rounded-xl bg-[#151F32] border border-[#263247] text-xs font-mono text-cyan-300">
                      Duration: ~{Math.round(selectedEpisode.duration_seconds / 60)} min ({selectedEpisode.duration_seconds}s)
                    </div>
                  )}
                </div>

                {/* ── Polished HTML5 Range Audio Player ── */}
                {selectedEpisode.status === 'audio_ready' && resolvedAudioSrc && (
                  <div className="bg-[#080D1B] rounded-2xl p-5 border border-[#263247] space-y-4">
                    
                    {/* Hidden Native Audio Element */}
                    <audio
                      ref={audioRef}
                      src={resolvedAudioSrc}
                      preload="metadata"
                      onTimeUpdate={() => {
                        if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
                      }}
                      onLoadedMetadata={() => {
                        if (audioRef.current) setDuration(audioRef.current.duration || selectedEpisode.duration_seconds || 0);
                      }}
                      onEnded={() => setIsPlaying(false)}
                      onError={() => {
                        setAudioError('Audio playback failed. Please check network connection or verify audio storage.');
                        setIsPlaying(false);
                      }}
                    />

                    {/* Progress Slider */}
                    <div className="space-y-1.5">
                      <input
                        type="range"
                        min="0"
                        max={duration || selectedEpisode.duration_seconds || 100}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1.5 bg-[#263247] rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
                      />
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#94A3B8]">
                        <span>{formatAudioTime(currentTime)}</span>
                        <span>{formatAudioTime(duration || selectedEpisode.duration_seconds || 0)}</span>
                      </div>
                    </div>

                    {/* Audio Player Controls */}
                    <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={togglePlayPause}
                          className="h-10 w-10 rounded-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold flex items-center justify-center transition shadow-md shadow-cyan-500/20"
                          title={isPlaying ? 'Pause' : 'Play'}
                        >
                          {isPlaying ? '⏸' : '▶'}
                        </button>

                        <button
                          onClick={toggleMute}
                          className="p-2 rounded-lg bg-[#151F32] hover:bg-[#263247] text-[#94A3B8] hover:text-white border border-[#263247] text-xs"
                          title={isMuted ? 'Unmute' : 'Mute'}
                        >
                          {isMuted ? '🔇' : '🔊'}
                        </button>
                      </div>

                      {/* Playback Speed Selectors */}
                      <div className="flex items-center space-x-1 text-xs">
                        <span className="text-[11px] text-[#94A3B8] mr-1.5">Speed:</span>
                        {[1, 1.25, 1.5].map((speed) => (
                          <button
                            key={speed}
                            onClick={() => changePlaybackSpeed(speed)}
                            className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                              playbackSpeed === speed
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                : 'bg-[#151F32] text-[#94A3B8] border border-[#263247] hover:text-white'
                            }`}
                          >
                            {speed}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Audio Error Alert */}
                    {audioError && (
                      <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300">
                        ⚠️ {audioError}
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsible Transcript Viewer */}
                {selectedEpisode.script && (
                  <div className="pt-2 border-t border-[#263247]">
                    <button
                      onClick={() => setShowTranscript(!showTranscript)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1.5 py-1"
                    >
                      <span>{showTranscript ? '▲ Collapse Radio Broadcast Script' : '▼ Read Full Broadcast Script & Radio Copy'}</span>
                    </button>
                    {showTranscript && (
                      <div className="mt-3 bg-[#080D1B] border border-[#263247] rounded-xl p-5 max-h-96 overflow-y-auto space-y-2">
                        <p className="text-[11px] text-[#94A3B8] font-bold uppercase tracking-wider">
                          📻 Radio Host Transcript
                        </p>
                        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-mono">
                          {selectedEpisode.script}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Featured Stories in this Episode */}
                {selectedEpisode.articles && selectedEpisode.articles.length > 0 && (
                  <div className="pt-4 border-t border-[#263247] space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                      Stories Covered in this Broadcast ({selectedEpisode.articles.length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedEpisode.articles.map((art, idx) => (
                        <div key={art.id || idx} className="bg-[#080D1B] border border-[#263247] rounded-xl p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-cyan-400">Story #{art.story_order || idx + 1}</span>
                            <span className="text-[#94A3B8]">{art.source_name}</span>
                          </div>
                          <div className="text-xs font-bold text-white line-clamp-2">
                            {decodeHtmlEntities(art.title)}
                          </div>
                          <a
                            href={art.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-cyan-400 hover:text-cyan-300 inline-block font-medium pt-1"
                          >
                            Read story source ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── "Ask This Episode" Grounded RAG Interface (Section 9) ── */}
                <div className="pt-6 border-t border-[#263247] space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">💬</span>
                      <h4 className="text-sm font-bold text-white">Ask This Episode</h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                        RAG Grounded
                      </span>
                    </div>
                    <span className="text-[11px] text-[#94A3B8]">Strict pgvector Cosine Search</span>
                  </div>

                  <p className="text-xs text-[#94A3B8] leading-relaxed">
                    Ask questions specifically about today's broadcast. Answers are synthesized exclusively from this episode's transcript and verified source articles.
                  </p>

                  {/* Sample Prompt Pills */}
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="text-slate-500 py-1">Try:</span>
                    {[
                      'What are the key headlines in this show?',
                      'What sources were cited in this broadcast?',
                      'Explain the details of the hardware story.'
                    ].map((pill, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleAskEpisode(pill)}
                        disabled={askLoading}
                        className="px-2.5 py-1 rounded-lg bg-[#151F32] hover:bg-[#263247] text-slate-300 border border-[#263247] transition text-[11px]"
                      >
                        "{pill}"
                      </button>
                    ))}
                  </div>

                  {/* Question Input Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAskEpisode();
                    }}
                    className="flex flex-col sm:flex-row gap-2"
                  >
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={askQuestion}
                        onChange={(e) => setAskQuestion(e.target.value.slice(0, 250))}
                        placeholder="Ask a question about this episode's stories..."
                        disabled={askLoading}
                        className="w-full bg-[#080D1B] border border-[#263247] focus:border-cyan-400 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition pr-16"
                      />
                      <span className="absolute right-3 top-3 text-[10px] text-slate-500">
                        {askQuestion.length}/250
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={askLoading || !askQuestion.trim()}
                      className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 flex-shrink-0 ${
                        askLoading || !askQuestion.trim()
                          ? 'bg-[#151F32] text-slate-500 border border-[#263247] cursor-not-allowed'
                          : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold shadow-md shadow-cyan-500/20'
                      }`}
                    >
                      {askLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                          <span>Searching Chunks...</span>
                        </>
                      ) : (
                        <span>Ask AI ↵</span>
                      )}
                    </button>
                  </form>

                  {/* Error Notification */}
                  {askError && (
                    <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300">
                      ⚠️ {askError}
                    </div>
                  )}

                  {/* Grounded / Refusal Answer Card */}
                  {askAnswer && (
                    <div className={`border rounded-xl p-4 sm:p-5 space-y-3 animate-fadeIn ${
                      askAnswer.grounded
                        ? 'bg-[#080D1B] border-cyan-500/40'
                        : 'bg-[#080D1B] border-amber-500/40'
                    }`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-bold flex items-center space-x-1.5 ${
                          askAnswer.grounded ? 'text-cyan-400' : 'text-amber-400'
                        }`}>
                          <span>{askAnswer.grounded ? '✨ Grounded Answer' : '⚠️ Refusal — Safe Anti-Hallucination Gate'}</span>
                        </span>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          askAnswer.grounded && askAnswer.confidence === 'high'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {askAnswer.grounded ? (askAnswer.confidence === 'high' ? 'High Confidence' : 'Moderate Match') : 'Out of Scope'}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {askAnswer.answer}
                      </p>

                      {/* Supporting Citations */}
                      {askAnswer.citations && askAnswer.citations.length > 0 && (
                        <div className="pt-3 border-t border-[#263247]">
                          <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider font-semibold mb-2">
                            📌 Verified Primary Sources:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {askAnswer.citations.map((cite, i) => (
                              <a
                                key={i}
                                href={cite.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-[#151F32] border border-[#263247] hover:border-cyan-400/50 text-xs text-cyan-300 transition"
                              >
                                <span className="line-clamp-1 max-w-[220px]">{decodeHtmlEntities(cite.title)}</span>
                                <span>↗</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Past Episodes Archive */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider">
                Broadcast Archive ({episodes.length})
              </h3>
              {loadingEpisodes ? (
                <div className="py-12 text-center text-xs text-[#94A3B8]">Loading broadcasts...</div>
              ) : episodes.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {episodes.map((ep) => (
                    <button
                      key={ep.id}
                      onClick={() => fetchEpisodeDetail(ep.id)}
                      className={`text-left p-4 rounded-xl border transition space-y-2 ${
                        selectedEpisode?.id === ep.id
                          ? 'bg-[#151F32] border-cyan-400/50 shadow-sm'
                          : 'bg-[#10182A] border-[#263247] hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-cyan-400 font-mono">{ep.episode_date}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${episodeStatusBadge(ep.status)}`}>
                          {ep.status === 'audio_ready' ? '🎧 Audio' : ep.status}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white line-clamp-2">
                        {ep.title}
                      </h4>
                      {ep.duration_seconds && (
                        <p className="text-[11px] text-[#94A3B8]">
                          Duration: ~{Math.round(ep.duration_seconds / 60)} min
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-[#10182A] border border-[#263247] rounded-2xl p-6">
                  <p className="text-xs text-[#94A3B8]">No broadcast episodes generated yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 3: PLATFORM TRENDS (ANALYTICS)
        ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'analytics' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Header with Refresh Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#10182A] border border-[#263247] p-5 rounded-2xl">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-white">Platform & Editorial Intelligence</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                    Live from Neon PostgreSQL
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Real-time aggregation of news ingestion volumes, Gemini analysis coverage, canonical categories, and importance scores.
                </p>
              </div>
              <button
                onClick={fetchAnalytics}
                disabled={loadingAnalytics}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#151F32] hover:bg-[#263247] text-white border border-[#263247] flex items-center space-x-2 transition flex-shrink-0"
              >
                <span>{loadingAnalytics ? 'Refreshing...' : '🔄 Refresh Metrics'}</span>
              </button>
            </div>

            {loadingAnalytics && !analyticsData ? (
              <div className="py-24 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-[#94A3B8]">Aggregating platform intelligence from PostgreSQL...</p>
              </div>
            ) : analyticsData ? (
              <div className="space-y-8">
                
                {/* 4 Top KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  
                  {/* KPI 1 */}
                  <div className="bg-[#10182A] border border-[#263247] rounded-2xl p-5 space-y-2">
                    <span className="text-xs text-[#94A3B8] font-medium">Stories Ingested</span>
                    <div className="text-3xl font-extrabold text-white">
                      {analyticsData.kpis.totalArticles}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] flex items-center space-x-1.5 pt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                      <span>{analyticsData.kpis.pendingArticles} pending Gemini processing</span>
                    </div>
                  </div>

                  {/* KPI 2 */}
                  <div className="bg-[#10182A] border border-[#263247] rounded-2xl p-5 space-y-2">
                    <span className="text-xs text-[#94A3B8] font-medium">AI Analysis Coverage</span>
                    <div className="text-3xl font-extrabold text-cyan-400">
                      {analyticsData.kpis.analysisRate}%
                    </div>
                    <div className="text-[11px] text-[#94A3B8] flex items-center space-x-1.5 pt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>{analyticsData.kpis.analyzedArticles} verified stories</span>
                    </div>
                  </div>

                  {/* KPI 3 */}
                  <div className="bg-[#10182A] border border-[#263247] rounded-2xl p-5 space-y-2">
                    <span className="text-xs text-[#94A3B8] font-medium">Avg Importance Score</span>
                    <div className="text-3xl font-extrabold text-amber-400 flex items-baseline space-x-1">
                      <span>{analyticsData.kpis.avgImportanceScore}</span>
                      <span className="text-xs text-slate-500 font-normal">/100</span>
                    </div>
                    <div className="text-[11px] text-[#94A3B8] flex items-center space-x-1.5 pt-1">
                      <span>⭐ Editorial Rubric Score</span>
                    </div>
                  </div>

                  {/* KPI 4 */}
                  <div className="bg-[#10182A] border border-[#263247] rounded-2xl p-5 space-y-2">
                    <span className="text-xs text-[#94A3B8] font-medium">Audio Broadcasts</span>
                    <div className="text-3xl font-extrabold text-blue-400">
                      {analyticsData.kpis.totalEpisodes}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] flex items-center space-x-1.5 pt-1">
                      <span>🎙️ ~{analyticsData.kpis.totalAudioMinutes} min total spoken audio</span>
                    </div>
                  </div>
                </div>

                {/* Visual Category Distribution */}
                <div className="bg-[#10182A] border border-[#263247] rounded-2xl p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">Canonical Category Breakdown</h4>
                      <p className="text-xs text-[#94A3B8]">Database-verified distribution of technology topics.</p>
                    </div>
                  </div>

                  <div className="space-y-3.5">
                    {analyticsData.categories.map((cat, idx) => {
                      const totalAnalyzed = analyticsData.kpis.analyzedArticles || 1;
                      const percentage = Math.round((cat.storyCount / totalAnalyzed) * 100);
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-200">{cat.category}</span>
                            <span className="text-[#94A3B8] font-mono">
                              {cat.storyCount} stories ({percentage}%) · Avg: {cat.avgScore}/100
                            </span>
                          </div>
                          <div className="w-full bg-[#080D1B] rounded-full h-2 border border-[#263247] overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-cyan-400 to-blue-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, Math.max(4, percentage))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Editorial Leaderboard (Top 5 Stories) */}
                {analyticsData.topStories && analyticsData.topStories.length > 0 && (
                  <div className="bg-[#10182A] border border-[#263247] rounded-2xl p-6 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">Editorial Leaderboard — Highest Importance Stories</h4>
                      <p className="text-xs text-[#94A3B8]">Ranked by Gemini's technical innovation and market impact rubric.</p>
                    </div>

                    <div className="space-y-3">
                      {analyticsData.topStories.map((story, i) => (
                        <div
                          key={story.id || i}
                          className="bg-[#080D1B] border border-[#263247] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center space-x-2 text-xs">
                              <span className="font-bold text-cyan-400 font-mono">#{i + 1}</span>
                              <span className="text-[#94A3B8]">{story.sourceName}</span>
                              {story.category && (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getCategoryBadgeStyle(story.category)}`}>
                                  {story.category}
                                </span>
                              )}
                            </div>
                            <h5 className="text-sm font-bold text-white leading-snug">
                              {decodeHtmlEntities(story.title)}
                            </h5>
                            {story.importanceReason && (
                              <p className="text-xs text-[#94A3B8] italic">
                                "{decodeHtmlEntities(story.importanceReason)}"
                              </p>
                            )}
                          </div>

                          <div className="flex items-center sm:flex-col items-end gap-2 flex-shrink-0">
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40 font-mono">
                              ⭐ {story.importanceScore}/100
                            </span>
                            <a
                              href={story.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                            >
                              Source ↗
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-20 bg-[#10182A] border border-[#263247] rounded-2xl p-6">
                <p className="text-xs text-[#94A3B8]">No analytics data available yet.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Polished Footer ── */}
      <footer className="border-t border-[#263247] bg-[#10182A]/80 py-6 text-center space-y-1.5 px-4">
        <p className="text-xs font-semibold text-slate-300">
          Tech Innovation News Show · Production Ready Full-Stack Platform
        </p>
        <p className="text-[11px] text-[#94A3B8]">
          🤖 Editorial insights synthesized via Google Gemini. Fact-check with primary publishers using original source links.
        </p>
      </footer>
    </div>
  );
}
