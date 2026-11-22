import React, { useState, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { FileNodeComponent } from './FileNodeComponent';
import { buildGraphElements, extractAllFiles } from '../utils/graphBuilder';
import type { GraphNodeData } from '../utils/graphBuilder';
import type {
  FileNode,
  CodeDependency,
  ImpactAnalysisResult,
} from '../types/repo';

interface DependencyGraphProps {
  fileTree: FileNode;
  dependencies: CodeDependency[];
  selectedFilePath: string | null;
  impactData: ImpactAnalysisResult | null;
  onSelectFile: (filePath: string) => void;
  onSwitchToExplorer?: () => void;
  onViewSource?: (filePath: string) => void;
}

const nodeTypes = {
  customFileNode: FileNodeComponent,
};

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
  fileTree,
  dependencies,
  selectedFilePath,
  impactData,
  onSelectFile,
  onSwitchToExplorer,
  onViewSource,
}) => {
  const [graphMode, setGraphMode] = useState<'dependency' | 'impact'>('impact');
  const [direction, setDirection] = useState<'LR' | 'TB'>('LR');
  const [showLegend, setShowLegend] = useState(true);

  // Extract all files from fileTree
  const allFiles = useMemo(() => extractAllFiles(fileTree), [fileTree]);

  // Compute layouted nodes and edges
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    return buildGraphElements({
      allFiles,
      dependencies,
      selectedFilePath,
      impactData,
      graphMode,
      direction,
    });
  }, [allFiles, dependencies, selectedFilePath, impactData, graphMode, direction]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges whenever initial elements change
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Handle node selection
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onSelectFile(node.id);
    },
    [onSelectFile]
  );

  return (
    <div className="graph-wrapper">
      {/* Graph Toolbar */}
      <div className="graph-toolbar">
        <div className="toolbar-left">
          <div className="mode-toggle-group">
            <button
              type="button"
              className={`mode-btn ${graphMode === 'impact' ? 'active' : ''}`}
              onClick={() => setGraphMode('impact')}
              title="Show downstream impact flow (B ➔ A: Changing B affects A)"
            >
              ⚡ Impact Flow View (B ➔ A)
            </button>
            <button
              type="button"
              className={`mode-btn ${graphMode === 'dependency' ? 'active' : ''}`}
              onClick={() => setGraphMode('dependency')}
              title="Show code imports & references (A ➔ B: A imports B)"
            >
              📦 Code Dependency View (A ➔ B)
            </button>
          </div>

          <div className="layout-toggle-group">
            <button
              type="button"
              className={`layout-btn ${direction === 'LR' ? 'active' : ''}`}
              onClick={() => setDirection('LR')}
              title="Left-to-Right Layout"
            >
              Horizontal (L-R)
            </button>
            <button
              type="button"
              className={`layout-btn ${direction === 'TB' ? 'active' : ''}`}
              onClick={() => setDirection('TB')}
              title="Top-to-Bottom Layout"
            >
              Vertical (T-B)
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          {selectedFilePath && (
            <button
              type="button"
              className="graph-btn secondary"
              onClick={() => onSelectFile('')}
              title="Clear active node selection and un-dim graph"
            >
              Clear Selection
            </button>
          )}

          <button
            type="button"
            className={`graph-btn ${showLegend ? 'active' : ''}`}
            onClick={() => setShowLegend(!showLegend)}
          >
            {showLegend ? 'Hide Legend' : 'Show Legend'}
          </button>

          {onSwitchToExplorer && (
            <button
              type="button"
              className="graph-btn primary"
              onClick={onSwitchToExplorer}
            >
              📁 File Explorer View
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="graph-canvas-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.15}
          maxZoom={2.5}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#334155" />
          <Controls className="custom-react-flow-controls" />
          <MiniMap
            className="custom-react-flow-minimap"
            nodeColor={(n) => {
              const d = n.data as unknown as GraphNodeData;
              if (d.impactRole === 'origin') return '#38bdf8';
              if (d.impactRole === 'direct') return '#ef4444';
              if (d.impactRole === 'indirect') return '#f59e0b';
              return '#475569';
            }}
            maskColor="rgba(11, 17, 32, 0.75)"
          />
        </ReactFlow>

        {/* Selected File Floating Action Panel */}
        {selectedFilePath && impactData && (
          <div className="floating-impact-panel">
            <div className="floating-panel-header">
              <span className="floating-tag">Selected Changed File</span>
              <button
                type="button"
                className="close-panel-btn"
                onClick={() => onSelectFile('')}
              >
                ✕
              </button>
            </div>
            <h4 className="floating-filename">{selectedFilePath}</h4>

            <div className="floating-stats-row">
              <div className="floating-stat">
                <span className="fstat-val total">{impactData.totalAffectedFiles}</span>
                <span className="fstat-lbl">Total Affected</span>
              </div>
              <div className="floating-stat">
                <span className="fstat-val direct">{impactData.directImpactCount}</span>
                <span className="fstat-lbl">Direct (Depth 1)</span>
              </div>
              <div className="floating-stat">
                <span className="fstat-val indirect">{impactData.indirectImpactCount}</span>
                <span className="fstat-lbl">Indirect (Depth 2+)</span>
              </div>
              <div className="floating-stat">
                <span className="fstat-val depth">{impactData.maxDepth}</span>
                <span className="fstat-lbl">Max Depth</span>
              </div>
            </div>

            {/* Stage 6: Risk & Test Recommendation Overview */}
            {impactData.riskAnalysis && (
              <div className={`floating-risk-badge risk-${impactData.riskAnalysis.level}`}>
                <div className="frisk-header">
                  <span className="frisk-title">Change Risk:</span>
                  <span className="frisk-level">{impactData.riskAnalysis.level.toUpperCase()} ({impactData.riskAnalysis.score}/100)</span>
                </div>
                <p className="frisk-summary">{impactData.riskAnalysis.summary}</p>
              </div>
            )}

            {impactData.testRecommendations && (
              <div className="floating-test-summary">
                <span className="ftest-title">🧪 Test Recommendations:</span>
                <span className="ftest-counts">
                  {impactData.testRecommendations.existingTestsCount} test(s) detected, {impactData.testRecommendations.missingTestsCount} without tests
                </span>
              </div>
            )}

            {impactData.hasCycleInPath && (
              <div className="floating-cycle-warning">
                <span>🔄 Part of a circular dependency cycle</span>
              </div>
            )}

            <div className="floating-actions-col">
              {onViewSource && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm full-width"
                  onClick={() => onViewSource(selectedFilePath)}
                >
                  💻 View Source Code ➔
                </button>
              )}
              {onSwitchToExplorer && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm full-width"
                  onClick={onSwitchToExplorer}
                >
                  Inspect Impact in Explorer ➔
                </button>
              )}
            </div>
          </div>
        )}

        {/* Graph Legend */}
        {showLegend && (
          <div className="graph-legend-overlay">
            <div className="legend-title">GRAPH VISUALIZATION LEGEND</div>

            <div className="legend-section">
              <span className="legend-sub">IMPACT ROLES:</span>
              <div className="legend-items-grid">
                <div className="legend-item">
                  <span className="legend-chip chip-origin"></span>
                  <span>Changed File (Origin)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-chip chip-direct"></span>
                  <span>Direct Impact (Depth 1)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-chip chip-indirect"></span>
                  <span>Indirect Impact (Depth 2+)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-chip chip-unaffected"></span>
                  <span>Unaffected / Dimmed</span>
                </div>
              </div>
            </div>

            <div className="legend-section">
              <span className="legend-sub">DEPENDENCY TYPES:</span>
              <div className="legend-items-grid">
                <div className="legend-item">
                  <span className="legend-line line-import"></span>
                  <span>import</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line line-re-export"></span>
                  <span>re-export</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line line-dynamic-import"></span>
                  <span>dynamic import</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line line-filesystem"></span>
                  <span>filesystem (fs)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line line-template"></span>
                  <span>template render</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line line-css"></span>
                  <span>css & assets</span>
                </div>
              </div>
            </div>

            <div className="legend-note">
              <span>💡 Tip: Click any node to highlight its blast radius. Drag canvas to pan, scroll to zoom.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
