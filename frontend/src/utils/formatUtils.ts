export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '-';
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getFileBadgeClass(extension?: string): string {
  if (!extension) return 'ext-default';
  const ext = extension.toLowerCase();

  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'ext-ts';
    case '.js':
    case '.jsx':
      return 'ext-js';
    case '.json':
      return 'ext-json';
    case '.css':
    case '.scss':
      return 'ext-css';
    case '.html':
      return 'ext-html';
    case '.md':
      return 'ext-md';
    default:
      return 'ext-default';
  }
}
