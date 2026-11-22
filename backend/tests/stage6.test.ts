import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateChangeRisk } from '../src/analyzer/riskEngine.js';
import { generateTestRecommendations } from '../src/analyzer/testRecommender.js';

describe('Stage 6 End-to-End Pipeline Verification', () => {
  test('Complete Risk and Test Recommendation generation for typical repo structure', () => {
    const allRepoFiles = [
      'src/utils/math.ts',
      'src/utils/math.test.ts',
      'src/services/calcService.ts',
      'src/components/Calculator.tsx',
      'src/components/__tests__/Calculator.test.tsx',
      'src/pages/Dashboard.tsx',
      'src/index.ts',
    ];

    const affectedFiles = [
      {
        filePath: 'src/services/calcService.ts',
        depth: 1,
        impactType: 'direct' as const,
        impactPath: ['src/utils/math.ts', 'src/services/calcService.ts'],
        connectingDependencies: ['import' as const],
      },
      {
        filePath: 'src/components/Calculator.tsx',
        depth: 2,
        impactType: 'indirect' as const,
        impactPath: ['src/utils/math.ts', 'src/services/calcService.ts', 'src/components/Calculator.tsx'],
        connectingDependencies: ['import' as const],
      },
      {
        filePath: 'src/pages/Dashboard.tsx',
        depth: 3,
        impactType: 'indirect' as const,
        impactPath: ['src/utils/math.ts', 'src/services/calcService.ts', 'src/components/Calculator.tsx', 'src/pages/Dashboard.tsx'],
        connectingDependencies: ['import' as const],
      },
    ];

    // 1. Calculate risk
    const risk = calculateChangeRisk({
      changedFile: 'src/utils/math.ts',
      directImpactCount: 1,
      indirectImpactCount: 2,
      totalAffectedFiles: 3,
      maxDepth: 3,
      hasCycleInPath: false,
      totalRepoFiles: allRepoFiles.length,
      directImpactFiles: affectedFiles.filter((f) => f.depth === 1),
    });

    // 2. Generate recommendations
    const testRecs = generateTestRecommendations({
      changedFile: 'src/utils/math.ts',
      affectedFiles,
      allRepoFilePaths: allRepoFiles,
    });

    // Verify mathematical integrity of risk score
    const factorSum = risk.factors.reduce((sum, f) => sum + f.points, 0);
    assert.strictEqual(risk.score, factorSum, 'Risk score must exactly equal sum of factor points');
    assert.ok(risk.score > 0 && risk.score <= 100);

    // Verify test recommendations count and ordering
    assert.strictEqual(testRecs.totalRecommended, 4);
    assert.strictEqual(testRecs.existingTestsCount, 2); // math.ts and Calculator.tsx
    assert.strictEqual(testRecs.missingTestsCount, 2); // calcService.ts and Dashboard.tsx
    assert.strictEqual(testRecs.recommendations[0].priority, 'critical');
    assert.strictEqual(testRecs.recommendations[1].priority, 'high');
    assert.strictEqual(testRecs.recommendations[2].priority, 'medium');
    assert.strictEqual(testRecs.recommendations[3].priority, 'low');
  });
});
