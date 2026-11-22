import dagre from 'dagre';
import { MarkerType, type Node, type Edge } from '@xyflow/react';
import type {
  CodeDependency,
  DependencyType,
  ImpactAnalysisResult,
  FileNode,
} from '../types/repo';

export interface GraphNodeData extends Record<string, unknown> {
  filePath: string;
  fileName: string;
  dirPath: string;
  extension: string;
  impactRole?: 'origin' | 'direct' | 'indirect' | 'unaffected';
  depth?: number;
  isSelected: boolean;
  isDimmed: boolean;
}

const EDGE_COLORS: Record<DependencyType, string> = {
  'import': '#818cf8',         // Indigo
  're-export': '#c084fc',      // Purple
  'dynamic-import': '#f472b6', // Pink
  'filesystem': '#fb923c',     // Orange
  'template': '#2dd4bf',       // Teal
  'css-import': '#facc15',     // Yellow
  'asset': '#eab308',          // Yellow/Gold
};

/**
 * Recursively extracts all individual file paths from a FileNode tree
 */
export function extractAllFiles(node: FileNode, files: FileNode[] = []): FileNode[] {
  if (node.type === 'file') {
    files.push(node);
  }
  if (node.children) {
    for (const child of node.children) {
      extractAllFiles(child, files);
    }
  }
  return files;
}

/**
 * Builds React Flow nodes and edges with Dagre automatic hierarchical layout
 */
export function buildGraphElements({
  allFiles,
  dependencies,
  selectedFilePath,
  impactData,
  graphMode = 'dependency', // 'dependency' (A -> B) or 'impact' (B -> A)
  direction = 'LR',         // 'LR' (Left-to-Right) or 'TB' (Top-to-Bottom)
}: {
  allFiles: FileNode[];
  dependencies: CodeDependency[];
  selectedFilePath?: string | null;
  impactData?: ImpactAnalysisResult | null;
  graphMode?: 'dependency' | 'impact';
  direction?: 'LR' | 'TB';
}): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  // 1. Filter local resolved dependencies
  const localDeps = dependencies.filter(
    (d) => d.targetKind === 'local' && d.status === 'resolved' && d.targetFile
  );

  // Set of files that are actually connected or present
  const allFilePathsSet = new Set<string>();
  for (const f of allFiles) {
    allFilePathsSet.add(f.path);
  }
  // Also ensure any target file from dependencies is present
  for (const d of localDeps) {
    if (d.targetFile) allFilePathsSet.add(d.targetFile);
    allFilePathsSet.add(d.sourceFile);
  }

  // 2. Determine impact roles if a file is selected for impact
  const directSet = new Map<string, number>();
  const indirectSet = new Map<string, number>();

  if (impactData && selectedFilePath) {
    for (const item of impactData.directImpactFiles) {
      directSet.set(item.filePath, item.depth);
    }
    for (const item of impactData.indirectImpactFiles) {
      indirectSet.set(item.filePath, item.depth);
    }
  }

  const hasActiveImpact = !!(selectedFilePath && impactData);

  // 3. Initialize Dagre graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: 35,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 58;

  // 4. Create Node Objects
  const nodeMap = new Map<string, Node<GraphNodeData>>();

  for (const filePath of allFilePathsSet) {
    const fileName = filePath.split('/').pop() || filePath;
    const parts = filePath.split('/');
    const dirPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    const extension = fileName.includes('.') ? `.${fileName.split('.').pop()}` : '';

    const isSelected = selectedFilePath === filePath;
    let impactRole: 'origin' | 'direct' | 'indirect' | 'unaffected' = 'unaffected';
    let depth: number | undefined;

    if (hasActiveImpact) {
      if (isSelected) {
        impactRole = 'origin';
        depth = 0;
      } else if (directSet.has(filePath)) {
        impactRole = 'direct';
        depth = directSet.get(filePath);
      } else if (indirectSet.has(filePath)) {
        impactRole = 'indirect';
        depth = indirectSet.get(filePath);
      } else {
        impactRole = 'unaffected';
      }
    }

    const isDimmed = hasActiveImpact && impactRole === 'unaffected';

    const nodeData: GraphNodeData = {
      filePath,
      fileName,
      dirPath,
      extension,
      impactRole,
      depth,
      isSelected,
      isDimmed,
    };

    const node: Node<GraphNodeData> = {
      id: filePath,
      type: 'customFileNode',
      data: nodeData,
      position: { x: 0, y: 0 }, // will be set by dagre
    };

    nodeMap.set(filePath, node);
    g.setNode(filePath, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // 5. Create Edge Objects
  const edges: Edge[] = [];
  const edgeDeduplicationSet = new Set<string>();

  for (const dep of localDeps) {
    if (!dep.targetFile) continue;

    // In 'dependency' mode: sourceFile -> targetFile (A imports B)
    // In 'impact' mode: targetFile -> sourceFile (changing B impacts A)
    const sourceNodeId = graphMode === 'dependency' ? dep.sourceFile : dep.targetFile;
    const targetNodeId = graphMode === 'dependency' ? dep.targetFile : dep.sourceFile;

    const edgeKey = `${sourceNodeId}-->${targetNodeId}`;
    if (edgeDeduplicationSet.has(edgeKey)) continue;
    edgeDeduplicationSet.add(edgeKey);

    g.setEdge(sourceNodeId, targetNodeId);

    const edgeColor = EDGE_COLORS[dep.type] || '#94a3b8';

    // Highlight edge if it connects nodes involved in the current impact blast radius
    const sourceIsOrigin = selectedFilePath === dep.targetFile;
    const targetIsDirect = directSet.has(dep.sourceFile);
    const isImpactEdge =
      hasActiveImpact &&
      (sourceIsOrigin ||
        targetIsDirect ||
        directSet.has(dep.targetFile) ||
        indirectSet.has(dep.targetFile));

    const edgeStroke = isImpactEdge
      ? sourceIsOrigin ? '#ef4444' : '#f59e0b'
      : edgeColor;

    edges.push({
      id: `edge-${dep.id}`,
      source: sourceNodeId,
      target: targetNodeId,
      animated: isImpactEdge,
      style: {
        stroke: edgeStroke,
        strokeWidth: isImpactEdge ? 2.5 : 1.5,
        opacity: hasActiveImpact && !isImpactEdge ? 0.25 : 0.85,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeStroke,
        width: 14,
        height: 14,
      },
      label: graphMode === 'dependency' ? dep.type : 'impacts',
      labelStyle: {
        fill: edgeStroke,
        fontWeight: 600,
        fontSize: 10,
      },
      labelBgStyle: {
        fill: '#0f172a',
        fillOpacity: 0.85,
      },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
    });
  }

  // 6. Run Dagre layout calculation
  dagre.layout(g);

  // 7. Apply calculated coordinates to React Flow nodes
  const layoutedNodes = Array.from(nodeMap.values()).map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
