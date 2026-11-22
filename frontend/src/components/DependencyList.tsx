import React from 'react';
import type { CodeDependency } from '../types/repo';

interface DependencyListProps {
  dependencies: CodeDependency[];
  onNavigateToFile?: (path: string) => void;
}

export const DependencyList: React.FC<DependencyListProps> = ({
  dependencies,
  onNavigateToFile,
}) => {
  if (!dependencies || dependencies.length === 0) {
    return (
      <div className="dep-empty-state">
        <span className="dep-empty-icon">🍃</span>
        <p>No outgoing dependencies detected in this file.</p>
        <small>This file does not import other files, call fs/templates, or require external packages.</small>
      </div>
    );
  }

  // Count by kind
  const localCount = dependencies.filter((d) => d.targetKind === 'local').length;
  const extCount = dependencies.filter((d) => d.targetKind === 'external').length;
  const unresolvedCount = dependencies.filter((d) => d.targetKind === 'unresolved').length;

  return (
    <div className="dep-container">
      <div className="dep-header-summary">
        <span className="dep-count-title">
          {dependencies.length} {dependencies.length === 1 ? 'Dependency' : 'Dependencies'}
        </span>
        <div className="dep-mini-badges">
          {localCount > 0 && <span className="mini-badge local">{localCount} Local</span>}
          {extCount > 0 && <span className="mini-badge ext">{extCount} External</span>}
          {unresolvedCount > 0 && <span className="mini-badge warn">{unresolvedCount} Unresolved</span>}
        </div>
      </div>

      <div className="dep-items-list">
        {dependencies.map((dep) => {
          const isClickable = dep.targetKind === 'local' && !!dep.targetFile && !!onNavigateToFile;

          return (
            <div key={dep.id} className={`dep-card ${dep.targetKind}`}>
              <div className="dep-card-top">
                <div className="dep-type-pill-group">
                  <span className={`dep-type-tag type-${dep.type}`}>{dep.type}</span>
                  <span className={`dep-kind-tag kind-${dep.targetKind}`}>
                    {dep.targetKind === 'local'
                      ? 'LOCAL'
                      : dep.targetKind === 'external'
                      ? 'EXTERNAL'
                      : dep.status === 'dynamic'
                      ? 'DYNAMIC'
                      : 'UNRESOLVED'}
                  </span>
                </div>
                {dep.line && <span className="dep-line-tag">Line {dep.line}</span>}
              </div>

              <div className="dep-main-specifier">
                {isClickable ? (
                  <button
                    type="button"
                    className="dep-nav-link"
                    title={`Click to view ${dep.targetFile}`}
                    onClick={() => onNavigateToFile!(dep.targetFile!)}
                  >
                    <span className="nav-arrow">↳</span> {dep.targetFile}
                  </button>
                ) : (
                  <span className="dep-specifier-text" title={dep.rawSpecifier}>
                    {dep.targetFile || dep.rawSpecifier}
                  </span>
                )}
              </div>

              {dep.targetFile && dep.targetFile !== dep.rawSpecifier && (
                <div className="dep-raw-reference">
                  <span className="ref-label">Raw:</span> <code>{dep.rawSpecifier}</code>
                </div>
              )}

              {dep.details && <div className="dep-details-text">{dep.details}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
