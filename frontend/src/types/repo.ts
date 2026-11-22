export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  children?: FileNode[];
}

export interface RepositoryUploadResponse {
  repoId: string;
  repoName: string;
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  fileTree: FileNode;
}

export type DependencyType =
  | 'import'
  | 're-export'
  | 'dynamic-import'
  | 'filesystem'
  | 'template'
  | 'css-import'
  | 'asset';

export type DependencyTargetKind = 'local' | 'external' | 'unresolved';

export type DependencyStatus = 'resolved' | 'unresolved' | 'external' | 'dynamic';

export interface CodeDependency {
  id: string;
  sourceFile: string;
  targetFile?: string;
  type: DependencyType;
  rawSpecifier: string;
  targetKind: DependencyTargetKind;
  status: DependencyStatus;
  line?: number;
  details?: string;
}

export interface RepoDependencyAnalysis {
  repoId: string;
  totalDependencies: number;
  localDependencies: number;
  externalDependencies: number;
  unresolvedDependencies: number;
  dependencies: CodeDependency[];
  fileDependencies: Record<string, CodeDependency[]>;
}

export interface AffectedFile {
  filePath: string;
  depth: number;
  impactType: 'direct' | 'indirect';
  impactPath: string[];
  connectingDependencies: DependencyType[];
}

export interface CycleInfo {
  cycle: string[];
  description: string;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  name: string;
  points: number;
  maxPoints: number;
  description: string;
}

export interface ChangeRiskAnalysis {
  score: number; // 0 - 100
  level: RiskLevel;
  summary: string;
  factors: RiskFactor[];
}

export type TestPriority = 'critical' | 'high' | 'medium' | 'low';

export interface TestRecommendation {
  targetFile: string;
  priority: TestPriority;
  priorityOrder: number;
  reason: string;
  depth: number;
  existingTestFile?: string;
  hasExistingTest: boolean;
  suggestedAction: string;
}

export interface TestRecommendationsResult {
  totalRecommended: number;
  existingTestsCount: number;
  missingTestsCount: number;
  recommendations: TestRecommendation[];
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


export interface SourceFileResponse {
  repoId: string;
  filePath: string;
  content: string;
  size: number;
  totalLines: number;
  isBinary: boolean;
  isTruncated?: boolean;
  extension: string;
  message?: string;
  outgoingDependencies: CodeDependency[];
  incomingDependents: CodeDependency[];
}

export interface SavedRepositorySummary {
  id: string;
  name: string;
  fileCount: number;
  directoryCount: number;
  totalSize: number;
  storagePath: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  analysisCount: number;
}

export interface SavedAnalysisRecord {
  id: string;
  repoId: string;
  targetFile: string;
  analyzedAt: string;
  riskScore: number;
  riskLevel: RiskLevel;
  directImpactCount: number;
  indirectImpactCount: number;
  totalAffectedFiles: number;
  maxDepth: number;
  hasCycleInPath: boolean;
  riskFactors?: RiskFactor[];
  directImpactFiles: (AffectedFile | string)[];
  indirectImpactFiles: (AffectedFile | string)[];
  affectedFiles: (AffectedFile | string)[];
  impactChains?: any[];
  testRecommendations?: TestRecommendation[];
}

