import { useState, useEffect } from 'react';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking');
  const [backendData, setBackendData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
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

    checkBackend();
  }, [apiUrl]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-white">
      {/* Header / Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              TN
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Tech Innovation News Show
              </h1>
              <p className="text-xs text-slate-400">Student Project • Phase 1 MVP</p>
            </div>
          </div>

          {/* Backend Status Pill */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">API:</span>
            {backendStatus === 'checking' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <span className="w-2 h-2 mr-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                Checking API...
              </span>
            )}
            {backendStatus === 'connected' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-2 h-2 mr-1.5 rounded-full bg-emerald-400"></span>
                Backend Connected
              </span>
            )}
            {backendStatus === 'disconnected' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <span className="w-2 h-2 mr-1.5 rounded-full bg-rose-400"></span>
                Backend Offline
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Hero & Overview */}
      <main className="max-w-6xl mx-auto px-6 py-12 flex-1 w-full space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto pt-6">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-2">
            🚀 Phase 1 Foundation Active
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Daily Tech News, Audio Episodes & Intelligent Q&A
          </h2>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
            A student-led platform collecting modern tech news, synthesizing daily episodes with text-to-speech audio, and enabling interactive RAG question-answering.
          </p>
        </div>

        {/* Connectivity Diagnostics Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm max-w-2xl mx-auto">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            System Connectivity Status
          </h3>
          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Frontend Dev Server:</span>
              <span className="text-emerald-400 font-medium">http://localhost:5173 (Vite + Tailwind)</span>
            </div>
            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Target Backend URL:</span>
              <span className="text-cyan-400 font-medium">{apiUrl}/health</span>
            </div>
            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Backend Response:</span>
              {backendData ? (
                <span className="text-emerald-400 font-medium">
                  {backendData.status} ({backendData.service})
                </span>
              ) : (
                <span className="text-rose-400 font-medium">
                  {errorMsg ? errorMsg : 'Waiting for backend response...'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Planned Features Roadmap Grid */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white text-center">
            Upcoming Architecture Pipeline
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 space-y-2 hover:border-slate-700 transition">
              <div className="text-cyan-400 text-lg font-bold">Phase 2: Database</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                PostgreSQL schema for articles, daily episodes, transcripts, and source metadata.
              </p>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 space-y-2 hover:border-slate-700 transition">
              <div className="text-cyan-400 text-lg font-bold">Phase 3 & 4: AI Engine</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Automated news collection, article deduplication, summarization, and daily script generation.
              </p>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 space-y-2 hover:border-slate-700 transition">
              <div className="text-cyan-400 text-lg font-bold">Phase 5 & 6: Audio & RAG</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Text-to-speech narration player and vector-powered episode questioning ("Ask This Episode").
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        Tech Innovation News Show • Built with React, Vite, Tailwind CSS & Node.js
      </footer>
    </div>
  );
}

