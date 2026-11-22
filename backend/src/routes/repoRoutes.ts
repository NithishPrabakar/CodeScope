import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { extractZipSafely, ZipSecurityError } from '../utils/zipHandler.js';
import { scanDirectory } from '../utils/fileScanner.js';
import { RepositoryUploadResponse, FileNode } from '../types/fileTree.js';
import { analyzeRepositoryDependencies } from '../analyzer/dependencyExtractor.js';
import { RepoDependencyAnalysis } from '../types/dependency.js';
import { analyzeImpact } from '../analyzer/impactEngine.js';
import { calculateChangeRisk } from '../analyzer/riskEngine.js';
import { generateTestRecommendations } from '../analyzer/testRecommender.js';
import {
  persistRepositoryRecord,
  listAllRepositories,
  getRepositoryRecord,
  deleteRepositoryRecord,
  persistAnalysisRecord,
  listRepositoryAnalyses,
  getAnalysisRecord,
} from '../services/repoDbService.js';

const router = express.Router();

// Base directories for uploads
const UPLOADS_ROOT = path.resolve('uploads');
const TEMP_DIR = path.join(UPLOADS_ROOT, 'temp');
const EXTRACTED_DIR = path.join(UPLOADS_ROOT, 'extracted');

// Ensure base directories exist
fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(EXTRACTED_DIR, { recursive: true });

// Configure Multer storage and file filter
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const isZipExt = path.extname(file.originalname).toLowerCase() === '.zip';
    const isZipMime =
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.mimetype === 'application/octet-stream';

    if (isZipExt || isZipMime) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only ZIP (.zip) archives are accepted.'));
    }
  },
});

/**
 * In-memory repository metadata and dependency caches
 */
const repoMetadataStore = new Map<string, RepositoryUploadResponse>();
const repoDependencyStore = new Map<string, RepoDependencyAnalysis>();

/**
 * Helper to determine effective scan directory (unwrapping single root folders)
 */
function getScanTarget(repoDir: string, defaultName: string): { scanTarget: string; effectiveName: string } {
  const entries = fs.readdirSync(repoDir);
  if (entries.length === 1) {
    const singleEntryPath = path.join(repoDir, entries[0]);
    if (fs.statSync(singleEntryPath).isDirectory()) {
      return { scanTarget: singleEntryPath, effectiveName: entries[0] };
    }
  }
  return { scanTarget: repoDir, effectiveName: defaultName };
}

/**
 * POST /api/repos/upload
 * Accepts a ZIP file, extracts it safely, scans file tree, extracts dependencies,
 * and persists repository record to PostgreSQL.
 */
router.post('/upload', upload.single('repoZip'), (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Please upload a .zip file.' });
    return;
  }

  const uploadedFile = req.file;
  const repoId = uuidv4();
  const repoName = path.basename(uploadedFile.originalname, path.extname(uploadedFile.originalname));
  const extractPath = path.join(EXTRACTED_DIR, repoId);

  try {
    // 1. Safe extraction with Zip Slip validation
    extractZipSafely(uploadedFile.path, extractPath);

    // 2. Resolve scan target (unwrap single wrapper directory if present)
    const { scanTarget, effectiveName } = getScanTarget(extractPath, repoName);

    // 3. Scan directory structure
    const { fileTree, totalFiles, totalDirectories, totalSize } = scanDirectory(scanTarget);
    fileTree.name = effectiveName;

    const responseData: RepositoryUploadResponse = {
      repoId,
      repoName: effectiveName,
      totalFiles,
      totalDirectories,
      totalSize,
      fileTree,
    };

    // 4. Perform comprehensive dependency extraction
    const dependencyAnalysis = analyzeRepositoryDependencies(scanTarget, repoId);

    // Store in metadata and dependency caches
    repoMetadataStore.set(repoId, responseData);
    repoDependencyStore.set(repoId, dependencyAnalysis);

    // 5. Persist repository to database asynchronously
    persistRepositoryRecord(
      repoId,
      effectiveName,
      totalFiles,
      totalDirectories,
      totalSize,
      extractPath,
      fileTree,
      {
        totalDependencies: dependencyAnalysis.dependencies.length,
        localDependencies: dependencyAnalysis.localDependencies,
        externalDependencies: dependencyAnalysis.externalDependencies,
      }
    ).catch((err) => {
      console.warn(`[repoRoutes] Failed to persist repository ${repoId}:`, err);
    });

    res.status(200).json(responseData);
  } catch (err: unknown) {
    // Cleanup extracted directory on error if needed
    if (fs.existsSync(extractPath)) {
      try {
        fs.rmSync(extractPath, { recursive: true, force: true });
      } catch {}
    }

    if (err instanceof ZipSecurityError) {
      res.status(400).json({ error: `Security validation failed: ${err.message}` });
      return;
    }

    const message = err instanceof Error ? err.message : 'Failed to extract and scan repository ZIP';
    res.status(500).json({ error: message });
  } finally {
    // Cleanup the uploaded temp ZIP file
    if (fs.existsSync(uploadedFile.path)) {
      try {
        fs.unlinkSync(uploadedFile.path);
      } catch {}
    }
  }
});

