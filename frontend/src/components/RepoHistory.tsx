import React, { useState, useEffect } from 'react';
import type { SavedRepositorySummary, RepositoryUploadResponse } from '../types/repo';
import { formatBytes } from '../utils/formatUtils';

interface RepoHistoryProps {
  onOpenRepo: (repo: RepositoryUploadResponse) => void;
  onRefreshTrigger?: number;
}

export const RepoHistory: React.FC<RepoHistoryProps> = ({ onOpenRepo, onRefreshTrigger = 0 }) => {
  const [repos, setRepos] = useState<SavedRepositorySummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchRepositories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/repos');
      if (!res.ok) {
        throw new Error(`Failed to load repositories (Status: ${res.status})`);
      }
      const data = await res.json();
      setRepos(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repositories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositories();
  }, [onRefreshTrigger]);

  const handleOpenRepo = async (repoId: string) => {
    setOpeningId(repoId);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repoId}`);
      if (!res.ok) {
        throw new Error(`Failed to retrieve repository ${repoId} (Status: ${res.status})`);
      }
      const data: RepositoryUploadResponse = await res.json();
      onOpenRepo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error reopening repository.');
    } finally {
      setOpeningId(null);
    }
  };

  const handleDeleteRepo = async (repo: SavedRepositorySummary) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete repository "${repo.name}"?\nAll associated analysis history and extracted files will be permanently removed.`
    );
    if (!confirmed) return;

    setDeletingId(repo.id);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repo.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete repository (Status: ${res.status})`);
      }
      // Remove from state immediately
      setRepos((prev) => prev.filter((r) => r.id !== repo.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete repository.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const filteredRepos = repos.filter((r) =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="repo-history-container">
      <div className="repo-history-header">
        <div>
          <h3 className="repo-history-title">Saved Repositories & History</h3>
          <p className="repo-history-subtitle">
            Persisted in PostgreSQL across backend restarts. Reopen anytime to resume inspection.
          </p>
        </div>
        <button
          type="button"
          className="refresh-history-btn"
          onClick={fetchRepositories}
          disabled={loading}
          title="Refresh repository list"
        >
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="history-error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Filter / Search input */}
      {repos.length > 0 && (
        <div className="history-search-row">
          <input
            type="text"
            className="history-search-input"
            placeholder="Search saved repositories by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="history-count-badge">
            {filteredRepos.length} of {repos.length} {repos.length === 1 ? 'repository' : 'repositories'}
          </span>
        </div>
      )}

      {loading ? (
        <div className="history-loading-state">
          <span className="history-spinner"></span>
          <p>Loading saved repositories from database...</p>
        </div>
      ) : repos.length === 0 ? (
        <div className="history-empty-state">
          <div className="empty-history-icon">📦</div>
          <h4>No Saved Repositories Yet</h4>
          <p>
            Repositories you upload are automatically persisted in PostgreSQL and will appear here.
          </p>
        </div>
      ) : filteredRepos.length === 0 ? (
        <div className="history-empty-state">
          <p>No repositories match your search term "{searchTerm}".</p>
        </div>
      ) : (
        <div className="repo-card-grid">
          {filteredRepos.map((repo) => (
            <div key={repo.id} className="repo-history-card">
              <div className="repo-card-top">
                <div className="repo-card-header-left">
                  <span className="repo-card-icon">📂</span>
                  <div>
                    <h4 className="repo-card-name" title={repo.name}>
                      {repo.name}
                    </h4>
                    <span className="repo-card-date">
                      Uploaded on {formatDate(repo.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="repo-card-badges">
                  {repo.analysisCount > 0 && (
                    <span className="repo-analysis-badge">
                      📊 {repo.analysisCount} {repo.analysisCount === 1 ? 'analysis' : 'analyses'}
                    </span>
                  )}
                  <span className="repo-status-badge">{repo.status}</span>
                </div>
              </div>

              <div className="repo-card-stats">
                <div className="repo-stat-item">
                  <span className="stat-label">Files</span>
                  <span className="stat-value">{repo.fileCount}</span>
                </div>
                <div className="repo-stat-item">
                  <span className="stat-label">Directories</span>
                  <span className="stat-value">{repo.directoryCount}</span>
                </div>
                <div className="repo-stat-item">
                  <span className="stat-label">Size</span>
                  <span className="stat-value">{formatBytes(repo.totalSize)}</span>
                </div>
              </div>

              <div className="repo-card-actions">
                <button
                  type="button"
                  className="open-repo-btn"
                  onClick={() => handleOpenRepo(repo.id)}
                  disabled={openingId === repo.id || deletingId === repo.id}
                >
                  {openingId === repo.id ? 'Opening...' : '📂 Open Repository'}
                </button>
                <button
                  type="button"
                  className="delete-repo-btn"
                  onClick={() => handleDeleteRepo(repo)}
                  disabled={deletingId === repo.id || openingId === repo.id}
                  title="Delete repository and remove from database"
                >
                  {deletingId === repo.id ? 'Deleting...' : '🗑️ Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
