import path from 'path';
import { AffectedFile } from '../types/impact.js';
import {
  TestPriority,
  TestRecommendation,
  TestRecommendationsResult,
} from '../types/risk.js';

interface TestRecommenderInput {
  changedFile: string;
  affectedFiles: AffectedFile[];
  allRepoFilePaths: string[];
}

/**
 * Searches for an existing test file corresponding to a given source file path.
 * Checks for standard conventions: .test.ts, .spec.ts, __tests__/, tests/, test/.
 * Normalizes all path separators to '/' so it works reliably across Windows and POSIX.
 */
export function findMatchingTestFile(
  sourceFilePath: string,
  allRepoFilePaths: string[]
): string | undefined {
  const normSource = sourceFilePath.replace(/\\/g, '/');
  const normalizedRepoPaths = allRepoFilePaths.map((p) => p.replace(/\\/g, '/'));
  const baseNameWithoutExt = path.basename(normSource, path.extname(normSource));
  const dirName = path.dirname(normSource);

  const candidateSuffixes = [
    `.test${path.extname(normSource)}`,
    `.spec${path.extname(normSource)}`,
    '.test.ts',
    '.spec.ts',
    '.test.tsx',
    '.spec.tsx',
    '.test.js',
    '.spec.js',
  ];

  // 1. Direct sibling test: e.g. src/utils/math.test.ts
  for (const suffix of candidateSuffixes) {
    const candidate = dirName === '.'
      ? `${baseNameWithoutExt}${suffix}`
      : `${dirName}/${baseNameWithoutExt}${suffix}`;
    if (normalizedRepoPaths.includes(candidate)) {
      return candidate;
    }
  }

  // 2. __tests__ directory in same folder: e.g. src/utils/__tests__/math.test.ts
  for (const suffix of candidateSuffixes) {
    const candidate = dirName === '.'
      ? `__tests__/${baseNameWithoutExt}${suffix}`
      : `${dirName}/__tests__/${baseNameWithoutExt}${suffix}`;
    if (normalizedRepoPaths.includes(candidate)) {
      return candidate;
    }
  }

  // 3. Root tests/ or test/ or __tests__/ folder: e.g. tests/math.test.ts or test/math.test.ts
  for (const suffix of candidateSuffixes) {
    for (const testDir of ['tests', 'test', '__tests__']) {
      const candidate = `${testDir}/${baseNameWithoutExt}${suffix}`;
      if (normalizedRepoPaths.includes(candidate)) {
        return candidate;
      }
    }
  }

  // 4. Fuzzy search across repo for files ending in <baseName>.test.* or <baseName>.spec.*
  const fuzzy = normalizedRepoPaths.find((p) => {
    const b = path.basename(p);
    return (
      b.startsWith(`${baseNameWithoutExt}.test.`) ||
      b.startsWith(`${baseNameWithoutExt}.spec.`)
    );
  });

  return fuzzy;
}

/**
 * Generates prioritized, explainable test recommendations based on impact depth,
 * direct vs indirect callers, and detected existing test suites.
 */
export function generateTestRecommendations(
  input: TestRecommenderInput
): TestRecommendationsResult {
  const { changedFile, affectedFiles, allRepoFilePaths } = input;

  const recommendations: TestRecommendation[] = [];
  let order = 1;

  // 1. Changed file itself: Run its own unit test first!
  const originTestFile = findMatchingTestFile(changedFile, allRepoFilePaths);
  recommendations.push({
    targetFile: changedFile,
    priority: 'critical',
    priorityOrder: order++,
    depth: 0,
    existingTestFile: originTestFile,
    hasExistingTest: !!originTestFile,
    reason: 'Origin file being modified. Must verify its unit tests before validating downstream callers.',
    suggestedAction: originTestFile
      ? `Execute test suite: ${originTestFile}`
      : 'Write unit tests for this module to establish a baseline before refactoring.',
  });

  // Sort affected files by depth ascending
  const sortedAffected = [...affectedFiles].sort((a, b) => a.depth - b.depth);

  for (const affected of sortedAffected) {
    const matchingTest = findMatchingTestFile(affected.filePath, allRepoFilePaths);

    let priority: TestPriority = 'medium';
    let reason = '';
    let suggestedAction = '';

    if (affected.depth === 1) {
      priority = 'high';
      reason = `Direct consumer (${affected.connectingDependencies.join(', ')}). High risk of immediate compilation or runtime breakage.`;
      suggestedAction = matchingTest
        ? `Run direct test: ${matchingTest}`
        : `Verify consumer behavior in ${affected.filePath}`;
    } else if (affected.depth === 2) {
      priority = 'medium';
      reason = `Secondary dependent (Depth 2). Relies on immediate consumers. Verify integration behavior.`;
      suggestedAction = matchingTest
        ? `Run integration test: ${matchingTest}`
        : `Perform regression check on ${affected.filePath}`;
    } else {
      priority = 'low';
      reason = `Transitive dependent at Depth ${affected.depth}. Lower regression risk; verify in full end-to-end suite.`;
      suggestedAction = matchingTest
        ? `Run e2e/regression test: ${matchingTest}`
        : `Check end-to-end flow passing through ${affected.filePath}`;
    }

    recommendations.push({
      targetFile: affected.filePath,
      priority,
      priorityOrder: order++,
      depth: affected.depth,
      existingTestFile: matchingTest,
      hasExistingTest: !!matchingTest,
      reason,
      suggestedAction,
    });
  }

  const existingTestsCount = recommendations.filter((r) => r.hasExistingTest).length;
  const missingTestsCount = recommendations.length - existingTestsCount;

  return {
    totalRecommended: recommendations.length,
    existingTestsCount,
    missingTestsCount,
    recommendations,
  };
}
