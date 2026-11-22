import { useState, useEffect } from 'react';
import { RepoUpload } from './components/RepoUpload';
import { FileExplorer } from './components/FileExplorer';
import { DependencyGraph } from './components/DependencyGraph';
import { RepoHistory } from './components/RepoHistory';
import { AnalysisHistoryViewer } from './components/AnalysisHistoryViewer';
import type {
  RepositoryUploadResponse,
  RepoDependencyAnalysis,
  ImpactAnalysisResult,
  SavedAnalysisRecord,
} from './types/repo';
import './App.css';

function App() {
  const [repoData, setRepoData] = useState<RepositoryUploadResponse | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [dbOnline, setDbOnline] = useState<boolean | null>(null);
  const [refreshHistoryTrigger, setRefreshHistoryTrigger] = useState<number>(0);

  // View state: 'explorer' | 'graph' | 'history'
  const [viewMode, setViewMode] = useState<'explorer' | 'graph' | 'history'>('explorer');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [explorerTab, setExplorerTab] = useState<'source' | 'impact' | 'dependencies'>('impact');

  // Shared dependency & impact data
  const [depAnalysis, setDepAnalysis] = useState<RepoDependencyAnalysis | null>(null);
  const [impactData, setImpactData] = useState<ImpactAnalysisResult | null>(null);

  // Backend and Database health verification
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setBackendOnline(true);
        setDbOnline(data.database === 'connected');
      })
      .catch(() => {
        setBackendOnline(false);
        setDbOnline(false);
      });
  }, []);

  // Fetch repository dependencies when repoData changes
  useEffect(() => {
    if (!repoData) {
      setDepAnalysis(null);
      setSelectedPath(null);
      setImpactData(null);
      return;
    }

    fetch(`/api/repos/${repoData.repoId}/dependencies`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load dependencies');
        return res.json();
      })
      .then((data: RepoDependencyAnalysis) => {
        setDepAnalysis(data);
      })
      .catch((err) => {
        console.error('Failed to load dependencies:', err);
      });
  }, [repoData]);

  // Fetch impact analysis whenever selectedPath changes
  useEffect(() => {
    if (!repoData || !selectedPath) {
      setImpactData(null);
      return;
    }

    fetch(`/api/repos/${repoData.repoId}/impact?file=${encodeURIComponent(selectedPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load impact');
        return res.json();
      })
      .then((data: ImpactAnalysisResult) => {
        setImpactData(data);
      })
      .catch((err) => {
        console.error('Failed to load impact:', err);
        setImpactData(null);
      });
  }, [repoData, selectedPath]);

  const handleResetRepo = () => {
    setRepoData(null);
    setSelectedPath(null);
    setDepAnalysis(null);
    setImpactData(null);
    setViewMode('explorer');
    setRefreshHistoryTrigger((prev) => prev + 1);
  };

  const handleOpenHistoricalAnalysis = (targetFile: string, _rec: SavedAnalysisRecord) => {
    setSelectedPath(targetFile);
    setExplorerTab('impact');
    setViewMode('explorer');
  };

  const handleViewHistoricalSource = (filePath: string) => {
    setSelectedPath(filePath);
    setExplorerTab('source');
    setViewMode('explorer');
  };

  return (
    <div className={`app-container ${viewMode === 'graph' ? 'full-width-container' : ''}`}>
      {/* Header */}
      <header className="app-header">
        <div className="header-top">
          <div className="stage-badge">Stage 8: Database Persistence & History</div>
          <div className="backend-indicator">
            <span
              className={`indicator-dot ${
                backendOnline === true ? 'online' : backendOnline === false ? 'offline' : 'pending'
              }`}
            ></span>
            <span className="indicator-label">
              {backendOnline === true
                ? `Backend Online (Port 5000) • ${dbOnline ? 'PostgreSQL Connected' : 'DB Standby'}`
                : backendOnline === false
                ? 'Backend Offline'
                : 'Connecting...'}
            </span>
          </div>
        </div>

        <div className="title-view-row">
          <div>
            <h1 className="app-title">CodeScope</h1>
            <p className="app-subtitle">Code Change Impact & Risk Analyzer</p>
          </div>

          {/* Primary View Switcher */}
          {repoData ? (
            <div className="app-view-switcher">
              <button
                type="button"
                className={`view-switch-btn ${viewMode === 'explorer' ? 'active' : ''}`}
                onClick={() => setViewMode('explorer')}
              >
                📁 File Explorer
              </button>
              <button
                type="button"
                className={`view-switch-btn ${viewMode === 'graph' ? 'active' : ''}`}
                onClick={() => setViewMode('graph')}
              >
                🕸️ Dependency Graph
              </button>
              <button
                type="button"
                className={`view-switch-btn ${viewMode === 'history' ? 'active' : ''}`}
                onClick={() => setViewMode('history')}
              >
                📜 Analysis History
              </button>
              <button
                type="button"
                className="view-switch-btn switch-repo-btn"
                onClick={handleResetRepo}
                title="Switch repository or upload a new one"
              >
                🔄 Switch Repo
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="refresh-history-btn"
              onClick={() => setRefreshHistoryTrigger((prev) => prev + 1)}
            >
              🔄 Refresh Repositories
            </button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="app-main">
        {!repoData ? (
          <div className="welcome-workspace">
            <div className="upload-view">
              <div className="instructions-card">
                <h2>Upload Repository Archive</h2>
                <p>
                  Upload your JavaScript or TypeScript codebase packaged as a <code>.zip</code> file.
                  CodeScope extracts the code, persists metadata in PostgreSQL, and generates an
                  interactive dependency & change impact graph.
                </p>
              </div>

              <RepoUpload
                onUploadSuccess={(data) => {
                  setRepoData(data);
                  setViewMode('graph');
                }}
              />
            </div>

            {/* Stage 8 Repository Persistence & Listing Section */}
            <RepoHistory
              onOpenRepo={(repo) => {
                setRepoData(repo);
                setViewMode('explorer');
              }}
              onRefreshTrigger={refreshHistoryTrigger}
            />
          </div>
        ) : viewMode === 'graph' ? (
          <DependencyGraph
            fileTree={repoData.fileTree}
            dependencies={depAnalysis?.dependencies || []}
            selectedFilePath={selectedPath}
            impactData={impactData}
            onSelectFile={(filePath) => setSelectedPath(filePath)}
            onSwitchToExplorer={() => {
              setExplorerTab('impact');
              setViewMode('explorer');
            }}
            onViewSource={(filePath) => {
              setSelectedPath(filePath);
              setExplorerTab('source');
              setViewMode('explorer');
            }}
          />
        ) : viewMode === 'history' ? (
          <AnalysisHistoryViewer
            repoId={repoData.repoId}
            repoName={repoData.repoName}
            onSelectAnalysis={handleOpenHistoricalAnalysis}
            onViewSource={handleViewHistoricalSource}
          />
        ) : (
          <FileExplorer
            repoData={repoData}
            onReset={handleResetRepo}
            onOpenGraph={() => setViewMode('graph')}
            externalSelectedPath={selectedPath}
            initialTab={explorerTab}
            onSelectPath={(filePath) => setSelectedPath(filePath)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>CodeScope • Stage 8 • Database Persistence & Analysis History with PostgreSQL & Prisma</p>
      </footer>
    </div>
  );
}

export default App;
