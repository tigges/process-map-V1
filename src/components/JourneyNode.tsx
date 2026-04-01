import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JourneyNodeData } from '../types';
import { NODE_TYPE_CONFIG } from '../types';
import { useAppStore } from '../store/useAppStore';

function JourneyNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as JourneyNodeData;
  const navigateToMap = useAppStore((s) => s.navigateToMap);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const config = NODE_TYPE_CONFIG[nodeData.nodeType];

  const handleDoubleClick = useCallback(() => {
    if (nodeData.nodeType === 'subprocess' && nodeData.subMapId) {
      navigateToMap(nodeData.subMapId);
    }
  }, [nodeData, navigateToMap]);

  const handleClick = useCallback(() => {
    setSelectedNode(id);
  }, [id, setSelectedNode]);

  const isSubprocess = nodeData.nodeType === 'subprocess';
  const isDecision = nodeData.nodeType === 'decision';

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`journey-node ${isDecision ? 'journey-node--decision' : ''} ${isSubprocess ? 'journey-node--subprocess' : ''} ${selected ? 'journey-node--selected' : ''}`}
      style={{
        borderColor: nodeData.color || config.color,
        background: selected
          ? `${nodeData.color || config.color}22`
          : '#ffffff',
      }}
    >
      <Handle type="target" position={Position.Left} className="journey-handle" />
      <div className="journey-node__header" style={{ background: nodeData.color || config.color }}>
        <span className="journey-node__icon">{config.icon}</span>
        <span className="journey-node__type">{config.label}</span>
      </div>
      <div className="journey-node__body">
        <div className="journey-node__label">{nodeData.label}</div>
        {nodeData.description && (
          <div className="journey-node__desc">{nodeData.description}</div>
        )}
        {isSubprocess && (
          <div className="journey-node__hint">Double-click to open →</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="journey-handle" />
    </div>
  );
}

export default memo(JourneyNodeComponent);
