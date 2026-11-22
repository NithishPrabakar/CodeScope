import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateChangeRisk } from '../src/analyzer/riskEngine.js';

describe('Risk Engine - Mathematical Integrity & Factors', () => {
  test('Zero affected files (leaf module): all factors evaluate to 0 and score is 0/100', () => {
    const result = calculateChangeRisk({
      changedFile: 'src/components/Leaf.tsx',
      directImpactCount: 0,
      indirectImpactCount: 0,
      totalAffectedFiles: 0,
      maxDepth: 0,
      hasCycleInPath: false,
      totalRepoFiles: 12,
      directImpactFiles: [],
    });

    const factorSum = result.factors.reduce((sum, f) => sum + f.points, 0);

    // Verify all 5 factors exist and are 0 points
    assert.strictEqual(result.factors.length, 5, 'Must contain all 5 standard architectural factors');
    for (const factor of result.factors) {
      assert.strictEqual(
        factor.points,
        0,
        `Factor ${factor.name} must be 0 points when there are 0 affected files`
      );
    }

    assert.strictEqual(result.score, 0, 'Score must be exactly 0 for isolated leaf module');
    assert.strictEqual(result.level, 'low', 'Risk level must be low');
    assert.strictEqual(factorSum, 0, 'Sum of factor points must be 0');
    assert.strictEqual(factorSum, result.score, 'Sum of factor points must equal final score');
    assert.ok(
      result.summary.includes('(0/100)'),
      'Summary must include exact score (0/100)'
    );
  });

  test('Single direct dependent, depth 1: breakdown sum matches score exactly', () => {
    // 1 direct (1 * 12 = 12 pts), 0 indirect (0 pts), depth 1 (4 pts), centrality (1/10 = 10% * 15 = 1.5 -> 2 pts), 0 cycle
    // Total = 12 + 0 + 4 + 2 + 0 = 18 pts
    const result = calculateChangeRisk({
      changedFile: 'src/utils/helper.ts',
      directImpactCount: 1,
      indirectImpactCount: 0,
      totalAffectedFiles: 1,
      maxDepth: 1,
      hasCycleInPath: false,
      totalRepoFiles: 10,
      directImpactFiles: [] as any,
    });

    const factorSum = result.factors.reduce((sum, f) => sum + f.points, 0);

    assert.strictEqual(factorSum, result.score, 'Sum of factor points must equal final score');
    assert.strictEqual(result.score, 18, 'Expected score: 12 (direct) + 4 (depth) + 2 (centrality) = 18');
    assert.strictEqual(result.level, 'low', '18 pts is low risk (<= 25)');
    assert.ok(result.summary.includes('18/100'), 'Summary must contain 18/100');
  });

  test('Multi-level ripple effect (Stage 4 math.ts scenario): factors sum to score', () => {
    // 2 direct (2 * 12 = 24 pts)
    // 3 indirect (3 * 6 = 18 pts)
    // maxDepth = 3 (12 pts)
    // centrality: 5/10 = 50% * 15 = 7.5 -> 8 pts
    // cycle: false (0 pts)
    // Expected sum = 24 + 18 + 12 + 8 + 0 = 62 pts
    const result = calculateChangeRisk({
      changedFile: 'src/utils/math.ts',
      directImpactCount: 2,
      indirectImpactCount: 3,
      totalAffectedFiles: 5,
      maxDepth: 3,
      hasCycleInPath: false,
      totalRepoFiles: 10,
      directImpactFiles: [] as any,
    });

    const factorSum = result.factors.reduce((sum, f) => sum + f.points, 0);

    assert.strictEqual(factorSum, result.score, 'Sum of factor points must equal final score');
    assert.strictEqual(result.score, 62, 'Score should be exactly 62');
    assert.strictEqual(result.level, 'high', '62 pts should be high risk (51-75)');

    // Verify summary contains all exact factor names and points
    for (const factor of result.factors) {
      assert.ok(
        result.summary.includes(`${factor.name}: ${factor.points} pts`),
        `Summary must contain exact factor breakdown for ${factor.name}`
      );
    }
  });

  test('Circular dependency adds 10 points penalty and sums to score', () => {
    // 2 direct (24), 2 indirect (12), depth 2 (8), centrality (4/8 = 50% * 15 = 8), cycle (10)
    // Sum = 24 + 12 + 8 + 8 + 10 = 62 pts
    const result = calculateChangeRisk({
      changedFile: 'src/services/api.ts',
      directImpactCount: 2,
      indirectImpactCount: 2,
      totalAffectedFiles: 4,
      maxDepth: 2,
      hasCycleInPath: true,
      totalRepoFiles: 8,
      directImpactFiles: [] as any,
    });

    const factorSum = result.factors.reduce((sum, f) => sum + f.points, 0);
    const cycleFactor = result.factors.find((f) => f.name === 'Circular Dependency Penalty');

    assert.ok(cycleFactor, 'Circular dependency factor must be present');
    assert.strictEqual(cycleFactor?.points, 10, 'Circular dependency should add 10 points');
    assert.strictEqual(factorSum, result.score, 'Sum of factor points must equal final score');
    assert.strictEqual(result.score, 62, 'Score must equal 62');
  });

  test('High blast radius capping: factors do not exceed maxPoints and sum matches score', () => {
    // Large repo impact: 10 direct (cap 35), 10 indirect (cap 25), depth 5 (cap 15), centrality 100% (cap 15), cycle (10)
    // 35 + 25 + 15 + 15 + 10 = 100 pts
    const result = calculateChangeRisk({
      changedFile: 'src/core/kernel.ts',
      directImpactCount: 10,
      indirectImpactCount: 10,
      totalAffectedFiles: 20,
      maxDepth: 5,
      hasCycleInPath: true,
      totalRepoFiles: 20,
      directImpactFiles: [] as any,
    });

    const factorSum = result.factors.reduce((sum, f) => sum + f.points, 0);

    for (const factor of result.factors) {
      assert.ok(
        factor.points <= factor.maxPoints,
        `Factor ${factor.name} (${factor.points}) exceeded maxPoints (${factor.maxPoints})`
      );
    }

    assert.strictEqual(factorSum, result.score, 'Sum of factor points must equal final score');
    assert.strictEqual(result.score, 100, 'Capped maximum score should be 100');
    assert.strictEqual(result.level, 'critical', '100 pts must be critical risk');
  });

  test('Mathematical Consistency across varied randomized configurations', () => {
    const testCases = [
      { direct: 0, indirect: 0, total: 0, depth: 0, cycle: false, repo: 20 },
      { direct: 1, indirect: 1, total: 2, depth: 2, cycle: false, repo: 15 },
      { direct: 3, indirect: 0, total: 3, depth: 1, cycle: false, repo: 10 },
      { direct: 4, indirect: 6, total: 10, depth: 4, cycle: true, repo: 12 },
      { direct: 1, indirect: 4, total: 5, depth: 3, cycle: false, repo: 50 },
    ];

    for (const tc of testCases) {
      const res = calculateChangeRisk({
        changedFile: 'test.ts',
        directImpactCount: tc.direct,
        indirectImpactCount: tc.indirect,
        totalAffectedFiles: tc.total,
        maxDepth: tc.depth,
        hasCycleInPath: tc.cycle,
        totalRepoFiles: tc.repo,
        directImpactFiles: [] as any,
      });

      const sum = res.factors.reduce((acc, f) => acc + f.points, 0);
      assert.strictEqual(
        sum,
        res.score,
        `Mismatch for case direct=${tc.direct}, indirect=${tc.indirect}: sum=${sum}, score=${res.score}`
      );
      assert.ok(res.score >= 0 && res.score <= 100, 'Score must be bounded between 0 and 100');
      assert.ok(
        res.summary.includes(`(${res.score}/100)`),
        'Summary must include matching score'
      );
    }
  });
});
