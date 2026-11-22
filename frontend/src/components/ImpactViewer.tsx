import React, { useState } from 'react';
import type { ImpactAnalysisResult, AffectedFile, TestRecommendation } from '../types/repo';

interface ImpactViewerProps {
  impactData: ImpactAnalysisResult | null;
  loading: boolean;
  onNavigateToFile?: (path: string) => void;
}

export const ImpactViewer: React.FC<ImpactViewerProps> = ({
  impactData,
  loading,
  onNavigateToFile,
}) => {
  const [showFactorDetails, setShowFactorDetails] = useState(true);

  if (loading) {
    return (
      <div className="impact-loading-box">
        <span className="spinner"></span>
        <p>Traversing reverse dependency graph, assessing risk & tests...</p>
      </div>
    );
  }

  if (!impactData) {
    return (
      <div className="impact-empty-state">
        <span className="impact-empty-icon">🎯</span>
        <p>Select any file to run change impact & risk analysis.</p>
        <small>CodeScope calculates downstream dependents, risk score (0-100), and test recommendations.</small>
      </div>
    );
  }

  const {
    changedFile,
    totalAffectedFiles,
    directImpactCount,
    indirectImpactCount,
    maxDepth,
    directImpactFiles,
    indirectImpactFiles,
    circularDependencies,
    hasCycleInPath,
    riskAnalysis,
    testRecommendations,
  } = impactData;

  const renderImpactCard = (item: AffectedFile) => {
    return (
      <div key={item.filePath} className={`impact-card depth-${item.depth}`}>
        <div className="impact-card-header">
          <div className="impact-file-info">
            <span className={`depth-badge depth-${item.depth}`}>
              Depth {item.depth} • {item.impactType.toUpperCase()}
            </span>
            <button
              type="button"
              className="impact-filename-btn"
              title={`Click to inspect ${item.filePath}`}
              onClick={() => onNavigateToFile?.(item.filePath)}
            >
              📄 {item.filePath}
            </button>
          </div>
        </div>

        {/* Impact Chain Breadcrumbs */}
        <div className="impact-chain-box">
          <span className="chain-label">Impact Chain:</span>
          <div className="chain-steps">
            {item.impactPath.map((step, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === item.impactPath.length - 1;
              const edgeType = idx > 0 ? item.connectingDependencies[idx - 1] : null;

              return (
                <React.Fragment key={`${step}-${idx}`}>
                  {edgeType && (
                    <span className="chain-edge-pill">
                      ➔ <span className={`edge-type-text type-${edgeType}`}>{edgeType}</span> ➔
                    </span>
                  )}
                  <span
                    className={`chain-node ${isFirst ? 'origin' : isLast ? 'target' : 'intermediate'}`}
                    onClick={() => onNavigateToFile?.(step)}
                    title={isFirst ? 'Changed file (origin)' : `Step ${idx}: ${step}`}
                  >
                    {step.split('/').pop()}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderTestCard = (rec: TestRecommendation) => {
    return (
      <div key={rec.targetFile} className={`test-rec-card priority-${rec.priority}`}>
        <div className="test-rec-header">
          <div className="test-rec-title-group">
            <span className={`priority-badge ${rec.priority}`}>
              {rec.priority.toUpperCase()} PRIORITY
            </span>
            <button
              type="button"
              className="test-target-file-btn"
              onClick={() => onNavigateToFile?.(rec.targetFile)}
            >
              {rec.targetFile}
            </button>
          </div>
          <span className="rec-depth-badge">
            {rec.depth === 0 ? 'Changed File' : `Depth ${rec.depth}`}
          </span>
        </div>

        <p className="test-rec-reason">{rec.reason}</p>

        <div className="test-rec-footer">
          <div className="test-detection-status">
            {rec.hasExistingTest && rec.existingTestFile ? (
              <span className="test-status-badge found">
                ✓ Test Detected: <code>{rec.existingTestFile}</code>
              </span>
            ) : (
              <span className="test-status-badge missing">
                ⚠ No test file detected
              </span>
            )}
          </div>
          <div className="test-suggested-action">
            <strong>Action:</strong> {rec.suggestedAction}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="impact-container">
      {/* Target File Header */}
      <div className="impact-target-bar">
        <div className="target-bar-left">
          <span className="target-label">ANALYZING IMPACT & RISK OF CHANGING:</span>
          <code className="target-filename">{changedFile}</code>
        </div>
        {onNavigateToFile && (
          <button
            type="button"
            className="btn btn-secondary btn-sm target-view-source-btn"
            onClick={() => onNavigateToFile(changedFile)}
            title={`View source code of ${changedFile}`}
          >
            💻 View Source Code ➔
          </button>
        )}
      </div>

      {/* Stage 6: Change Risk Analysis Card */}
      {riskAnalysis && (
        <div className={`risk-panel risk-level-${riskAnalysis.level}`}>
          <div className="risk-panel-header">
            <div className="risk-score-display">
              <div className="risk-score-circle">
                <span className="risk-score-number">{riskAnalysis.score}</span>
                <span className="risk-score-max">/100</span>
              </div>
              <div className="risk-level-info">
                <span className={`risk-badge-tag ${riskAnalysis.level}`}>
                  {riskAnalysis.level.toUpperCase()} RISK
                </span>
                <p className="risk-summary-text">{riskAnalysis.summary}</p>
              </div>
            </div>
            <button
              type="button"
              className="toggle-factors-btn"
              onClick={() => setShowFactorDetails(!showFactorDetails)}
            >
              {showFactorDetails ? 'Hide Factors ▲' : 'Show Factor Details ▼'}
            </button>
          </div>

          {showFactorDetails && (
            <div className="risk-factors-container">
              <span className="factors-heading">Contributing Factor Breakdown:</span>
              <div className="factors-grid">
                {riskAnalysis.factors.map((factor, idx) => (
                  <div key={idx} className="factor-item">
                    <div className="factor-header">
                      <span className="factor-name">{factor.name}</span>
                      <span className="factor-pts">
                        <strong>{factor.points}</strong> / {factor.maxPoints} pts
                      </span>
                    </div>
                    <div className="factor-progress-track">
                      <div
                        className="factor-progress-bar"
                        style={{
                          width: `${Math.min(100, (factor.points / factor.maxPoints) * 100)}%`,
                        }}
                      ></div>
                    </div>
                    <p className="factor-desc">{factor.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary Scoreboard */}
      <div className="impact-scoreboard">
        <div className="score-pill total">
          <span className="score-val">{totalAffectedFiles}</span>
          <span className="score-lbl">Total Affected</span>
        </div>
        <div className="score-pill direct">
          <span className="score-val">{directImpactCount}</span>
          <span className="score-lbl">Direct (Depth 1)</span>
        </div>
        <div className="score-pill indirect">
          <span className="score-val">{indirectImpactCount}</span>
          <span className="score-lbl">Indirect (Depth 2+)</span>
        </div>
        <div className="score-pill maxdepth">
          <span className="score-val">{maxDepth}</span>
          <span className="score-lbl">Max Depth</span>
        </div>
      </div>

      {/* Circular Dependency Warning Alert */}
      {hasCycleInPath && circularDependencies.length > 0 && (
        <div className="cycle-alert-banner">
          <div className="cycle-alert-header">
            <span className="alert-icon">🔄</span>
            <strong>Circular Dependency Detected in Impact Graph</strong>
          </div>
          <p className="cycle-alert-note">
            The dependency engine traversed this cycle safely using visited tracking without infinite recursion:
          </p>
          <div className="cycle-list">
            {circularDependencies.map((c, i) => (
              <div key={i} className="cycle-item">
                <code>{c.cycle.join(' ➔ ')}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage 6: Test Recommendations Section */}
      {testRecommendations && (
        <div className="test-recommendations-section">
          <div className="section-title-row">
            <span className="section-dot test-rec"></span>
            <h4>Prioritized Test Recommendations ({testRecommendations.totalRecommended})</h4>
            <div className="test-summary-pills">
              <span className="test-pill found">
                ✓ {testRecommendations.existingTestsCount} Test Suite(s) Detected
              </span>
              <span className="test-pill missing">
                ⚠ {testRecommendations.missingTestsCount} Without Tests
              </span>
            </div>
          </div>
          <p className="section-help-text">
            Recommended order of test execution to validate changes and catch regressions quickly before full testing.
          </p>
          <div className="test-cards-list">
            {testRecommendations.recommendations.map(renderTestCard)}
          </div>
        </div>
      )}

      {/* Direct & Indirect Impact Cards */}
      {totalAffectedFiles === 0 ? (
        <div className="no-impact-state">
          <span className="safe-icon">🛡️</span>
          <h4>Safe to Modify: Zero Downstream Dependents</h4>
          <p>
            No other local files in this repository import or depend on <code>{changedFile}</code>.
            Modifying or refactoring this file will not directly or indirectly break other modules.
          </p>
        </div>
      ) : (
        <div className="impact-sections">
          {/* Direct Impact Section */}
          {directImpactFiles.length > 0 && (
            <div className="impact-section">
              <div className="section-title-row">
                <span className="section-dot direct"></span>
                <h4>Direct Impact ({directImpactFiles.length})</h4>
                <span className="section-sub">Files that directly import or reference this file</span>
              </div>
              <div className="impact-cards-list">
                {directImpactFiles.map(renderImpactCard)}
              </div>
            </div>
          )}

          {/* Indirect Impact Section */}
          {indirectImpactFiles.length > 0 && (
            <div className="impact-section">
              <div className="section-title-row">
                <span className="section-dot indirect"></span>
                <h4>Indirect Impact ({indirectImpactFiles.length})</h4>
                <span className="section-sub">Files affected through multi-level dependency chains</span>
              </div>
              <div className="impact-cards-list">
                {indirectImpactFiles.map(renderImpactCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
