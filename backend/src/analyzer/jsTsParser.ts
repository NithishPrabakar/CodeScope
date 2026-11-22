import { parse } from '@babel/parser';
import traversePkg from '@babel/traverse';
import { v4 as uuidv4 } from 'uuid';
import { CodeDependency } from '../types/dependency.js';
import {
  resolveLocalJsTsImport,
  resolveFilesystemPath,
  resolveExpressTemplate,
} from './pathResolver.js';

// Handle ESM / CJS interoperability for @babel/traverse
const traverse = (traversePkg as any).default || traversePkg;

const FS_METHOD_NAMES = new Set([
  'readFile',
  'readFileSync',
  'writeFile',
  'writeFileSync',
  'createReadStream',
  'createWriteStream',
  'open',
  'openSync',
  'appendFile',
  'appendFileSync',
]);

/**
 * Extracts all import, export, dynamic import, filesystem, and template
 * dependencies from a JavaScript or TypeScript source code string using Babel AST parsing.
 */
export function extractJsTsDependencies(
  sourceCode: string,
  sourceRelativePath: string,
  repoRootDir: string
): CodeDependency[] {
  const dependencies: CodeDependency[] = [];

  let ast: any;
  try {
    ast = parse(sourceCode, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'exportDefaultFrom',
      ],
      errorRecovery: true, // Recover gracefully from minor syntax anomalies
    });
  } catch (err) {
    // If syntax parsing completely fails (e.g. invalid code file), do not crash
    // Return empty list and log gracefully
    console.warn(`[CodeScope Parser] Unable to parse ${sourceRelativePath}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  traverse(ast, {
    // 1. Static Imports: named, default, namespace, side-effect
    ImportDeclaration(pathNode: any) {
      const node = pathNode.node;
      const rawSpecifier = node.source.value;
      const line = node.loc?.start.line;

      // Classify import styles for details
      const specifiers = node.specifiers || [];
      const hasDefault = specifiers.some((s: any) => s.type === 'ImportDefaultSpecifier');
      const hasNamespace = specifiers.some((s: any) => s.type === 'ImportNamespaceSpecifier');
      const namedImports = specifiers
        .filter((s: any) => s.type === 'ImportSpecifier')
        .map((s: any) => s.imported.name || s.imported.value);

      let detailParts: string[] = [];
      if (hasDefault) detailParts.push('default');
      if (hasNamespace) detailParts.push('namespace');
      if (namedImports.length > 0) {
        detailParts.push(`named: { ${namedImports.slice(0, 3).join(', ')}${namedImports.length > 3 ? '...' : ''} }`);
      }
      if (specifiers.length === 0) {
        detailParts.push('side-effect import');
      }

      const resolution = resolveLocalJsTsImport(repoRootDir, sourceRelativePath, rawSpecifier);

      dependencies.push({
        id: uuidv4(),
        sourceFile: sourceRelativePath,
        targetFile: resolution.resolvedPath,
        type: 'import',
        rawSpecifier,
        targetKind: resolution.targetKind,
        status: resolution.status,
        line,
        details: detailParts.length > 0 ? `Import (${detailParts.join(', ')})` : 'Import statement',
      });
    },

    // 2. Re-exports: export { x } from './x' or export * from './y'
    ExportNamedDeclaration(pathNode: any) {
      const node = pathNode.node;
      if (node.source) {
        const rawSpecifier = node.source.value;
        const line = node.loc?.start.line;
        const resolution = resolveLocalJsTsImport(repoRootDir, sourceRelativePath, rawSpecifier);

        dependencies.push({
          id: uuidv4(),
          sourceFile: sourceRelativePath,
          targetFile: resolution.resolvedPath,
          type: 're-export',
          rawSpecifier,
          targetKind: resolution.targetKind,
          status: resolution.status,
          line,
          details: 'Re-export declaration',
        });
      }
    },

    ExportAllDeclaration(pathNode: any) {
      const node = pathNode.node;
      const rawSpecifier = node.source.value;
      const line = node.loc?.start.line;
      const resolution = resolveLocalJsTsImport(repoRootDir, sourceRelativePath, rawSpecifier);

      dependencies.push({
        id: uuidv4(),
        sourceFile: sourceRelativePath,
        targetFile: resolution.resolvedPath,
        type: 're-export',
        rawSpecifier,
        targetKind: resolution.targetKind,
        status: resolution.status,
        line,
        details: 'Export all (*)',
      });
    },

    // 3. Dynamic Import Expressions: import(...) in modern Babel AST
    ImportExpression(pathNode: any) {
      const node = pathNode.node;
      const line = node.loc?.start.line;
      const sourceNode = node.source;

      if (sourceNode && sourceNode.type === 'StringLiteral') {
        const rawSpecifier = sourceNode.value;
        const resolution = resolveLocalJsTsImport(repoRootDir, sourceRelativePath, rawSpecifier);

        dependencies.push({
          id: uuidv4(),
          sourceFile: sourceRelativePath,
          targetFile: resolution.resolvedPath,
          type: 'dynamic-import',
          rawSpecifier,
          targetKind: resolution.targetKind,
          status: resolution.status,
          line,
          details: `Static dynamic import: import('${rawSpecifier}')`,
        });
      } else {
        dependencies.push({
          id: uuidv4(),
          sourceFile: sourceRelativePath,
          type: 'dynamic-import',
          rawSpecifier: 'import(<dynamic expression>)',
          targetKind: 'unresolved',
          status: 'dynamic',
          line,
          details: 'Dynamic expression cannot be resolved statically at compile time',
        });
      }
    },

    // 4. CallExpressions: legacy dynamic imports, fs operations, Express res.render
    CallExpression(pathNode: any) {
      const node = pathNode.node;
      const line = node.loc?.start.line;

      // 3A. Dynamic import: import(...)
      if (node.callee && node.callee.type === 'Import') {
        const firstArg = node.arguments[0];

        if (firstArg && firstArg.type === 'StringLiteral') {
          const rawSpecifier = firstArg.value;
          const resolution = resolveLocalJsTsImport(repoRootDir, sourceRelativePath, rawSpecifier);

          dependencies.push({
            id: uuidv4(),
            sourceFile: sourceRelativePath,
            targetFile: resolution.resolvedPath,
            type: 'dynamic-import',
            rawSpecifier,
            targetKind: resolution.targetKind,
            status: resolution.status,
            line,
            details: `Static dynamic import: import('${rawSpecifier}')`,
          });
        } else {
          // Dynamic expression e.g. import('./pages/' + pageName)
          dependencies.push({
            id: uuidv4(),
            sourceFile: sourceRelativePath,
            type: 'dynamic-import',
            rawSpecifier: 'import(<dynamic expression>)',
            targetKind: 'unresolved',
            status: 'dynamic',
            line,
            details: 'Dynamic expression cannot be resolved statically at compile time',
          });
        }
        return;
      }

      // Helper to check member expression callee names
      // e.g. fs.readFile, fs.promises.readFile, promises.readFile
      const callee = node.callee;
      if (callee && callee.type === 'MemberExpression') {
        const propertyName = callee.property?.name || callee.property?.value;
        const objectName = callee.object?.name || callee.object?.property?.name;

        // 3B. Express Template Rendering: res.render('view', ...)
        if (propertyName === 'render' && node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          if (firstArg && firstArg.type === 'StringLiteral') {
            const viewName = firstArg.value;
            const resolution = resolveExpressTemplate(repoRootDir, viewName);

            dependencies.push({
              id: uuidv4(),
              sourceFile: sourceRelativePath,
              targetFile: resolution.resolvedPath,
              type: 'template',
              rawSpecifier: viewName,
              targetKind: resolution.targetKind,
              status: resolution.status,
              line,
              details: `Express template render: "${viewName}"`,
            });
          } else {
            dependencies.push({
              id: uuidv4(),
              sourceFile: sourceRelativePath,
              type: 'template',
              rawSpecifier: 'res.render(<dynamic expression>)',
              targetKind: 'unresolved',
              status: 'dynamic',
              line,
              details: 'Dynamic template expression cannot be resolved statically',
            });
          }
          return;
        }

        // 3C. Filesystem references via object: fs.readFile, fs.promises.readFile, etc.
        const isFsCall =
          (objectName === 'fs' || objectName === 'promises') &&
          FS_METHOD_NAMES.has(propertyName);

        if (isFsCall && node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          if (firstArg && firstArg.type === 'StringLiteral') {
            const rawPath = firstArg.value;
            const resolution = resolveFilesystemPath(repoRootDir, sourceRelativePath, rawPath);

            dependencies.push({
              id: uuidv4(),
              sourceFile: sourceRelativePath,
              targetFile: resolution.resolvedPath,
              type: 'filesystem',
              rawSpecifier: rawPath,
              targetKind: resolution.targetKind,
              status: resolution.status,
              line,
              details: `Filesystem call: ${objectName}.${propertyName}('${rawPath}')`,
            });
          } else {
            dependencies.push({
              id: uuidv4(),
              sourceFile: sourceRelativePath,
              type: 'filesystem',
              rawSpecifier: `${objectName}.${propertyName}(<dynamic path>)`,
              targetKind: 'unresolved',
              status: 'dynamic',
              line,
              details: `Dynamic filesystem path cannot be determined statically`,
            });
          }
          return;
        }
      }

      // 3D. Direct fs functions: e.g. import { readFileSync } from 'fs'; readFileSync('./data.json')
      if (callee && callee.type === 'Identifier' && FS_METHOD_NAMES.has(callee.name) && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (firstArg && firstArg.type === 'StringLiteral') {
          const rawPath = firstArg.value;
          const resolution = resolveFilesystemPath(repoRootDir, sourceRelativePath, rawPath);

          dependencies.push({
            id: uuidv4(),
            sourceFile: sourceRelativePath,
            targetFile: resolution.resolvedPath,
            type: 'filesystem',
            rawSpecifier: rawPath,
            targetKind: resolution.targetKind,
            status: resolution.status,
            line,
            details: `Direct filesystem function: ${callee.name}('${rawPath}')`,
          });
        }
      }
    },
  });

  return dependencies;
}
