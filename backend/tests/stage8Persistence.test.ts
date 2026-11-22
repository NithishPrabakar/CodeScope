import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  persistRepositoryRecord,
  listAllRepositories,
  getRepositoryRecord,
  deleteRepositoryRecord,
  persistAnalysisRecord,
  listRepositoryAnalyses,
  getAnalysisRecord,
} from '../src/services/repoDbService.js';
import { isDatabaseConnected } from '../src/db/prisma.js';
import { FileNode } from '../src/types/fileTree.js';
import { ImpactAnalysisResult } from '../src/types/impact.js';

describe('Stage 8 — Database Persistence & Analysis History', () => {
  const testExtractedDir = path.resolve('uploads', 'extracted');
  const mockRepoId = `test-repo-${uuidv4()}`;
  const mockRepoDir = path.join(testExtractedDir, mockRepoId);

  const mockFileTree: FileNode = {
    name: 'test-repo',
    path: '',
    type: 'directory',
    children: [
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [
          { name: 'index.ts', path: 'src/index.ts', type: 'file', size: 1024, extension: '.ts' },
          { name: 'math.ts', path: 'src/utils/math.ts', type: 'file', size: 512, extension: '.ts' },
        ],
      },
      { name: 'package.json', path: 'package.json', type: 'file', size: 300, extension: '.json' },
    ],
  };

  test('Graceful Database Connectivity Detection', async () => {
    // Should return boolean without throwing any exception
    const isConnected = await isDatabaseConnected();
    assert.equal(typeof isConnected, 'boolean', 'isDatabaseConnected should return a boolean');
  });

  test('Repository Persistence & Retrieval Pipeline', async () => {
    // Setup temporary folder on disk to simulate uploaded repository
    fs.mkdirSync(mockRepoDir, { recursive: true });
    fs.writeFileSync(path.join(mockRepoDir, 'package.json'), '{}', 'utf-8');

    // 1. Persist repository
    await persistRepositoryRecord(
      mockRepoId,
      'Test Persistent Repo',
      3,
      2,
      1836,
      mockRepoDir,
      mockFileTree,
      { totalDependencies: 4, localDependencies: 2, externalDependencies: 2 }
    );

    // 2. List repositories - should discover the repo either from DB or disk fallback
    const repos = await listAllRepositories(testExtractedDir);
    assert.ok(Array.isArray(repos), 'listAllRepositories should return an array');
    const found = repos.find((r) => r.id === mockRepoId);
    assert.ok(found, `Repository ${mockRepoId} must be discoverable in saved repositories list`);
    assert.ok(found.storagePath, 'Repository record must maintain storage path');

    // 3. Retrieve single repository record
    const singleRepo = await getRepositoryRecord(mockRepoId, testExtractedDir);
    // If DB is connected, singleRepo returns the cached tree; if DB is offline, returns null for disk rescan fallback
    if (await isDatabaseConnected()) {
      assert.ok(singleRepo, 'Saved repository record should be retrievable from database');
      assert.equal(singleRepo?.repo.repoName, 'Test Persistent Repo');
      assert.equal(singleRepo?.repo.totalFiles, 3);
    }
  });

  test('Analysis History Saving, Retrieval and Integrity', async () => {
    const mockImpact: ImpactAnalysisResult = {
      repoId: mockRepoId,
      changedFile: 'src/utils/math.ts',
      totalAffectedFiles: 2,
      maxDepth: 1,
      directImpactCount: 2,
      indirectImpactCount: 0,
      directImpactFiles: [
        {
          filePath: 'src/index.ts',
          depth: 1,
          impactType: 'direct',
          impactPath: ['src/utils/math.ts', 'src/index.ts'],
          connectingDependencies: ['import'],
        },
      ],
      indirectImpactFiles: [],
      affectedFiles: [
        {
          filePath: 'src/index.ts',
          depth: 1,
          impactType: 'direct',
          impactPath: ['src/utils/math.ts', 'src/index.ts'],
          connectingDependencies: ['import'],
        },
      ],
      circularDependencies: [],
      hasCycleInPath: false,
      riskAnalysis: {
        score: 35,
        level: 'medium',
        summary: 'Medium change risk',
        factors: [
          { name: 'Direct Dependents', points: 20, maxPoints: 30, description: '2 direct callers' },
          { name: 'Impact Depth', points: 15, maxPoints: 20, description: 'Depth 1' },
        ],
      },
      testRecommendations: {
        totalRecommended: 1,
        existingTestsCount: 1,
        missingTestsCount: 0,
        recommendations: [
          {
            targetFile: 'src/utils/math.ts',
            priority: 'high',
            priorityOrder: 1,
            reason: 'Directly modified module',
            depth: 0,
            hasExistingTest: true,
            suggestedAction: 'Execute existing tests',
          },
        ],
      },
    };

    // If database is connected, persist and verify
    if (await isDatabaseConnected()) {
      const savedRecord = await persistAnalysisRecord(mockRepoId, 'src/utils/math.ts', mockImpact);
      assert.ok(savedRecord, 'Saved analysis record must be returned');
      assert.equal(savedRecord.targetFile, 'src/utils/math.ts');
      assert.equal(savedRecord.riskScore, 35);
      assert.equal(savedRecord.riskLevel, 'medium');
      assert.equal(savedRecord.directImpactCount, 2);

      // Verify listing analyses
      const historyList = await listRepositoryAnalyses(mockRepoId);
      assert.ok(historyList.length >= 1, 'Repository must list saved analysis');
      const foundInList = historyList.find((h) => h.id === savedRecord.id);
      assert.ok(foundInList, 'Saved analysis must be present in history list');

      // Verify single analysis retrieval
      const singleAnalysis = await getAnalysisRecord(mockRepoId, savedRecord.id);
      assert.ok(singleAnalysis, 'Single analysis should be retrievable by ID');
      assert.equal(singleAnalysis?.id, savedRecord.id);
      assert.equal(singleAnalysis?.riskScore, 35);
    }
  });

  test('Repository Deletion and Associated Record Cleanup', async () => {
    // Delete the repository
    const deleted = await deleteRepositoryRecord(mockRepoId, testExtractedDir);
    assert.equal(deleted, true, 'deleteRepositoryRecord should succeed');

    // Verify folder on disk was removed
    assert.equal(fs.existsSync(mockRepoDir), false, 'Extracted repository directory on disk must be removed');

    // If DB is connected, verify associated analysis history was cascade deleted
    if (await isDatabaseConnected()) {
      const analysesRemaining = await listRepositoryAnalyses(mockRepoId);
      assert.equal(analysesRemaining.length, 0, 'All analysis records must be cleaned up when repository is deleted');
    }
  });

  test('Invalid and Non-Existent Repository IDs', async () => {
    const nonExistentId = 'non-existent-uuid-99999';
    const singleRepo = await getRepositoryRecord(nonExistentId, testExtractedDir);
    assert.equal(singleRepo, null, 'Non-existent repository should return null');

    const singleAnalysis = await getAnalysisRecord(nonExistentId, 'non-existent-analysis-id');
    assert.equal(singleAnalysis, null, 'Non-existent analysis should return null');
  });
});
