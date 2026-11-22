import React from 'react';
import type { FileNode } from '../types/repo';
import { formatBytes, getFileBadgeClass } from '../utils/formatUtils';

interface FileTreeNodeProps {
  node: FileNode;
  depth?: number;
  selectedPath?: string;
  onSelectNode: (node: FileNode) => void;
  expandedMap: Record<string, boolean>;
  onToggleExpand: (path: string) => void;
}

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  depth = 0,
  selectedPath,
  onSelectNode,
  expandedMap,
  onToggleExpand,
}) => {
  const isDirectory = node.type === 'directory';
  const isExpanded = isDirectory ? expandedMap[node.path] ?? (depth === 0) : false;
  const isSelected = selectedPath === node.path;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory) {
      onToggleExpand(node.path);
    }
    onSelectNode(node);
  };

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-node-row ${isDirectory ? 'directory' : 'file'} ${
          isSelected ? 'selected' : ''
        }`}
        style={{ paddingLeft: `${depth * 18 + 10}px` }}
        onClick={handleClick}
      >
        <span className="node-toggle">
          {isDirectory ? (
            <span className={`folder-arrow ${isExpanded ? 'open' : ''}`}>▶</span>
          ) : (
            <span className="file-bullet">•</span>
          )}
        </span>

        <span className="node-icon">
          {isDirectory ? (isExpanded ? '📂' : '📁') : '📄'}
        </span>

        <span className="node-name" title={node.path}>
          {node.name}
        </span>

        {isDirectory && node.children && (
          <span className="node-child-count">
            {node.children.length} {node.children.length === 1 ? 'item' : 'items'}
          </span>
        )}

        {!isDirectory && (
          <div className="file-meta-pills">
            {node.extension && (
              <span className={`file-badge ${getFileBadgeClass(node.extension)}`}>
                {node.extension}
              </span>
            )}
            <span className="file-size-label">{formatBytes(node.size)}</span>
          </div>
        )}
      </div>

      {isDirectory && isExpanded && node.children && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path || child.name}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectNode={onSelectNode}
              expandedMap={expandedMap}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};
