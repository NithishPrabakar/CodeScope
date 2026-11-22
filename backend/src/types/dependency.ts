export type DependencyType =
  | 'import'          // Standard static import
  | 're-export'       // export ... from './...'
  | 'dynamic-import'  // import(...)
  | 'filesystem'      // fs.readFile, readFileSync, writeFile, etc.
  | 'template'        // res.render('view')
  | 'css-import'      // @import url(...)
  | 'asset';          // url('image.png'), url('font.woff2')

export type DependencyTargetKind = 'local' | 'external' | 'unresolved';

export type DependencyStatus = 'resolved' | 'unresolved' | 'external' | 'dynamic';

export interface CodeDependency {
  id: string;
  sourceFile: string;         // Repo-relative path, e.g. "src/index.ts"
  targetFile?: string;        // Resolved repo-relative path if local, e.g. "src/utils/math.ts"
  type: DependencyType;
  rawSpecifier: string;       // Original specifier or expression, e.g. "./utils/math" or "react"
  targetKind: DependencyTargetKind;
  status: DependencyStatus;
  line?: number;
  details?: string;           // Descriptive note (e.g. "Default import from 'react'" or dynamic explanation)
}

export interface RepoDependencyAnalysis {
  repoId: string;
  totalDependencies: number;
  localDependencies: number;
  externalDependencies: number;
  unresolvedDependencies: number;
  dependencies: CodeDependency[];
  fileDependencies: Record<string, CodeDependency[]>; // Keyed by repo-relative sourceFile path
}
