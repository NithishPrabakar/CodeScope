import { v4 as uuidv4 } from 'uuid';
import { CodeDependency } from '../types/dependency.js';
import { resolveCssReference } from './pathResolver.js';

/**
 * Calculates line number for a character index in a file string.
 */
function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

/**
 * Extracts @import statements and asset url(...) references from CSS/SCSS/LESS stylesheets.
 */
export function extractCssDependencies(
  cssContent: string,
  cssRelativePath: string,
  repoRootDir: string
): CodeDependency[] {
  const dependencies: CodeDependency[] = [];

  // 1. Match @import statements:
  // e.g. @import url('./theme.css'); or @import './theme.css'; or @import "theme.css";
  const importRegex = /@import\s+(?:url\(\s*['"]?([^'")]+)['"]?\s*\)|['"]([^'"]+)['"])/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(cssContent)) !== null) {
    const rawPath = match[1] || match[2];
    if (!rawPath) continue;

    const line = getLineNumber(cssContent, match.index);
    const resolution = resolveCssReference(repoRootDir, cssRelativePath, rawPath);

    dependencies.push({
      id: uuidv4(),
      sourceFile: cssRelativePath,
      targetFile: resolution.resolvedPath,
      type: 'css-import',
      rawSpecifier: rawPath,
      targetKind: resolution.targetKind,
      status: resolution.status,
      line,
      details: `@import stylesheet rule: "${rawPath}"`,
    });
  }

  // 2. Match url(...) references for background images, fonts, icons, etc.
  // Exclude matches that were already captured as @import
  const urlRegex = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  while ((match = urlRegex.exec(cssContent)) !== null) {
    const rawUrl = match[1]?.trim();
    if (!rawUrl) continue;

    // Check if this url() is preceded by @import (already captured above)
    const prefixContext = cssContent.substring(Math.max(0, match.index - 20), match.index);
    if (/@import\s*$/.test(prefixContext)) {
      continue;
    }

    // Skip inline data URIs and absolute remote URLs
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      continue;
    }

    const line = getLineNumber(cssContent, match.index);
    const isCssTarget = rawUrl.toLowerCase().split(/[?#]/)[0].endsWith('.css');
    const depType = isCssTarget ? 'css-import' : 'asset';
    const resolution = resolveCssReference(repoRootDir, cssRelativePath, rawUrl);

    dependencies.push({
      id: uuidv4(),
      sourceFile: cssRelativePath,
      targetFile: resolution.resolvedPath,
      type: depType,
      rawSpecifier: rawUrl,
      targetKind: resolution.targetKind,
      status: resolution.status,
      line,
      details: isCssTarget
        ? `CSS import via url(): "${rawUrl}"`
        : `Asset reference (image/font): "${rawUrl}"`,
    });
  }

  return dependencies;
}
