import path from 'path';
import fs from 'fs';

const JS_TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const TEMPLATE_EXTENSIONS = ['.ejs', '.pug', '.hbs', '.handlebars', '.html', '.jade'];
const VIEW_DIR_CANDIDATES = ['views', 'src/views', 'app/views', 'server/views'];

const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'stream/promises', 'string_decoder',
  'timers', 'timers/promises', 'tls', 'trace_events', 'tty', 'url', 'util',
  'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

export interface ResolutionResult {
  targetKind: 'local' | 'external' | 'unresolved';
  resolvedPath?: string; // Repo-relative path (using forward slashes)
  status: 'resolved' | 'unresolved' | 'external';
}

/**
 * Checks whether an import specifier refers to an external package or Node built-in.
 */
export function isExternalSpecifier(specifier: string): boolean {
  if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/') || specifier.startsWith('\\')) {
    return false;
  }
  if (specifier.startsWith('node:')) {
    return true;
  }
  return true;
}

/**
 * Resolves a local JS/TS import or require relative to a source file within a repository.
 */
export function resolveLocalJsTsImport(
  repoRootDir: string,
  sourceRelativePath: string,
  importSpecifier: string
): ResolutionResult {
  if (isExternalSpecifier(importSpecifier)) {
    return {
      targetKind: 'external',
      status: 'external',
    };
  }

  const sourceAbsDir = path.dirname(path.join(repoRootDir, sourceRelativePath));
  const candidateAbsPath = path.resolve(sourceAbsDir, importSpecifier);
  const resolvedRepoRoot = path.resolve(repoRootDir);

  // Security check: ensure target does not escape repository root
  if (!candidateAbsPath.startsWith(resolvedRepoRoot)) {
    return { targetKind: 'unresolved', status: 'unresolved' };
  }

  // 1. Direct file match (e.g. import './Header.tsx' or import './style.css')
  if (fs.existsSync(candidateAbsPath) && fs.statSync(candidateAbsPath).isFile()) {
    const rel = path.relative(resolvedRepoRoot, candidateAbsPath).replace(/\\/g, '/');
    return { targetKind: 'local', status: 'resolved', resolvedPath: rel };
  }

  // 2. ESM .js -> .ts / .tsx translation (e.g. import from './math.js' when file is math.ts)
  if (candidateAbsPath.endsWith('.js') || candidateAbsPath.endsWith('.jsx')) {
    const stripped = candidateAbsPath.replace(/\.jsx?$/, '');
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
      const candidateWithExt = stripped + ext;
      if (fs.existsSync(candidateWithExt) && fs.statSync(candidateWithExt).isFile()) {
        const rel = path.relative(resolvedRepoRoot, candidateWithExt).replace(/\\/g, '/');
        return { targetKind: 'local', status: 'resolved', resolvedPath: rel };
      }
    }
  }

  // 3. Try appending standard JS/TS extensions
  for (const ext of JS_TS_EXTENSIONS) {
    const candidateWithExt = candidateAbsPath + ext;
    if (fs.existsSync(candidateWithExt) && fs.statSync(candidateWithExt).isFile()) {
      const rel = path.relative(resolvedRepoRoot, candidateWithExt).replace(/\\/g, '/');
      return { targetKind: 'local', status: 'resolved', resolvedPath: rel };
    }
  }

  // 4. Try directory index files (e.g. import './utils' -> './utils/index.ts')
  if (fs.existsSync(candidateAbsPath) && fs.statSync(candidateAbsPath).isDirectory()) {
    for (const ext of JS_TS_EXTENSIONS) {
      const indexCandidate = path.join(candidateAbsPath, `index${ext}`);
      if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
        const rel = path.relative(resolvedRepoRoot, indexCandidate).replace(/\\/g, '/');
        return { targetKind: 'local', status: 'resolved', resolvedPath: rel };
      }
    }
  }

  return { targetKind: 'unresolved', status: 'unresolved' };
}

/**
 * Resolves a file referenced via filesystem APIs (e.g. fs.readFile('./data.json'))
 * Relative paths are checked against the source file's directory first, then against repo root.
 */
