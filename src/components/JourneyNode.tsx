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

  const color = nodeData.color || config.color;
  const isSubprocess = nodeData.nodeType === 'subprocess';
  const isDecision = nodeData.nodeType === 'decision';
  const isTerminal = nodeData.nodeType === 'start' || nodeData.nodeType === 'end';

  const stepCount = isSubprocess && nodeData.subMapId && project
    ? project.maps[nodeData.subMapId]?.nodes.length ?? 0
    : 0;

  const shapeClass = isDecision
    ? 'jnode--diamond'
    : isTerminal
      ? 'jnode--circle'
      : isSubprocess
        ? 'jnode--subprocess'
        : 'jnode--rect';

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`jnode ${shapeClass} ${selected ? 'jnode--selected' : ''}`}
      style={{
        borderColor: color,
        background: `${color}15`,
        ['--node-color' as string]: color,
      }}
    >
      <Handle type="target" position={Position.Left} className="jnode__handle" />
      {isDecision && (
        <>
          <Handle type="source" position={Position.Right} id="right" className="jnode__handle" />
          <Handle type="source" position={Position.Bottom} id="bottom" className="jnode__handle" />
        </>
      )}
      {!isDecision && (
        <Handle type="source" position={Position.Right} className="jnode__handle" />
      )}

      <div className="jnode__content">
        <div className="jnode__label" style={{ color: isTerminal ? '#fff' : color }}>
          {nodeData.label}
        </div>
        {nodeData.description && !isTerminal && (
          <div className="jnode__desc">{nodeData.description}</div>
        )}
        {isSubprocess && (
          <div className="jnode__hint" style={{ color }}>
            {stepCount > 0 ? `${stepCount} steps` : 'Open'}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(JourneyNodeComponent);
