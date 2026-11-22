import fs from 'fs';
import path from 'path';
import { FileNode } from '../types/fileTree.js';

export interface ScanResult {
  fileTree: FileNode;
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
}

const IGNORED_NAMES = new Set(['.git', 'node_modules', '__MACOSX', '.DS_Store', 'Thumbs.db']);

/**
 * Recursively scans an extracted repository directory and constructs a hierarchical file tree.
 */
export function scanDirectory(rootDir: string, relativePath: string = ''): ScanResult {
  const currentPath = path.join(rootDir, relativePath);
  const nodeName = relativePath ? path.basename(relativePath) : path.basename(rootDir);

  let totalFiles = 0;
  let totalDirectories = 0;
  let totalSize = 0;

  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  // Separate and filter out ignored files/folders
  const filteredEntries = entries.filter((entry) => !IGNORED_NAMES.has(entry.name));

  const children: FileNode[] = [];

  for (const entry of filteredEntries) {
    const entryRelativePath = relativePath
      ? `${relativePath}/${entry.name}`.replace(/\\/g, '/')
      : entry.name;
    const fullEntryPath = path.join(rootDir, entryRelativePath);

    if (entry.isDirectory()) {
      totalDirectories += 1;
      const subScan = scanDirectory(rootDir, entryRelativePath);
      children.push(subScan.fileTree);
      totalFiles += subScan.totalFiles;
      totalDirectories += subScan.totalDirectories;
      totalSize += subScan.totalSize;
    } else if (entry.isFile()) {
      totalFiles += 1;
      const stat = fs.statSync(fullEntryPath);
      const ext = path.extname(entry.name);
      totalSize += stat.size;

      children.push({
        name: entry.name,
        path: entryRelativePath,
        type: 'file',
        size: stat.size,
        extension: ext || 'file',
      });
    }
  }

  // Sort folders first, then alphabetical by name
  children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const rootNode: FileNode = {
    name: nodeName,
    path: relativePath || '',
    type: 'directory',
    children,
  };

  return {
    fileTree: rootNode,
    totalFiles,
    totalDirectories,
    totalSize,
  };
}
