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
  const project = useAppStore((s) => s.getActiveProject());

  const handleDoubleClick = useCallback(() => {
    if (nodeData.nodeType === 'subprocess' && nodeData.subMapId) {
      navigateToMap(nodeData.subMapId);
    }
  }, [nodeData, navigateToMap]);

  const handleClick = useCallback(() => {
    setSelectedNode(id);
  }, [id, setSelectedNode]);

  const isSubprocess = nodeData.nodeType === 'subprocess';
  const color = nodeData.color || config.color;

  const stepCount = isSubprocess && nodeData.subMapId && project
    ? project.maps[nodeData.subMapId]?.nodes.length ?? 0
    : 0;

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`journey-node ${isSubprocess ? 'journey-node--subprocess' : ''} ${selected ? 'journey-node--selected' : ''}`}
      style={{
        borderColor: color,
        background: `${color}0a`,
      }}
    >
      <Handle type="target" position={Position.Top} className="journey-handle" />
      <div className="journey-node__title" style={{ color }}>
        <span className="journey-node__icon">{config.icon}</span>
        <span className="journey-node__name">{nodeData.label}</span>
      </div>
      {nodeData.description && (
        <div className="journey-node__desc">{nodeData.description}</div>
      )}
      {isSubprocess && (
        <div className="journey-node__hint" style={{ color }}>
          {stepCount > 0 ? `${stepCount} steps — double-click to open` : 'Double-click to open'}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="journey-handle" />
    </div>
  );
}

export default memo(JourneyNodeComponent);
