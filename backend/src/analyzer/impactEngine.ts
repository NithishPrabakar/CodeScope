import { CodeDependency, DependencyType } from '../types/dependency.js';
import {
  AffectedFile,
  CycleInfo,
  ImpactAnalysisResult,
  ImpactEdge,
} from '../types/impact.js';

interface AdjacencyEdge {
  dependentFile: string;
  type: DependencyType;
  rawSpecifier: string;
  line?: number;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Builds the reverse dependency graph (Impact Graph):
 * If file A depends on file B, changing B impacts A.
 * Reverse graph edge: B -> A
 */
export function buildImpactAdjacencyList(
  dependencies: CodeDependency[]
): Map<string, AdjacencyEdge[]> {
  const impactMap = new Map<string, AdjacencyEdge[]>();

  for (const dep of dependencies) {
    // Only traverse local, resolved dependencies
    if (dep.targetKind !== 'local' || dep.status !== 'resolved' || !dep.targetFile) {
      continue;
    }

    const providerFile = normalizePath(dep.targetFile);
    const dependentFile = normalizePath(dep.sourceFile);

    if (!impactMap.has(providerFile)) {
      impactMap.set(providerFile, []);
    }

    const edges = impactMap.get(providerFile)!;
    // Prevent duplicate exact edges
    const exists = edges.some(
      (e) => e.dependentFile === dependentFile && e.type === dep.type
    );
    if (!exists) {
      edges.push({
        dependentFile,
        type: dep.type,
        rawSpecifier: dep.rawSpecifier,
        line: dep.line,
      });
    }
  }

  return impactMap;
}

/**
 * Detects circular dependencies within the impact graph using DFS cycle finding.
 */
export function detectCycles(
  impactMap: Map<string, AdjacencyEdge[]>,
  startNode?: string
): CycleInfo[] {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const pathStack: string[] = [];
  const foundCycles: CycleInfo[] = [];
  const cycleSignatures = new Set<string>();

  function dfs(node: string) {
    visited.add(node);
    recStack.add(node);
    pathStack.push(node);

    const neighbors = impactMap.get(node) || [];
    for (const edge of neighbors) {
      const neighbor = edge.dependentFile;

      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        // Cycle detected!
        const cycleStartIndex = pathStack.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cycleNodes = pathStack.slice(cycleStartIndex).concat(neighbor);
          // Normalize cycle representation to avoid duplicate permutations
          const innerCycle = cycleNodes.slice(0, -1);
          const minIndex = innerCycle.reduce(
            (minIdx, curr, idx, arr) => (curr < arr[minIdx] ? idx : minIdx),
            0
          );
          const canonical = innerCycle
            .slice(minIndex)
            .concat(innerCycle.slice(0, minIndex))
            .join(' -> ');

          if (!cycleSignatures.has(canonical)) {
            cycleSignatures.add(canonical);
            foundCycles.push({
              cycle: cycleNodes,
              description: `Cycle detected: ${cycleNodes.join(' ➔ ')}`,
            });
          }
        }
      }
    }

    recStack.delete(node);
    pathStack.pop();
  }

  if (startNode) {
    const normalizedStart = normalizePath(startNode);
    dfs(normalizedStart);
  } else {
    for (const node of impactMap.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }
  }

  return foundCycles;
}

/**
 * Analyzes the direct and indirect impact of modifying a specific target file.
 * Uses Breadth-First Search (BFS) to identify shortest dependency paths and depths
 * without infinite loops even in the presence of circular dependencies.
 */
export function analyzeImpact(
  dependencies: CodeDependency[],
  changedFile: string,
  repoId: string
): ImpactAnalysisResult {
  const normalizedTarget = normalizePath(changedFile);
  const impactMap = buildImpactAdjacencyList(dependencies);

  // 1. Detect any cycles reachable from or relevant to the changed file
  const relevantCycles = detectCycles(impactMap, normalizedTarget);
  const allRepoCycles = detectCycles(impactMap);

  // 2. BFS Traversal for shortest impact path and depth
  interface QueueItem {
    current: string;
    depth: number;
    path: string[];
    connectingDependencies: DependencyType[];
  }

  const queue: QueueItem[] = [
    {
      current: normalizedTarget,
      depth: 0,
      path: [normalizedTarget],
      connectingDependencies: [],
    },
  ];

  // Map of shortest visited depth per affected file
  const visitedBestDepth = new Map<string, AffectedFile>();

  while (queue.length > 0) {
    const { current, depth, path, connectingDependencies } = queue.shift()!;

    const neighbors = impactMap.get(current) || [];

    for (const edge of neighbors) {
      const neighbor = edge.dependentFile;
      const nextDepth = depth + 1;
      const nextPath = [...path, neighbor];
      const nextDeps = [...connectingDependencies, edge.type];

      // Avoid self-loop or returning to start in shortest path
      if (neighbor === normalizedTarget) {
        continue;
      }

      // If already visited at an equal or shorter depth, do not re-queue
      const existing = visitedBestDepth.get(neighbor);
      if (existing && existing.depth <= nextDepth) {
        continue;
      }

      const affectedItem: AffectedFile = {
        filePath: neighbor,
        depth: nextDepth,
        impactType: nextDepth === 1 ? 'direct' : 'indirect',
        impactPath: nextPath,
        connectingDependencies: nextDeps,
      };

      visitedBestDepth.set(neighbor, affectedItem);

      queue.push({
        current: neighbor,
        depth: nextDepth,
        path: nextPath,
        connectingDependencies: nextDeps,
      });
    }
  }

  // Convert visited map to sorted list
  const allAffected = Array.from(visitedBestDepth.values());

  // Sort by depth ascending, then alphabetically by file path
  allAffected.sort((a, b) => {
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }
    return a.filePath.localeCompare(b.filePath);
  });

  const directImpactFiles = allAffected.filter((f) => f.depth === 1);
  const indirectImpactFiles = allAffected.filter((f) => f.depth > 1);

  const maxDepth = allAffected.reduce((max, f) => Math.max(max, f.depth), 0);

  // Check if any cycle involves any node along the impact paths
  const affectedSet = new Set(allAffected.map((a) => a.filePath));
  affectedSet.add(normalizedTarget);

  const cyclesInPath = allRepoCycles.filter((c) =>
    c.cycle.some((node) => affectedSet.has(node))
  );

  return {
    repoId,
    changedFile: normalizedTarget,
    totalAffectedFiles: allAffected.length,
    maxDepth,
    directImpactCount: directImpactFiles.length,
    indirectImpactCount: indirectImpactFiles.length,
    directImpactFiles,
    indirectImpactFiles,
    affectedFiles: allAffected,
    circularDependencies: cyclesInPath,
    hasCycleInPath: cyclesInPath.length > 0,
  };
}
