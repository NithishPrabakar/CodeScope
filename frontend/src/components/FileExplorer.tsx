import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type {
  FileNode,
  RepositoryUploadResponse,
  RepoDependencyAnalysis,
  ImpactAnalysisResult,
} from '../types/repo';
import { FileTreeNode } from './FileTreeNode';
import { DependencyList } from './DependencyList';
import { ImpactViewer } from './ImpactViewer';
import { SourceCodeViewer } from './SourceCodeViewer';
import { formatBytes, getFileBadgeClass } from '../utils/formatUtils';

interface FileExplorerProps {
  repoData: RepositoryUploadResponse;
  onReset: () => void;
  onOpenGraph?: () => void;
  externalSelectedPath?: string | null;
  initialTab?: 'source' | 'impact' | 'dependencies' | 'details';
  onSelectPath?: (path: string) => void;
}

/**
 * Collect all directory paths for Expand All functionality
 */
function collectDirectoryPaths(node: FileNode, paths: string[] = []): string[] {
  if (node.type === 'directory') {
    paths.push(node.path);
    if (node.children) {
      for (const child of node.children) {
        collectDirectoryPaths(child, paths);
      }
    }
  }
  return paths;
}

/**
 * Recursively search for a FileNode by path
 */
function findNodeByPath(node: FileNode, targetPath: string): FileNode | null {
  if (node.path === targetPath) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByPath(child, targetPath);
      if (found) return found;
    }
  }
  return null;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  repoData,
  onReset,
  onOpenGraph,
  externalSelectedPath,
  initialTab = 'impact',
  onSelectPath,
}) => {
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({
    '': true, // Root expanded by default
  });

  const [activeTab, setActiveTab] = useState<'source' | 'impact' | 'dependencies' | 'details'>(initialTab);
  const [targetLine, setTargetLine] = useState<number | null>(null);

  // Stage 7 Resizable Panels & Collapsible Sidebar State
  const containerRef = useRef<HTMLDivElement>(null);
  const [treeWidthPercent, setTreeWidthPercent] = useState<number>(32); // 32% Explorer, 68% Code
  const [isTreeCollapsed, setIsTreeCollapsed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawPercent = ((e.clientX - rect.left) / rect.width) * 100;
      // Clamp between 20% and 50%
      const clamped = Math.max(20, Math.min(50, rawPercent));
      setTreeWidthPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Synchronize when initialTab changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Synchronize when an external selection is made (e.g. from graph view)
  useEffect(() => {
    if (externalSelectedPath) {
      handleNavigateToFile(externalSelectedPath);
    }
  }, [externalSelectedPath]);

  const [depAnalysis, setDepAnalysis] = useState<RepoDependencyAnalysis | null>(null);
  const [loadingDeps, setLoadingDeps] = useState(true);

  const [impactData, setImpactData] = useState<ImpactAnalysisResult | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  // Fetch dependency analysis from backend on mount
  useEffect(() => {
    setLoadingDeps(true);
    fetch(`/api/repos/${repoData.repoId}/dependencies`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load dependencies');
        return res.json();
      })
      .then((data: RepoDependencyAnalysis) => {
        setDepAnalysis(data);
      })
      .catch((err) => {
        console.error('Error fetching dependencies:', err);
      })
      .finally(() => {
        setLoadingDeps(false);
      });
  }, [repoData.repoId]);

  // Fetch impact analysis whenever a file is selected
  useEffect(() => {
    if (!selectedNode || selectedNode.type !== 'file') {
      setImpactData(null);
      return;
    }

    setLoadingImpact(true);
    fetch(`/api/repos/${repoData.repoId}/impact?file=${encodeURIComponent(selectedNode.path)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to analyze impact');
        return res.json();
      })
      .then((data: ImpactAnalysisResult) => {
        setImpactData(data);
      })
      .catch((err) => {
        console.error('Error fetching impact analysis:', err);
        setImpactData(null);
      })
      .finally(() => {
        setLoadingImpact(false);
      });
  }, [selectedNode, repoData.repoId]);

  const allDirPaths = useMemo(() => {
    return collectDirectoryPaths(repoData.fileTree);
  }, [repoData]);

  const handleToggleExpand = (path: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const handleExpandAll = () => {
    const nextMap: Record<string, boolean> = {};
    for (const p of allDirPaths) {
      nextMap[p] = true;
    }
    setExpandedMap(nextMap);
  };

  const handleCollapseAll = () => {
    setExpandedMap({ '': true });
  };

  // Navigate to any file path in the tree
  const handleNavigateToFile = (targetPath: string, line?: number) => {
    const targetNode = findNodeByPath(repoData.fileTree, targetPath);
    if (targetNode) {
      // Expand all parent directories of targetPath
      const parts = targetPath.split('/');
      const parentPaths: string[] = [''];
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        parentPaths.push(current);
      }

      setExpandedMap((prev) => {
        const updated = { ...prev };
        for (const p of parentPaths) {
          updated[p] = true;
        }
        return updated;
      });

      setSelectedNode(targetNode);
      onSelectPath?.(targetNode.path);
      if (line) {
        setTargetLine(line);
        setActiveTab('source');
      }
    }
  };

  // Filter tree based on search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return repoData.fileTree;

    const query = searchQuery.toLowerCase();

    function filterNode(node: FileNode): FileNode | null {
      if (node.name.toLowerCase().includes(query)) {
        return node;
      }

      if (node.type === 'directory' && node.children) {
        const filteredChildren = node.children
          .map((child) => filterNode(child))
          .filter((child): child is FileNode => child !== null);

        if (filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
          };
        }
      }

      return null;
    }

    return (
      filterNode(repoData.fileTree) || {
        name: repoData.fileTree.name,
        path: '',
        type: 'directory' as const,
        children: [],
      }
    );
  }, [repoData.fileTree, searchQuery]);

  // Dependencies for currently selected file
  const selectedFileDeps = useMemo(() => {
    if (!selectedNode || !depAnalysis || selectedNode.type !== 'file') return [];
    return depAnalysis.fileDependencies[selectedNode.path] || [];
  }, [selectedNode, depAnalysis]);

  return (
    <div className="file-explorer-container">
      {/* Repository Stats Banner */}
      <div className="repo-summary-bar">
        <div className="repo-info-group">
          <span className="repo-icon">📦</span>
          <div>
            <h3 className="repo-title">{repoData.repoName}</h3>
            <span className="repo-id-tag">ID: {repoData.repoId.slice(0, 8)}...</span>
          </div>
        </div>

        <div className="stats-badges">
          <div className="stat-pill">
            <span className="stat-label">Files</span>
            <span className="stat-value">{repoData.totalFiles}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">Directories</span>
            <span className="stat-value">{repoData.totalDirectories}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">Size</span>
            <span className="stat-value">{formatBytes(repoData.totalSize)}</span>
          </div>
          {depAnalysis && (
            <>
              <div className="stat-pill highlight">
                <span className="stat-label">Dependencies</span>
                <span className="stat-value">{depAnalysis.totalDependencies}</span>
              </div>
              <div className="stat-pill">
                <span className="stat-label">Local</span>
                <span className="stat-value">{depAnalysis.localDependencies}</span>
              </div>
              <div className="stat-pill">
                <span className="stat-label">External</span>
                <span className="stat-value">{depAnalysis.externalDependencies}</span>
              </div>
              {depAnalysis.unresolvedDependencies > 0 && (
                <div className="stat-pill warn">
                  <span className="stat-label">Unresolved</span>
                  <span className="stat-value">{depAnalysis.unresolvedDependencies}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="repo-actions-group">
          {onOpenGraph && (
            <button type="button" className="btn btn-primary" onClick={onOpenGraph}>
              🕸️ Dependency Graph
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onReset}>
            Upload Another Repo
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="explorer-toolbar">
        <div className="search-box-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Filter files by name (e.g. index.ts, .css)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className={`toolbar-btn toggle-sidebar-btn ${isTreeCollapsed ? 'active' : ''}`}
            onClick={() => setIsTreeCollapsed(!isTreeCollapsed)}
            title={isTreeCollapsed ? 'Expand File Explorer Sidebar' : 'Collapse File Explorer Sidebar to Maximize Code Space'}
          >
            {isTreeCollapsed ? '📂 Show Explorer' : '◀ Collapse Explorer'}
          </button>
          <button type="button" className="toolbar-btn" onClick={handleExpandAll}>
            Expand All
          </button>
          <button type="button" className="toolbar-btn" onClick={handleCollapseAll}>
            Collapse All
          </button>
        </div>
      </div>

      {/* Main Layout: Tree View + Resizer + File Inspector */}
      <div className={`explorer-main ${isTreeCollapsed ? 'tree-collapsed-layout' : ''}`} ref={containerRef}>
        {/* Tree Pane */}
        <div
          className={`tree-pane ${isTreeCollapsed ? 'collapsed' : ''}`}
          style={{ width: isTreeCollapsed ? '0%' : `${treeWidthPercent}%` }}
        >
          <div className="tree-header">
            <span>REPOSITORY STRUCTURE</span>
            <span>TYPE & SIZE</span>
          </div>
          <div className="tree-scroll-area">
            {filteredTree.children && filteredTree.children.length > 0 ? (
              <FileTreeNode
                node={filteredTree}
                depth={0}
                selectedPath={selectedNode?.path}
                onSelectNode={(node) => {
                  setSelectedNode(node);
                  if (node.type === 'file') {
                    onSelectPath?.(node.path);
                  }
                }}
                expandedMap={expandedMap}
                onToggleExpand={handleToggleExpand}
              />
            ) : (
              <div className="empty-search-state">
                <p>No files match "{searchQuery}"</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSearchQuery('')}
                >
                  Clear Filter
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Resizer Divider */}
        {!isTreeCollapsed && (
          <div
            className={`resizer-divider ${isDragging ? 'dragging' : ''}`}
            onMouseDown={handleDividerMouseDown}
            onDoubleClick={() => setTreeWidthPercent(32)}
            title="Drag to resize panels (Double-click to reset to 32%)"
          >
            <div className="resizer-handle-grip"></div>
          </div>
        )}

        {/* Selected File Details, Dependencies & Impact Pane */}
        <div
          className={`details-pane ${isTreeCollapsed ? 'expanded-full' : ''}`}
          style={{ width: isTreeCollapsed ? '100%' : `calc(${100 - treeWidthPercent}% - 8px)` }}
        >
          <div className="details-header-tabs">
            <button
              type="button"
              className={`tab-btn source-tab ${activeTab === 'source' ? 'active' : ''}`}
              onClick={() => setActiveTab('source')}
            >
              💻 Source Code
            </button>
            <button
              type="button"
              className={`tab-btn impact-tab ${activeTab === 'impact' ? 'active' : ''}`}
              onClick={() => setActiveTab('impact')}
            >
              ⚡ Impact Analysis {impactData && `(${impactData.totalAffectedFiles})`}
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'dependencies' ? 'active' : ''}`}
              onClick={() => setActiveTab('dependencies')}
            >
              Dependencies {selectedNode?.type === 'file' && `(${selectedFileDeps.length})`}
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              File Info
            </button>
          </div>

          {selectedNode ? (
            <div className={`inspector-content ${activeTab === 'source' ? 'source-active-mode' : ''}`}>
              {activeTab !== 'source' && (
                <div className="inspector-icon-hero">
                  <span className="big-icon">
                    {selectedNode.type === 'directory' ? '📁' : '📄'}
                  </span>
                  <h4 className="inspector-filename">{selectedNode.name}</h4>
                  <div className="hero-pills">
                    {selectedNode.extension && (
                      <span className={`file-badge ${getFileBadgeClass(selectedNode.extension)}`}>
                        {selectedNode.extension}
                      </span>
                    )}
                    {selectedNode.type === 'file' && (
                      <span className="hero-size-pill">{formatBytes(selectedNode.size)}</span>
                    )}
                    {impactData && (
                      <span className={`impact-summary-pill ${impactData.totalAffectedFiles > 0 ? 'affected' : 'safe'}`}>
                        {impactData.totalAffectedFiles > 0
                          ? `${impactData.totalAffectedFiles} Downstream Files Affected`
                          : '0 Downstream Dependents'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: Source Code */}
              {activeTab === 'source' ? (
                selectedNode.type === 'file' ? (
                  <SourceCodeViewer
                    repoId={repoData.repoId}
                    filePath={selectedNode.path}
                    targetLine={targetLine}
                    onNavigateToFile={handleNavigateToFile}
                    onSwitchToImpact={() => setActiveTab('impact')}
                  />
                ) : (
                  <div className="directory-dep-notice">
                    <p>Select any code or configuration file to view its source code.</p>
                  </div>
                )
              ) : activeTab === 'impact' ? (
                /* TAB 1: Impact Analysis */
                selectedNode.type === 'file' ? (
                  <ImpactViewer
                    impactData={impactData}
                    loading={loadingImpact}
                    onNavigateToFile={handleNavigateToFile}
                  />
                ) : (
                  <div className="directory-dep-notice">
                    <p>Select any code, config, or stylesheet file to run impact analysis.</p>
                  </div>
                )
              ) : activeTab === 'dependencies' ? (
                /* TAB 2: Dependencies */
                selectedNode.type === 'file' ? (
                  loadingDeps ? (
                    <div className="dep-loading-box">
                      <span className="spinner"></span> Parsing AST & extracting dependencies...
                    </div>
                  ) : (
                    <DependencyList
                      dependencies={selectedFileDeps}
                      onNavigateToFile={handleNavigateToFile}
                    />
                  )
                ) : (
                  <div className="directory-dep-notice">
                    <p>Select any code or stylesheet file to view its extracted dependencies.</p>
                  </div>
                )
              ) : (
                /* TAB 3: File Info */
                <div className="details-list">
                  <div className="detail-item">
                    <span className="detail-label">Relative Path:</span>
                    <span className="detail-value path-value">
                      {selectedNode.path || '/ (root)'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Item Type:</span>
                    <span className="detail-value capitalized">{selectedNode.type}</span>
                  </div>
                  {selectedNode.type === 'file' && (
                    <>
                      <div className="detail-item">
                        <span className="detail-label">Extension:</span>
                        <span className="detail-value">{selectedNode.extension || 'None'}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Exact File Size:</span>
                        <span className="detail-value">
                          {selectedNode.size?.toLocaleString()} bytes
                        </span>
                      </div>
                    </>
                  )}
                  {selectedNode.type === 'directory' && selectedNode.children && (
                    <div className="detail-item">
                      <span className="detail-label">Direct Items:</span>
                      <span className="detail-value">{selectedNode.children.length}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="no-selection-state">
              <p>Select any file from the repository tree to analyze its dependencies and change impact.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
