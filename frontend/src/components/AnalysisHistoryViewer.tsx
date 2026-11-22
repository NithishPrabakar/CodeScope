import React, { useState, useEffect } from 'react';
import type { SavedAnalysisRecord } from '../types/repo';

interface AnalysisHistoryViewerProps {
  repoId: string;
  repoName: string;
  onSelectAnalysis: (targetFile: string, record: SavedAnalysisRecord) => void;
  onViewSource: (filePath: string) => void;
}

export const AnalysisHistoryViewer: React.FC<AnalysisHistoryViewerProps> = ({
  repoId,
  repoName,
  onSelectAnalysis,
  onViewSource,
}) => {
  const [analyses, setAnalyses] = useState<SavedAnalysisRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<string>('all');

  const fetchAnalyses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repoId}/analyses`);
      if (!res.ok) {
        throw new Error(`Failed to load analysis history (Status: ${res.status})`);
      }
      const data = await res.json();
      setAnalyses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve analysis history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyses();
  }, [repoId]);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getRiskBadgeClass = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'critical':
        return 'risk-badge-critical';
      case 'high':
        return 'risk-badge-high';
      case 'medium':
        return 'risk-badge-medium';
      case 'low':
      default:
        return 'risk-badge-low';
    }
  };

  const filteredAnalyses = analyses.filter((a) => {
    const matchesSearch = a.targetFile.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLevel =
      selectedLevelFilter === 'all' || a.riskLevel.toLowerCase() === selectedLevelFilter;
    return matchesSearch && matchesLevel;
  });

  return (
    <div className="analysis-history-page">
      <div className="analysis-history-header">
        <div>
          <h2 className="history-page-title">Analysis History — {repoName}</h2>
          <p className="history-page-subtitle">
            Records of all Change Impact Analyses performed on this repository, saved in PostgreSQL.
          </p>
        </div>
        <button
          type="button"
          className="refresh-history-btn"
          onClick={fetchAnalyses}
          disabled={loading}
        >
          🔄 Refresh History
        </button>
      </div>

      {error && (
        <div className="history-error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Filters and search row */}
      {analyses.length > 0 && (
        <div className="history-toolbar">
          <input
            type="text"
            className="history-search-input"
            placeholder="Search by target filename..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <div className="history-level-filters">
            {['all', 'low', 'medium', 'high', 'critical'].map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={`history-filter-pill ${selectedLevelFilter === lvl ? 'active' : ''}`}
                onClick={() => setSelectedLevelFilter(lvl)}
              >
                {lvl.toUpperCase()}
              </button>
            ))}
          </div>

          <span className="history-count-badge">
            {filteredAnalyses.length} of {analyses.length} {analyses.length === 1 ? 'record' : 'records'}
          </span>
        </div>
      )}

      {loading ? (
        <div className="history-loading-state">
          <span className="history-spinner"></span>
          <p>Loading historical analysis records from database...</p>
        </div>
      ) : analyses.length === 0 ? (
        <div className="history-empty-state">
          <div className="empty-history-icon">📊</div>
          <h4>No Analysis History Yet</h4>
          <p>
            Whenever you select a file in the File Explorer or Dependency Graph, its Change Impact Analysis
            and Risk Score are automatically saved to PostgreSQL.
          </p>
        </div>
      ) : filteredAnalyses.length === 0 ? (
        <div className="history-empty-state">
          <p>No analysis records match your filter criteria.</p>
        </div>
      ) : (
        <div className="history-records-list">
          {filteredAnalyses.map((rec) => (
            <div key={rec.id} className="history-record-card">
              <div className="record-header">
                <div className="record-file-info">
                  <span className="record-file-icon">📄</span>
                  <code className="record-file-path" title={rec.targetFile}>
                    {rec.targetFile}
                  </code>
                </div>
                <div className="record-meta-right">
                  <span className={`record-risk-badge ${getRiskBadgeClass(rec.riskLevel)}`}>
                    Score: {rec.riskScore}/100 • {rec.riskLevel.toUpperCase()}
                  </span>
                  <span className="record-timestamp">{formatDate(rec.analyzedAt)}</span>
                </div>
              </div>

              <div className="record-metrics-row">
                <div className="record-metric-item">
                  <span className="metric-label">Direct Impact:</span>
                  <span className="metric-value">{rec.directImpactCount} files</span>
                </div>
                <div className="record-metric-item">
                  <span className="metric-label">Indirect Impact:</span>
                  <span className="metric-value">{rec.indirectImpactCount} files</span>
                </div>
                <div className="record-metric-item">
                  <span className="metric-label">Total Affected:</span>
                  <span className="metric-value highlight">{rec.totalAffectedFiles} files</span>
                </div>
                <div className="record-metric-item">
                  <span className="metric-label">Max Depth:</span>
                  <span className="metric-value">{rec.maxDepth}</span>
                </div>
                {rec.hasCycleInPath && (
                  <div className="record-metric-item cycle-alert">
                    <span className="cycle-badge">⚠️ Circular Dependency in Path</span>
                  </div>
                )}
              </div>

              {/* Test recommendations summary */}
              {rec.testRecommendations && rec.testRecommendations.length > 0 && (
                <div className="record-test-summary">
                  <span className="test-rec-icon">🧪</span>
                  <span className="test-rec-text">
                    <strong>{rec.testRecommendations.length}</strong> Recommended Tests:{' '}
                    {rec.testRecommendations.slice(0, 2).map((t, i) => (
                      <span key={i} className="test-pill">
                        {t.targetFile}
                      </span>
                    ))}
                    {rec.testRecommendations.length > 2 && (
                      <span className="test-more-pill">+{rec.testRecommendations.length - 2} more</span>
                    )}
                  </span>
                </div>
              )}

              <div className="record-actions-row">
                <button
                  type="button"
                  className="record-action-btn primary"
                  onClick={() => onSelectAnalysis(rec.targetFile, rec)}
                >
                  🔍 Open Impact Analysis
                </button>
                <button
                  type="button"
                  className="record-action-btn secondary"
                  onClick={() => onViewSource(rec.targetFile)}
                >
                  📝 View Source Code
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
