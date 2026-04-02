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

  const handleOpenClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (nodeData.subMapId) {
      navigateToMap(nodeData.subMapId);
    }
  }, [nodeData, navigateToMap]);

  const color = nodeData.color || config.color;
  const isSubprocess = nodeData.nodeType === 'subprocess';
  const isDecision = nodeData.nodeType === 'decision';
  const isStart = nodeData.nodeType === 'start';
  const isEnd = nodeData.nodeType === 'end';
  const isTerminal = isStart || isEnd;

  const stepCount = isSubprocess && nodeData.subMapId && project
    ? project.maps[nodeData.subMapId]?.nodes.length ?? 0
    : 0;

  if (isTerminal) {
    return (
      <div
        onClick={handleClick}
        className={`jnode jnode--circle ${selected ? 'jnode--selected' : ''}`}
        style={{ borderColor: color, background: color }}
      >
        <Handle type="target" position={Position.Left} className="jnode__handle" />
        <div className="jnode__content">
          <div className="jnode__label jnode__label--white">{nodeData.label}</div>
        </div>
        <Handle type="source" position={Position.Right} className="jnode__handle" />
      </div>
    );
  }

  if (isDecision) {
    return (
      <div
        onClick={handleClick}
        className={`jnode jnode--diamond ${selected ? 'jnode--selected' : ''}`}
        style={{ borderColor: color }}
        title={nodeData.description}
      >
        <Handle type="target" position={Position.Left} className="jnode__handle" />
        <Handle type="source" position={Position.Right} id="right" className="jnode__handle" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="jnode__handle" />
        <div className="jnode__content">
          <div className="jnode__label jnode__label--dark">{nodeData.label}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`jnode ${isSubprocess ? 'jnode--subprocess' : 'jnode--rect'} ${selected ? 'jnode--selected' : ''}`}
      style={{ borderColor: color, background: `${color}12` }}
    >
      <Handle type="target" position={Position.Left} className="jnode__handle" />
      <Handle type="source" position={Position.Right} className="jnode__handle" />
      <div className="jnode__content">
        <div className="jnode__label" style={{ color }}>{nodeData.label}</div>
        {nodeData.description && (
          <div className="jnode__desc">{nodeData.description}</div>
        )}
        {isSubprocess && nodeData.subMapId && (
          <button className="jnode__open-btn" onClick={handleOpenClick} style={{ color }}>
            {stepCount > 0 ? `Open ${stepCount} steps →` : 'Open →'}
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(JourneyNodeComponent);
