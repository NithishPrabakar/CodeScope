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
  priorityOrder: number; // 1, 2, 3...
  reason: string;
  depth: number;
  existingTestFile?: string; // e.g. "src/utils/math.test.ts"
  hasExistingTest: boolean;
  suggestedAction: string; // e.g. "Run existing unit test" or "Create regression test"
}

export interface TestRecommendationsResult {
  totalRecommended: number;
  existingTestsCount: number;
  missingTestsCount: number;
  recommendations: TestRecommendation[];
}
