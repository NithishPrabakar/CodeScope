import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  findMatchingTestFile,
  generateTestRecommendations,
} from '../src/analyzer/testRecommender.js';

describe('Test Recommender - Pattern Detection & Prioritization', () => {
  const sampleRepoFiles = [
    'src/utils/math.ts',
    'src/utils/math.test.ts',
    'src/components/Button.tsx',
    'src/components/__tests__/Button.spec.tsx',
    'src/services/authService.ts',
    'tests/authService.test.ts',
    'src/pages/Dashboard.tsx',
    'src/index.ts',
  ];

  test('Finds direct sibling test file', () => {
    const matched = findMatchingTestFile('src/utils/math.ts', sampleRepoFiles);
    assert.strictEqual(matched, 'src/utils/math.test.ts');
  });

  test('Finds test file in nested __tests__ folder', () => {
    const matched = findMatchingTestFile('src/components/Button.tsx', sampleRepoFiles);
    assert.strictEqual(matched, 'src/components/__tests__/Button.spec.tsx');
  });

  test('Finds test file in root tests/ folder', () => {
    const matched = findMatchingTestFile('src/services/authService.ts', sampleRepoFiles);
    assert.strictEqual(matched, 'tests/authService.test.ts');
  });

  test('Handles Windows-style backslashes gracefully', () => {
    const matched = findMatchingTestFile('src\\utils\\math.ts', [
      'src/utils/math.test.ts',
    ]);
    assert.strictEqual(matched, 'src/utils/math.test.ts');
  });

  test('Returns undefined when no test file exists without false claims', () => {
    const matched = findMatchingTestFile('src/pages/Dashboard.tsx', sampleRepoFiles);
    assert.strictEqual(matched, undefined, 'Must return undefined when no test exists');
  });

  test('Generates correctly ordered recommendations with accurate test statuses', () => {
    const result = generateTestRecommendations({
      changedFile: 'src/utils/math.ts',
      affectedFiles: [
        {
          filePath: 'src/services/authService.ts',
          depth: 1,
          impactType: 'direct',
          impactPath: ['src/utils/math.ts', 'src/services/authService.ts'],
          connectingDependencies: ['import'],
        },
        {
          filePath: 'src/pages/Dashboard.tsx',
          depth: 2,
          impactType: 'indirect',
          impactPath: ['src/utils/math.ts', 'src/services/authService.ts', 'src/pages/Dashboard.tsx'],
          connectingDependencies: ['import'],
        },
      ],
      allRepoFilePaths: sampleRepoFiles,
    });

    assert.strictEqual(result.totalRecommended, 3, 'Should recommend changed file + 2 affected files');
    assert.strictEqual(result.existingTestsCount, 2, '2 files have existing tests (math.ts and authService.ts)');
    assert.strictEqual(result.missingTestsCount, 1, '1 file missing tests (Dashboard.tsx)');

    // 1. Origin file
    const originRec = result.recommendations[0];
    assert.strictEqual(originRec.targetFile, 'src/utils/math.ts');
    assert.strictEqual(originRec.priority, 'critical');
    assert.strictEqual(originRec.hasExistingTest, true);
    assert.strictEqual(originRec.existingTestFile, 'src/utils/math.test.ts');

    // 2. Direct dependent (depth 1)
    const directRec = result.recommendations[1];
    assert.strictEqual(directRec.targetFile, 'src/services/authService.ts');
    assert.strictEqual(directRec.priority, 'high');
    assert.strictEqual(directRec.hasExistingTest, true);

    // 3. Indirect dependent (depth 2)
    const indirectRec = result.recommendations[2];
    assert.strictEqual(indirectRec.targetFile, 'src/pages/Dashboard.tsx');
    assert.strictEqual(indirectRec.priority, 'medium');
    assert.strictEqual(indirectRec.hasExistingTest, false);
    assert.strictEqual(indirectRec.existingTestFile, undefined);
  });
});
