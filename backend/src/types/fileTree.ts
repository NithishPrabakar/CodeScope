export interface FileNode {
  name: string;
  path: string; // relative path within repository (e.g. "src/index.ts")
  type: 'file' | 'directory';
  size?: number; // bytes
  extension?: string; // e.g. ".ts"
  children?: FileNode[];
}

export interface RepositoryUploadResponse {
  repoId: string;
  repoName: string;
  totalFiles: number;
  totalDirectories: number;
  totalSize: number; // bytes
  fileTree: FileNode;
}