/**
 * GET /api/repos
 * Lists all saved repositories from PostgreSQL (or disk fallback).
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const repos = await listAllRepositories(EXTRACTED_DIR);
    res.status(200).json(repos);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list repositories';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/repos/:repoId
 * Retrieves repository metadata, ensuring it is restored to active cache.
 */
router.get('/:repoId', async (req: Request, res: Response): Promise<void> => {
  const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;

  if (!repoId) {
    res.status(400).json({ error: 'Repository ID is required' });
    return;
  }

  // 1. Check in-memory store
  if (repoMetadataStore.has(repoId)) {
    res.status(200).json(repoMetadataStore.get(repoId));
    return;
  }

  const repoDir = path.join(EXTRACTED_DIR, repoId);
  if (!fs.existsSync(repoDir)) {
    res.status(404).json({ error: 'Repository not found or has expired.' });
    return;
  }

  try {
    // 2. Check PostgreSQL database
    const dbRecord = await getRepositoryRecord(repoId, EXTRACTED_DIR);
    if (dbRecord && dbRecord.repo) {
      repoMetadataStore.set(repoId, dbRecord.repo);
      res.status(200).json(dbRecord.repo);
      return;
    }

    // 3. Disk fallback rescan
    const { scanTarget, effectiveName } = getScanTarget(repoDir, repoId);
    const { fileTree, totalFiles, totalDirectories, totalSize } = scanDirectory(scanTarget);
    fileTree.name = effectiveName;

    const responseData: RepositoryUploadResponse = {
      repoId,
      repoName: effectiveName,
      totalFiles,
      totalDirectories,
      totalSize,
      fileTree,
    };

    repoMetadataStore.set(repoId, responseData);
    res.status(200).json(responseData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve repository';
    res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/repos/:repoId
 * Deletes a repository and all associated analysis records from DB and disk.
 */
router.delete('/:repoId', async (req: Request, res: Response): Promise<void> => {
  const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;

  if (!repoId) {
    res.status(400).json({ error: 'Repository ID is required' });
    return;
  }

  try {
    repoMetadataStore.delete(repoId);
    repoDependencyStore.delete(repoId);

    const success = await deleteRepositoryRecord(repoId, EXTRACTED_DIR);
    if (!success) {
      res.status(500).json({ error: 'Failed to delete repository files from disk' });
      return;
    }

    res.status(200).json({ message: 'Repository deleted successfully', repoId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete repository';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/repos/:repoId/analyses
 * Lists analysis history for a repository.
 */
router.get('/:repoId/analyses', async (req: Request, res: Response): Promise<void> => {
  const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;

  if (!repoId) {
    res.status(400).json({ error: 'Repository ID is required' });
    return;
  }

  try {
    const history = await listRepositoryAnalyses(repoId);
    res.status(200).json(history);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve analysis history';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/repos/:repoId/analyses/:analysisId
 * Retrieves a specific historical analysis.
 */
router.get('/:repoId/analyses/:analysisId', async (req: Request, res: Response): Promise<void> => {
  const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;
  const analysisId = Array.isArray(req.params.analysisId) ? req.params.analysisId[0] : req.params.analysisId;

  if (!repoId || !analysisId) {
    res.status(400).json({ error: 'Repository ID and Analysis ID are required' });
    return;
  }

  try {
    const record = await getAnalysisRecord(repoId, analysisId);
    if (!record) {
      res.status(404).json({ error: 'Analysis record not found' });
      return;
    }
    res.status(200).json(record);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve analysis record';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/repos/:repoId/tree
 * Returns the cached file tree for a repository, or rescans if directory exists.
 */
router.get('/:repoId/tree', (req: Request, res: Response): void => {
  const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;

  if (!repoId) {
    res.status(400).json({ error: 'Repository ID is required' });
    return;
  }

  if (repoMetadataStore.has(repoId)) {
    res.status(200).json(repoMetadataStore.get(repoId));
    return;
  }

  const repoDir = path.join(EXTRACTED_DIR, repoId);
  if (!fs.existsSync(repoDir)) {
    res.status(404).json({ error: 'Repository not found or has expired.' });
    return;
  }

  try {
    const { scanTarget, effectiveName } = getScanTarget(repoDir, repoId);
    const { fileTree, totalFiles, totalDirectories, totalSize } = scanDirectory(scanTarget);
    fileTree.name = effectiveName;

    const responseData: RepositoryUploadResponse = {
      repoId,
      repoName: effectiveName,
      totalFiles,
      totalDirectories,
      totalSize,
      fileTree,
    };

    repoMetadataStore.set(repoId, responseData);
    res.status(200).json(responseData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to scan repository';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/repos/:repoId/dependencies
 * Returns the extracted dependencies for the entire repository.
 */
router.get('/:repoId/dependencies', (req: Request, res: Response): void => {
  const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;

  if (!repoId) {
    res.status(400).json({ error: 'Repository ID is required' });
    return;
  }

  if (repoDependencyStore.has(repoId)) {
    res.status(200).json(repoDependencyStore.get(repoId));
    return;
  }

  const repoDir = path.join(EXTRACTED_DIR, repoId);
  if (!fs.existsSync(repoDir)) {
    res.status(404).json({ error: 'Repository not found or has expired.' });
    return;
  }

  try {
    const { scanTarget } = getScanTarget(repoDir, repoId);
    const dependencyAnalysis = analyzeRepositoryDependencies(scanTarget, repoId);
    repoDependencyStore.set(repoId, dependencyAnalysis);
    res.status(200).json(dependencyAnalysis);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to extract repository dependencies';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/repos/:repoId/impact?file=path/to/file
 * Analyzes the direct and indirect impact of modifying a specific file,
 * and saves the analysis record to AnalysisHistory.
 */
router.get('/:repoId/impact', (req: Request, res: Response): void => {
  const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;
  const targetFile = req.query.file as string;

  if (!repoId) {
    res.status(400).json({ error: 'Repository ID is required' });
    return;
  }

  if (!targetFile) {
    res.status(400).json({ error: 'Query parameter "file" is required (e.g. ?file=src/utils/math.ts)' });
    return;
  }

  let dependencyAnalysis = repoDependencyStore.get(repoId);

  if (!dependencyAnalysis) {
    const repoDir = path.join(EXTRACTED_DIR, repoId);
    if (!fs.existsSync(repoDir)) {
      res.status(404).json({ error: 'Repository not found or has expired.' });
      return;
    }
    try {
      const { scanTarget } = getScanTarget(repoDir, repoId);
      dependencyAnalysis = analyzeRepositoryDependencies(scanTarget, repoId);
      repoDependencyStore.set(repoId, dependencyAnalysis);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to extract repository dependencies';
      res.status(500).json({ error: message });
      return;
    }
  }

  try {
    const impactResult = analyzeImpact(dependencyAnalysis.dependencies, targetFile, repoId);

    // Retrieve fileTree to list all existing repository files
    let repoMetadata = repoMetadataStore.get(repoId);
    let allFilePaths: string[] = [];

    if (repoMetadata) {
      function collectPaths(node: FileNode) {
        if (node.type === 'file') allFilePaths.push(node.path);
        if (node.children) node.children.forEach(collectPaths);
      }
      collectPaths(repoMetadata.fileTree);
    } else {
      // Fallback from dependencies if metadata not cached
      allFilePaths = Object.keys(dependencyAnalysis.fileDependencies);
    }

    // 1. Calculate transparent change risk score & factors
    const riskAnalysis = calculateChangeRisk({
      changedFile: targetFile,
      directImpactCount: impactResult.directImpactCount,
      indirectImpactCount: impactResult.indirectImpactCount,
      totalAffectedFiles: impactResult.totalAffectedFiles,
      maxDepth: impactResult.maxDepth,
      hasCycleInPath: impactResult.hasCycleInPath,
      totalRepoFiles: repoMetadata?.totalFiles || allFilePaths.length || 10,
      directImpactFiles: impactResult.directImpactFiles,
    });

    // 2. Generate prioritized test recommendations with test detection
    const testRecommendations = generateTestRecommendations({
      changedFile: targetFile,
      affectedFiles: impactResult.affectedFiles,
      allRepoFilePaths: allFilePaths,
    });

    impactResult.riskAnalysis = riskAnalysis;
    impactResult.testRecommendations = testRecommendations;

    // 3. Persist analysis history record asynchronously
    persistAnalysisRecord(repoId, targetFile, impactResult).catch((err) => {
      console.warn(`[repoRoutes] Failed to record analysis history:`, err);
    });

    res.status(200).json(impactResult);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to analyze impact';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/repos/:repoId/file?path=relative/path/to/file
 * Retrieves source code for a file within the repository, with strict path traversal checks,
 * binary file detection, size limits, and dependency awareness (imports and callers).
 */
router.get('/:repoId/file', (req: Request, res: Response): void => {
  const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;
  const filePathParam = req.query.path as string;

  if (!repoId) {
    res.status(400).json({ error: 'Repository ID is required' });
    return;
  }

  if (!filePathParam) {
    res.status(400).json({ error: 'Query parameter "path" is required (e.g. ?path=src/utils/math.ts)' });
    return;
  }

  const repoDir = path.join(EXTRACTED_DIR, repoId);
  if (!fs.existsSync(repoDir)) {
    res.status(404).json({ error: 'Repository not found or has expired.' });
    return;
  }

  try {
    const { scanTarget } = getScanTarget(repoDir, repoId);
    const safeScanTarget = path.resolve(scanTarget);

    // Normalize slashes and trim leading slashes
    const normalizedRelative = filePathParam.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolvedFilePath = path.resolve(safeScanTarget, normalizedRelative);

    // 1. Strict Path Traversal Protection: Target must be strictly inside scanTarget
    if (!resolvedFilePath.startsWith(safeScanTarget + path.sep) && resolvedFilePath !== safeScanTarget) {
      res.status(403).json({ error: 'Security violation: Path traversal detected.' });
      return;
    }

    // 2. Existence & Directory Check
    if (!fs.existsSync(resolvedFilePath)) {
      res.status(404).json({ error: `File not found: ${normalizedRelative}` });
      return;
    }

    const stat = fs.statSync(resolvedFilePath);
    if (stat.isDirectory()) {
      res.status(400).json({ error: `Requested path is a directory, not a source file: ${normalizedRelative}` });
      return;
    }

    // 3. Binary File Detection (by extension and byte content check)
    const BINARY_EXTENSIONS = new Set([
      '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.pdf',
      '.zip', '.tar', '.gz', '.7z', '.exe', '.bin', '.dll', '.so',
      '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.wav', '.mov',
    ]);
    const ext = path.extname(resolvedFilePath).toLowerCase();

    let isBinary = BINARY_EXTENSIONS.has(ext);
    if (!isBinary && stat.size > 0) {
      const fd = fs.openSync(resolvedFilePath, 'r');
      const buffer = Buffer.alloc(Math.min(512, stat.size));
      fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0) {
          isBinary = true;
          break;
        }
      }
    }

    if (isBinary) {
      res.status(200).json({
        repoId,
        filePath: normalizedRelative,
        content: '',
        size: stat.size,
        totalLines: 0,
        isBinary: true,
        extension: ext,
        message: `Binary file (${ext || 'binary'}) cannot be displayed as plain text.`,
        outgoingDependencies: [],
        incomingDependents: [],
      });
      return;
    }

    // 4. File Size Limits & Safe Reading
    const MAX_VIEW_SIZE = 2 * 1024 * 1024; // 2MB max
    let content = '';
    let isTruncated = false;

    if (stat.size > MAX_VIEW_SIZE) {
      const fd = fs.openSync(resolvedFilePath, 'r');
      const buffer = Buffer.alloc(500 * 1024); // First 500KB
      fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);
      content = buffer.toString('utf-8');
      isTruncated = true;
    } else {
      content = fs.readFileSync(resolvedFilePath, 'utf-8');
    }

    // 5. Dependency Awareness Enrichment
    let dependencyAnalysis = repoDependencyStore.get(repoId);
    if (!dependencyAnalysis) {
      dependencyAnalysis = analyzeRepositoryDependencies(scanTarget, repoId);
      repoDependencyStore.set(repoId, dependencyAnalysis);
    }

    // Outgoing dependencies: What this file imports/references
    const outgoingDependencies = (dependencyAnalysis.fileDependencies[normalizedRelative] || []).map((d) => ({
      ...d,
    }));

    // Incoming dependents: What other files import/reference this file
    const incomingDependents = dependencyAnalysis.dependencies.filter(
      (d) => d.targetFile === normalizedRelative
    );

    res.status(200).json({
      repoId,
      filePath: normalizedRelative,
      content,
      size: stat.size,
      totalLines: stat.size === 0 ? 0 : content.split('\n').length,
      isBinary: false,
      isTruncated,
      extension: ext,
      outgoingDependencies,
      incomingDependents,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve file content';
    res.status(500).json({ error: message });
  }
});

export default router;
