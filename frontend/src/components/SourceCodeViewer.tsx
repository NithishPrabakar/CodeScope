import React, { useState, useEffect, useRef, useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
// Import language grammars for Prism
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markdown';

import type { SourceFileResponse } from '../types/repo';
import { formatBytes } from '../utils/formatUtils';

interface SourceCodeViewerProps {
  repoId: string;
  filePath: string | null;
  targetLine?: number | null;
  onNavigateToFile?: (path: string, line?: number) => void;
  onSwitchToImpact?: () => void;
}

export const SourceCodeViewer: React.FC<SourceCodeViewerProps> = ({
  repoId,
  filePath,
  targetLine,
  onNavigateToFile,
  onSwitchToImpact,
}) => {
  const [data, setData] = useState<SourceFileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(targetLine || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDepDrawer, setShowDepDrawer] = useState(true);

  const codeContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Update highlighted line if prop changes
  useEffect(() => {
    if (targetLine) {
      setHighlightedLine(targetLine);
      scrollToLine(targetLine);
    }
  }, [targetLine]);

  // Fetch source code when filePath changes
  useEffect(() => {
    if (!repoId || !filePath) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/repos/${repoId}/file?path=${encodeURIComponent(filePath)}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP Error ${res.status}`);
        }
        return res.json();
      })
      .then((fileData: SourceFileResponse) => {
        setData(fileData);
        if (targetLine) {
          setTimeout(() => scrollToLine(targetLine), 100);
        }
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [repoId, filePath]);

  const scrollToLine = (lineNum: number) => {
    const el = lineRefs.current.get(lineNum);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleCopyCode = () => {
    if (!data?.content) return;
    navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine language for Prism highlighting
  const prismLanguage = useMemo(() => {
    if (!filePath) return 'javascript';
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
        return 'typescript';
      case 'tsx':
        return 'tsx';
      case 'js':
      case 'mjs':
      case 'cjs':
        return 'javascript';
      case 'jsx':
        return 'jsx';
      case 'json':
        return 'json';
      case 'css':
        return 'css';
      case 'html':
        return 'html';
      case 'md':
        return 'markdown';
      default:
        return 'javascript';
    }
  }, [filePath]);

  // Highlight all code lines with Prism
  const highlightedCodeLines = useMemo(() => {
    if (!data?.content) return [];
    const lines = data.content.split('\n');
    const grammar = Prism.languages[prismLanguage] || Prism.languages.javascript;

    return lines.map((line) => {
      try {
        return Prism.highlight(line || ' ', grammar, prismLanguage);
      } catch {
        return line;
      }
    });
  }, [data?.content, prismLanguage]);

  // Filter lines if search query is provided
  const matchingLineNumbers = useMemo(() => {
    if (!searchQuery.trim() || !data?.content) return new Set<number>();
    const lines = data.content.split('\n');
    const matches = new Set<number>();
    const q = searchQuery.toLowerCase();
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(q)) {
        matches.add(idx + 1);
      }
    });
    return matches;
  }, [searchQuery, data?.content]);

  if (!filePath) {
    return (
      <div className="source-viewer-empty">
        <span className="empty-viewer-icon">💻</span>
        <p>No file selected for source code inspection.</p>
        <small>Click any file in the File Explorer or Dependency Graph to view its code.</small>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="source-viewer-loading">
        <span className="spinner"></span>
        <p>Loading source code for <code>{filePath}</code>...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="source-viewer-error">
        <span className="error-icon">⚠️</span>
        <h4>Failed to Load Source File</h4>
        <p>{error}</p>
        <small>Target path: {filePath}</small>
      </div>
    );
  }

  if (!data) return null;

  if (data.isBinary) {
    return (
      <div className="source-viewer-binary">
        <span className="binary-icon">📦</span>
        <h4>Binary File Format</h4>
        <p>{data.message || 'This file contains binary data and cannot be displayed in the code viewer.'}</p>
        <div className="binary-meta">
          <span>Extension: <code>{data.extension}</code></span>
          <span>Size: <code>{formatBytes(data.size)}</code></span>
        </div>
      </div>
    );
  }

  return (
    <div className="source-code-viewer-container">
      {/* Viewer Header */}
      <div className="source-viewer-header">
        <div className="viewer-file-info">
          <span className="viewer-file-icon">📄</span>
          <span className="viewer-file-path">{data.filePath}</span>
          <span className="viewer-lang-badge">{prismLanguage.toUpperCase()}</span>
          <span className="viewer-meta-pill">{data.totalLines} lines</span>
          <span className="viewer-meta-pill">{formatBytes(data.size)}</span>
          {data.isTruncated && (
            <span className="viewer-truncated-badge" title="File exceeds 2MB; displaying first 500KB">
              Truncated (Large File)
            </span>
          )}
        </div>

        <div className="viewer-actions">
          <div className="viewer-search-box">
            <input
              type="text"
              placeholder="Find in code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="viewer-search-input"
            />
            {searchQuery && (
              <span className="search-count-pill">{matchingLineNumbers.size} matches</span>
            )}
          </div>

          <button
            type="button"
            className={`viewer-action-btn ${showDepDrawer ? 'active' : ''}`}
            onClick={() => setShowDepDrawer(!showDepDrawer)}
            title="Toggle Dependency Awareness Panel"
          >
            🔗 Dependencies ({data.outgoingDependencies.length + data.incomingDependents.length})
          </button>

          {onSwitchToImpact && (
            <button
              type="button"
              className="viewer-action-btn impact-switch-btn"
              onClick={onSwitchToImpact}
              title="Switch to Change Impact & Risk Analysis for this file"
            >
              ⚡ View Impact & Risk
            </button>
          )}

          <button
            type="button"
            className="viewer-action-btn copy-btn"
            onClick={handleCopyCode}
            title="Copy entire code to clipboard"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* Stage 7 Dependency Awareness Drawer */}
      {showDepDrawer && (
        <div className="dep-awareness-drawer">
          {/* Outgoing Dependencies (What this file imports) */}
          <div className="dep-drawer-col">
            <span className="drawer-col-title">
              Imports & Outgoing Dependencies ({data.outgoingDependencies.length}):
            </span>
            {data.outgoingDependencies.length === 0 ? (
              <p className="drawer-empty-note">No outgoing imports detected in this file.</p>
            ) : (
              <div className="drawer-dep-list">
                {data.outgoingDependencies.map((dep, idx) => {
                  const isLocal = dep.targetKind === 'local' && dep.targetFile;
                  return (
                    <div key={`${dep.id || idx}`} className="drawer-dep-item">
                      <span className={`drawer-dep-type type-${dep.type}`}>{dep.type}</span>
                      {dep.line && (
                        <button
                          type="button"
                          className="drawer-line-jump-btn"
                          onClick={() => {
                            setHighlightedLine(dep.line || null);
                            scrollToLine(dep.line || 1);
                          }}
                          title={`Jump to line ${dep.line} in source`}
                        >
                          L{dep.line}
                        </button>
                      )}
                      <span className="drawer-specifier" title={dep.rawSpecifier}>
                        {dep.rawSpecifier}
                      </span>
                      {isLocal ? (
                        <button
                          type="button"
                          className="drawer-nav-btn"
                          onClick={() => onNavigateToFile?.(dep.targetFile!)}
                          title={`Navigate to source: ${dep.targetFile}`}
                        >
                          ➔ 📄 {dep.targetFile?.split('/').pop()}
                        </button>
                      ) : (
                        <span className="drawer-pkg-tag">
                          {dep.targetKind === 'external' ? 'package' : 'unresolved'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Incoming Dependents (What files depend on this file) */}
          <div className="dep-drawer-col">
            <span className="drawer-col-title">
              Incoming Dependents (Called by {data.incomingDependents.length} file(s)):
            </span>
            {data.incomingDependents.length === 0 ? (
              <p className="drawer-empty-note">No other local files import or reference this module.</p>
            ) : (
              <div className="drawer-dep-list">
                {data.incomingDependents.map((dep, idx) => (
                  <div key={`${dep.id || idx}`} className="drawer-dep-item incoming">
                    <span className={`drawer-dep-type type-${dep.type}`}>{dep.type}</span>
                    <button
                      type="button"
                      className="drawer-nav-btn"
                      onClick={() => onNavigateToFile?.(dep.sourceFile, dep.line)}
                      title={`Navigate to consumer: ${dep.sourceFile}${dep.line ? ` (Line ${dep.line})` : ''}`}
                    >
                      📄 {dep.sourceFile}
                    </button>
                    {dep.line && <span className="drawer-dep-line">line {dep.line}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Code Viewer Body */}
      <div className="source-viewer-body" ref={codeContainerRef}>
        <div className="code-table">
          {highlightedCodeLines.map((htmlLine, idx) => {
            const lineNum = idx + 1;
            const isHighlighted = highlightedLine === lineNum;
            const isSearchMatch = matchingLineNumbers.has(lineNum);

            return (
              <div
                key={lineNum}
                ref={(el) => {
                  if (el) lineRefs.current.set(lineNum, el);
                  else lineRefs.current.delete(lineNum);
                }}
                className={`code-line-row ${isHighlighted ? 'highlighted-line' : ''} ${
                  isSearchMatch ? 'search-match-line' : ''
                }`}
                onClick={() => setHighlightedLine(lineNum)}
              >
                <div className="line-number-cell" title={`Line ${lineNum}`}>
                  {lineNum}
                </div>
                <div
                  className="code-content-cell"
                  dangerouslySetInnerHTML={{ __html: htmlLine }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
