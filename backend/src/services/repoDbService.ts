import fs from 'fs';
import path from 'path';
import { prisma, isDatabaseConnected } from '../db/prisma.js';
import { RepositoryUploadResponse, FileNode } from '../types/fileTree.js';
import { RepoDependencyAnalysis } from '../types/dependency.js';
import { ImpactAnalysisResult } from '../types/impact.js';
import { scanDirectory } from '../utils/fileScanner.js';
import { analyzeRepositoryDependencies } from '../analyzer/dependencyExtractor.js';

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
  riskLevel: string;
  directImpactCount: number;
  indirectImpactCount: number;
  totalAffectedFiles: number;
  maxDepth: number;
  hasCycleInPath: boolean;
  riskFactors: any;
  directImpactFiles: string[];
  indirectImpactFiles: string[];
  affectedFiles: string[];
  impactChains: any[];
  testRecommendations: any[];
}

/**
 * Persist or update repository metadata in PostgreSQL
 */
export async function persistRepositoryRecord(
  repoId: string,
  repoName: string,
  totalFiles: number,
  totalDirectories: number,
  totalSize: number,
  storagePath: string,
  fileTree: FileNode,
  dependencyStats?: any
): Promise<void> {
  try {
    const connected = await isDatabaseConnected();
    if (!connected) {
      console.warn(`[repoDbService] Database not reachable. Skipping persistence for repo ${repoId}.`);
      return;
    }

    await prisma.repository.upsert({
      where: { id: repoId },
      update: {
        name: repoName,
        fileCount: totalFiles,
        directoryCount: totalDirectories,
        totalSize,
        storagePath,
        fileTreeJson: fileTree as any,
        dependencyStats: dependencyStats ? (dependencyStats as any) : undefined,
        status: 'ready',
      },
      create: {
        id: repoId,
        name: repoName,
        originalName: repoName,
        fileCount: totalFiles,
        directoryCount: totalDirectories,
        totalSize,
        storagePath,
        fileTreeJson: fileTree as any,
        dependencyStats: dependencyStats ? (dependencyStats as any) : undefined,
        status: 'ready',
      },
    });
  } catch (error) {
    console.warn(`[repoDbService] Failed to persist repository ${repoId}:`, (error as Error).message);
  }
}

/**
 * List all saved repositories. If DB is unavailable, fall back to scanning the uploads directory.
 */
export async function listAllRepositories(extractedDir: string): Promise<SavedRepositorySummary[]> {
  try {
    const connected = await isDatabaseConnected();
    if (connected) {
      const records = await prisma.repository.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { analyses: true },
          },
        },
      });

      return records.map((r) => ({
        id: r.id,
        name: r.name,
        fileCount: r.fileCount,
        directoryCount: r.directoryCount,
        totalSize: r.totalSize,
        storagePath: r.storagePath,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        analysisCount: r._count.analyses,
      }));
    }
  } catch (error) {
    console.warn('[repoDbService] Database query failed, falling back to disk discovery:', (error as Error).message);
  }

  // Fallback: discover unindexed or offline folders from extractedDir
  const summaries: SavedRepositorySummary[] = [];
  if (fs.existsSync(extractedDir)) {
    const entries = fs.readdirSync(extractedDir);
    for (const repoId of entries) {
      const repoDir = path.join(extractedDir, repoId);
      if (fs.statSync(repoDir).isDirectory()) {
        try {
          const stats = fs.statSync(repoDir);
          summaries.push({
            id: repoId,
            name: repoId,
            fileCount: 0,
            directoryCount: 0,
            totalSize: 0,
            storagePath: repoDir,
            status: 'ready',
            createdAt: stats.birthtime.toISOString(),
            updatedAt: stats.mtime.toISOString(),
            analysisCount: 0,
          });
        } catch {}
      }
    }
  }
  return summaries;
}

/**
 * Get repository details from DB or restore from disk
 */
export async function getRepositoryRecord(
  repoId: string,
  extractedDir: string
): Promise<{ repo: RepositoryUploadResponse; storagePath: string } | null> {
  const repoDir = path.join(extractedDir, repoId);
  if (!fs.existsSync(repoDir)) {
    return null;
  }

  // Try DB first
  try {
    const connected = await isDatabaseConnected();
    if (connected) {
      const record = await prisma.repository.findUnique({
        where: { id: repoId },
      });
      if (record && record.fileTreeJson) {
        return {
          repo: {
            repoId: record.id,
            repoName: record.name,
            totalFiles: record.fileCount,
            totalDirectories: record.directoryCount,
            totalSize: record.totalSize,
            fileTree: record.fileTreeJson as unknown as FileNode,
          },
          storagePath: record.storagePath,
        };
      }
    }
  } catch (err) {
    console.warn(`[repoDbService] DB read failed for repo ${repoId}:`, (err as Error).message);
  }

  // Fallback: rescan from disk
  return null;
}

/**
 * Delete a repository from PostgreSQL and remove its files from disk
 */
