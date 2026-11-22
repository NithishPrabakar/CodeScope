import { CodeDependency } from './dependency.js';

export interface SourceFileResponse {
  repoId: string;
  filePath: string;
  content: string;
  size: number;
  totalLines: number;
  isBinary: boolean;
  isTruncated?: boolean;
  extension: string;
  message?: string;
  outgoingDependencies: CodeDependency[];
  incomingDependents: CodeDependency[];
}
