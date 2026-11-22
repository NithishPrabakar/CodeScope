import { DependencyType } from './dependency.js';
import { ChangeRiskAnalysis, TestRecommendationsResult } from './risk.js';

export interface ImpactEdge {
  from: string; // file being changed or intermediate file
  to: string;   // affected file
  dependencyType: DependencyType;
  rawSpecifier: string;
  line?: number;
}

export interface AffectedFile {
  filePath: string;
  depth: number; // 1 for direct, 2+ for indirect
  impactType: 'direct' | 'indirect';
  impactPath: string[]; // e.g. ["src/utils/math.ts", "src/utils/index.ts", "src/index.ts"]
  connectingDependencies: DependencyType[]; // e.g. ['re-export', 'import']
}

export interface CycleInfo {
  cycle: string[]; // e.g. ["src/a.ts", "src/b.ts", "src/a.ts"]
  description: string;
}

export interface ImpactAnalysisResult {
  repoId: string;
  changedFile: string;
  totalAffectedFiles: number;
  maxDepth: number;
  directImpactCount: number;
  indirectImpactCount: number;
  directImpactFiles: AffectedFile[];
  indirectImpactFiles: AffectedFile[];
  affectedFiles: AffectedFile[];
  circularDependencies: CycleInfo[];
  hasCycleInPath: boolean;
  riskAnalysis?: ChangeRiskAnalysis;
  testRecommendations?: TestRecommendationsResult;
}
