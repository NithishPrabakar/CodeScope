import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getFileBadgeClass } from '../utils/formatUtils';
import type { GraphNodeData } from '../utils/graphBuilder';

export const FileNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as GraphNodeData;
  const {
    fileName,
    dirPath,
    extension,
    impactRole = 'unaffected',
    depth,
    isDimmed,
  } = nodeData;

  const roleClass =
    impactRole === 'origin'
      ? 'node-origin'
      : impactRole === 'direct'
      ? 'node-direct-impact'
      : impactRole === 'indirect'
      ? 'node-indirect-impact'
      : '';

  return (
    <div
      className={`custom-graph-node ${roleClass} ${selected ? 'is-selected' : ''} ${
        isDimmed ? 'is-dimmed' : ''
      }`}
    >
      {/* Input Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="graph-handle handle-left"
      />

      <div className="node-content-row">
        <span className={`file-badge node-ext ${getFileBadgeClass(extension)}`}>
          {extension ? extension.replace('.', '') : 'FILE'}
        </span>

        <div className="node-text-col">
          <span className="node-title" title={fileName}>
            {fileName}
          </span>
          {dirPath && (
            <span className="node-subtitle" title={dirPath}>
              {dirPath}
            </span>
          )}
        </div>

        {/* Impact Badge */}
        {impactRole === 'origin' && (
          <span className="node-impact-tag tag-origin">CHANGED</span>
        )}
        {impactRole === 'direct' && (
          <span className="node-impact-tag tag-direct">DEPTH 1</span>
        )}
        {impactRole === 'indirect' && (
          <span className="node-impact-tag tag-indirect">DEPTH {depth}</span>
        )}
      </div>

      {/* Output Handle (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="graph-handle handle-right"
      />
    </div>
  );
};