export function resolveFilesystemPath(
  repoRootDir: string,
  sourceRelativePath: string,
  rawPath: string
): ResolutionResult {
  const resolvedRepoRoot = path.resolve(repoRootDir);

  // Check 1: Relative to source file's directory
  const sourceAbsDir = path.dirname(path.join(repoRootDir, sourceRelativePath));
  const candidateFromSource = path.resolve(sourceAbsDir, rawPath);

  if (
    candidateFromSource.startsWith(resolvedRepoRoot) &&
    fs.existsSync(candidateFromSource) &&
    fs.statSync(candidateFromSource).isFile()
  ) {
    const rel = path.relative(resolvedRepoRoot, candidateFromSource).replace(/\\/g, '/');
    return { targetKind: 'local', status: 'resolved', resolvedPath: rel };
  }

  // Check 2: Relative to repository root (common in Node apps e.g. fs.readFile('./config/app.json'))
  const candidateFromRoot = path.resolve(resolvedRepoRoot, rawPath);
  if (
    candidateFromRoot.startsWith(resolvedRepoRoot) &&
    fs.existsSync(candidateFromRoot) &&
    fs.statSync(candidateFromRoot).isFile()
  ) {
    const rel = path.relative(resolvedRepoRoot, candidateFromRoot).replace(/\\/g, '/');
    return { targetKind: 'local', status: 'resolved', resolvedPath: rel };
  }

  return { targetKind: 'unresolved', status: 'unresolved' };
}

/**
 * Resolves an Express template reference (e.g. res.render('dashboard') or res.render('users/profile'))
 */
export function resolveExpressTemplate(
  repoRootDir: string,
  viewName: string
): ResolutionResult {
  const resolvedRepoRoot = path.resolve(repoRootDir);

  // Find existing view directories in the project
  const viewDirs: string[] = [];
  for (const candidate of VIEW_DIR_CANDIDATES) {
    const absCandidate = path.join(resolvedRepoRoot, candidate);
    if (fs.existsSync(absCandidate) && fs.statSync(absCandidate).isDirectory()) {
      viewDirs.push(absCandidate);
    }
  }

  // If no known view dir exists, also allow resolving relative to repo root
  if (viewDirs.length === 0) {
    viewDirs.push(resolvedRepoRoot);
  }

  // Normalize view name (strip leading slashes)
  const cleanViewName = viewName.replace(/^[/\\]+/, '');

  for (const viewDir of viewDirs) {
    // 1. Direct match with whatever extension was provided (e.g. 'index.ejs')
    const directPath = path.resolve(viewDir, cleanViewName);
    if (
      directPath.startsWith(resolvedRepoRoot) &&
      fs.existsSync(directPath) &&
      fs.statSync(directPath).isFile()
    ) {
      const rel = path.relative(resolvedRepoRoot, directPath).replace(/\\/g, '/');
      return { targetKind: 'local', status: 'resolved', resolvedPath: rel };
    }

    // 2. Try candidate template extensions
    for (const ext of TEMPLATE_EXTENSIONS) {
      const candidatePath = path.resolve(viewDir, `${cleanViewName}${ext}`);
      if (
        candidatePath.startsWith(resolvedRepoRoot) &&
        fs.existsSync(candidatePath) &&
        fs.statSync(candidatePath).isFile()
      ) {
        const rel = path.relative(resolvedRepoRoot, candidatePath).replace(/\\/g, '/');
        return { targetKind: 'local', status: 'resolved', resolvedPath: rel };
      }
    }
  }

  return { targetKind: 'unresolved', status: 'unresolved' };
}

/**
 * Resolves a CSS import or asset reference (e.g. url('../images/bg.png'))
 */
export function resolveCssReference(
  repoRootDir: string,
  cssRelativePath: string,
  urlSpecifier: string
): ResolutionResult {
  // Strip url('...') and url("...") wrappers if present, and query/hash strings (e.g. font.woff2?v=1.0)
  const cleanedSpecifier = urlSpecifier
    .replace(/^url\(['"]?/, '')
    .replace(/['"]?\)$/, '')
    .trim()
    .split(/[?#]/)[0];

  if (!cleanedSpecifier || cleanedSpecifier.startsWith('data:') || cleanedSpecifier.startsWith('http://') || cleanedSpecifier.startsWith('https://')) {
    return { targetKind: 'external', status: 'external' };
  }

  const cssAbsDir = path.dirname(path.join(repoRootDir, cssRelativePath));
  const candidateAbsPath = path.resolve(cssAbsDir, cleanedSpecifier);
  const resolvedRepoRoot = path.resolve(repoRootDir);

  if (
    candidateAbsPath.startsWith(resolvedRepoRoot) &&
    fs.existsSync(candidateAbsPath) &&
    fs.statSync(candidateAbsPath).isFile()
  ) {
    const rel = path.relative(resolvedRepoRoot, candidateAbsPath).replace(/\\/g, '/');
    return { targetKind: 'local', status: 'resolved', resolvedPath: rel };
  }

  return { targetKind: 'unresolved', status: 'unresolved' };
}
