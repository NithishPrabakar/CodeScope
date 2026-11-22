import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

export class ZipSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipSecurityError';
  }
}

/**
 * Safely extracts a ZIP archive to a destination directory,
 * strictly validating against Zip Slip path traversal vulnerabilities.
 */
export function extractZipSafely(zipFilePath: string, destinationDir: string): void {
  const zip = new AdmZip(zipFilePath);
  const zipEntries = zip.getEntries();

  const resolvedDestDir = path.resolve(destinationDir);

  // Ensure destination directory exists
  if (!fs.existsSync(resolvedDestDir)) {
    fs.mkdirSync(resolvedDestDir, { recursive: true });
  }

  // Phase 1: Security Validation across all entries before writing any files
  for (const entry of zipEntries) {
    const entryName = entry.entryName;

    // Check for obvious traversal patterns in the raw entry name
    if (entryName.includes('..') || path.isAbsolute(entryName)) {
      const resolvedEntryPath = path.resolve(resolvedDestDir, entryName);
      if (!resolvedEntryPath.startsWith(resolvedDestDir + path.sep) && resolvedEntryPath !== resolvedDestDir) {
        throw new ZipSecurityError(`Unsafe path traversal detected in ZIP entry: "${entryName}"`);
      }
    }

    const targetPath = path.resolve(resolvedDestDir, entryName);
    if (!targetPath.startsWith(resolvedDestDir + path.sep) && targetPath !== resolvedDestDir) {
      throw new ZipSecurityError(`Entry "${entryName}" attempts to escape destination directory`);
    }
  }

  // Phase 2: Safe extraction
  for (const entry of zipEntries) {
    const targetPath = path.resolve(resolvedDestDir, entry.entryName);

    if (entry.isDirectory) {
      fs.mkdirSync(targetPath, { recursive: true });
    } else {
      // Ensure parent directory exists
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(targetPath, entry.getData());
    }
  }
}
