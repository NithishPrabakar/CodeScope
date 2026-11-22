import fs from 'fs';
import path from 'path';
import { CodeDependency, RepoDependencyAnalysis } from '../types/dependency.js';
import { extractJsTsDependencies } from './jsTsParser.js';
import { extractCssDependencies } from './cssParser.js';

const JS_TS_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const CSS_EXTENSIONS = new Set(['.css', '.scss', '.less']);
const IGNORED_NAMES = new Set(['.git', 'node_modules', '__MACOSX', '.DS_Store', 'Thumbs.db']);

/**
 * Recursively scans an extracted repository and extracts all import, export,
 * filesystem, template, and asset dependencies.
 */
export function analyzeRepositoryDependencies(
  repoRootDir: string,
  repoId: string
): RepoDependencyAnalysis {
  const allDependencies: CodeDependency[] = [];
  const fileDependencies: Record<string, CodeDependency[]> = {};

  function walk(currentDir: string, relativeDir: string = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) {
        continue;
      }

      const entryRelPath = relativeDir
        ? `${relativeDir}/${entry.name}`.replace(/\\/g, '/')
        : entry.name;
      const fullEntryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullEntryPath, entryRelPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        let fileDeps: CodeDependency[] = [];

        try {
          if (JS_TS_EXTENSIONS.has(ext)) {
            const content = fs.readFileSync(fullEntryPath, 'utf-8');
            fileDeps = extractJsTsDependencies(content, entryRelPath, repoRootDir);
          } else if (CSS_EXTENSIONS.has(ext)) {
            const content = fs.readFileSync(fullEntryPath, 'utf-8');
            fileDeps = extractCssDependencies(content, entryRelPath, repoRootDir);
          }
        } catch (err) {
          console.warn(`[CodeScope Dependency Extractor] Error processing file ${entryRelPath}:`, err);
        }

        if (fileDeps.length > 0) {
          allDependencies.push(...fileDeps);
          fileDependencies[entryRelPath] = fileDeps;
        } else {
          // File has no dependencies (preserve entry for clarity in UI)
          fileDependencies[entryRelPath] = [];
        }
      }
    }
  }

  walk(repoRootDir);

  let localCount = 0;
  let externalCount = 0;
  let unresolvedCount = 0;

  for (const dep of allDependencies) {
    if (dep.targetKind === 'local') {
      localCount += 1;
    } else if (dep.targetKind === 'external') {
      externalCount += 1;
    } else {
      unresolvedCount += 1;
    }
  }

  return {
    repoId,
    totalDependencies: allDependencies.length,
    localDependencies: localCount,
    externalDependencies: externalCount,
    unresolvedDependencies: unresolvedCount,
    dependencies: allDependencies,
    fileDependencies,
  };
}