export async function deleteRepositoryRecord(repoId: string, extractedDir: string): Promise<boolean> {
  const repoDir = path.join(extractedDir, repoId);

  // 1. Delete from database (cascades to AnalysisHistory)
  try {
    const connected = await isDatabaseConnected();
    if (connected) {
      await prisma.repository.delete({
        where: { id: repoId },
      }).catch(() => null); // Ignore if not in DB
    }
  } catch (err) {
    console.warn(`[repoDbService] DB deletion error for repo ${repoId}:`, (err as Error).message);
  }

  // 2. Delete from disk
  if (fs.existsSync(repoDir)) {
    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[repoDbService] Disk removal error for ${repoDir}:`, (err as Error).message);
      return false;
    }
  }

  return true;
}

/**
 * Save an AnalysisHistory record to PostgreSQL
 */
export async function persistAnalysisRecord(
  repoId: string,
  targetFile: string,
  impactResult: ImpactAnalysisResult
): Promise<SavedAnalysisRecord | null> {
  try {
    const connected = await isDatabaseConnected();
    if (!connected) {
      return null;
    }

    // Ensure parent repository exists in DB before inserting foreign key
    let existingRepo = await prisma.repository.findUnique({ where: { id: repoId } });
    if (!existingRepo) {
      // Auto-register repository if folder exists
      await prisma.repository.create({
        data: {
          id: repoId,
          name: repoId,
          storagePath: path.resolve('uploads', 'extracted', repoId),
          status: 'ready',
        },
      }).catch(() => null);
    }

    const created = await prisma.analysisHistory.create({
      data: {
        repoId,
        targetFile,
        riskScore: impactResult.riskAnalysis?.score ?? 0,
        riskLevel: impactResult.riskAnalysis?.level ?? 'low',
        directImpactCount: impactResult.directImpactCount,
        indirectImpactCount: impactResult.indirectImpactCount,
        totalAffectedFiles: impactResult.totalAffectedFiles,
        maxDepth: impactResult.maxDepth,
        hasCycleInPath: impactResult.hasCycleInPath,
        riskFactors: impactResult.riskAnalysis?.factors as any,
        directImpactFiles: impactResult.directImpactFiles as any,
        indirectImpactFiles: impactResult.indirectImpactFiles as any,
        affectedFiles: impactResult.affectedFiles as any,
        impactChains: (impactResult.affectedFiles || []).map((f) => ({
          filePath: f.filePath,
          depth: f.depth,
          impactPath: f.impactPath,
        })) as any,
        testRecommendations: impactResult.testRecommendations as any,
      },
    });

    return {
      id: created.id,
      repoId: created.repoId,
      targetFile: created.targetFile,
      analyzedAt: created.analyzedAt.toISOString(),
      riskScore: created.riskScore,
      riskLevel: created.riskLevel,
      directImpactCount: created.directImpactCount,
      indirectImpactCount: created.indirectImpactCount,
      totalAffectedFiles: created.totalAffectedFiles,
      maxDepth: created.maxDepth,
      hasCycleInPath: created.hasCycleInPath,
      riskFactors: created.riskFactors,
      directImpactFiles: created.directImpactFiles as string[] || [],
      indirectImpactFiles: created.indirectImpactFiles as string[] || [],
      affectedFiles: created.affectedFiles as string[] || [],
      impactChains: created.impactChains as any[] || [],
      testRecommendations: created.testRecommendations as any[] || [],
    };
  } catch (error) {
    console.warn(`[repoDbService] Failed to persist analysis for ${targetFile}:`, (error as Error).message);
    return null;
  }
}

/**
 * List all analysis records for a repository
 */
export async function listRepositoryAnalyses(repoId: string): Promise<SavedAnalysisRecord[]> {
  try {
    const connected = await isDatabaseConnected();
    if (!connected) {
      return [];
    }

    const records = await prisma.analysisHistory.findMany({
      where: { repoId },
      orderBy: { analyzedAt: 'desc' },
    });

    return records.map((r) => ({
      id: r.id,
      repoId: r.repoId,
      targetFile: r.targetFile,
      analyzedAt: r.analyzedAt.toISOString(),
      riskScore: r.riskScore,
      riskLevel: r.riskLevel,
      directImpactCount: r.directImpactCount,
      indirectImpactCount: r.indirectImpactCount,
      totalAffectedFiles: r.totalAffectedFiles,
      maxDepth: r.maxDepth,
      hasCycleInPath: r.hasCycleInPath,
      riskFactors: r.riskFactors,
      directImpactFiles: (r.directImpactFiles as string[]) || [],
      indirectImpactFiles: (r.indirectImpactFiles as string[]) || [],
      affectedFiles: (r.affectedFiles as string[]) || [],
      impactChains: (r.impactChains as any[]) || [],
      testRecommendations: (r.testRecommendations as any[]) || [],
    }));
  } catch (error) {
    console.warn(`[repoDbService] Failed to list analyses for ${repoId}:`, (error as Error).message);
    return [];
  }
}

/**
 * Retrieve a specific analysis record
 */
export async function getAnalysisRecord(
  repoId: string,
  analysisId: string
): Promise<SavedAnalysisRecord | null> {
  try {
    const connected = await isDatabaseConnected();
    if (!connected) {
      return null;
    }

    const record = await prisma.analysisHistory.findFirst({
      where: {
        id: analysisId,
        repoId,
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      repoId: record.repoId,
      targetFile: record.targetFile,
      analyzedAt: record.analyzedAt.toISOString(),
      riskScore: record.riskScore,
      riskLevel: record.riskLevel,
      directImpactCount: record.directImpactCount,
      indirectImpactCount: record.indirectImpactCount,
      totalAffectedFiles: record.totalAffectedFiles,
      maxDepth: record.maxDepth,
      hasCycleInPath: record.hasCycleInPath,
      riskFactors: record.riskFactors,
      directImpactFiles: (record.directImpactFiles as string[]) || [],
      indirectImpactFiles: (record.indirectImpactFiles as string[]) || [],
      affectedFiles: (record.affectedFiles as string[]) || [],
      impactChains: (record.impactChains as any[]) || [],
      testRecommendations: (record.testRecommendations as any[]) || [],
    };
  } catch (error) {
    console.warn(`[repoDbService] Failed to get analysis ${analysisId}:`, (error as Error).message);
    return null;
  }
}
