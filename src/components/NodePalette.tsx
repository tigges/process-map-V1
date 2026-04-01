import type { DragEvent } from 'react';
import { NODE_TYPE_CONFIG, type JourneyNodeType } from '../types';

const nodeTypes = Object.entries(NODE_TYPE_CONFIG) as [JourneyNodeType, (typeof NODE_TYPE_CONFIG)[JourneyNodeType]][];

export default function NodePalette() {
  const onDragStart = (e: DragEvent, nodeType: JourneyNodeType) => {
    e.dataTransfer.setData('application/processmap-nodetype', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="node-palette">
      <h3 className="node-palette__title">Node Types</h3>
      <p className="node-palette__hint">Drag onto canvas</p>
      <div className="node-palette__list">
        {nodeTypes.map(([type, config]) => (
          <div
            key={type}
            className="node-palette__item"
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            style={{ borderLeftColor: config.color }}
          >
            <span className="node-palette__icon">{config.icon}</span>
            <span className="node-palette__label">{config.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
