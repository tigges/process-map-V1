import { memo, useCallback, useContext, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JourneyNodeData } from '../types';
import { NODE_TYPE_CONFIG } from '../types';
import { useAppStore } from '../store/useAppStore';
import { NumbersContext, NumberToNodeContext, ShowNumbersContext, SearchTermContext } from '../contexts';

function highlightText(text: string, term: string): React.ReactNode {
  if (!term || term.length < 2) return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="jnode__highlight">{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </>
  );
}

const CROSS_REF_PATTERN = /\b\d+(?:\.\d+)+\b/g;

function JourneyNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as JourneyNodeData;
  const navigateToMap = useAppStore((s) => s.navigateToMap);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const config = NODE_TYPE_CONFIG[nodeData.nodeType];
  const project = useAppStore((s) => s.getActiveProject());
  const nodeNumbers = useContext(NumbersContext);
  const numberIndex = useContext(NumberToNodeContext);
  const showNumbers = useContext(ShowNumbersContext);
  const searchTerm = useContext(SearchTermContext);

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

  const focusNode = useAppStore((s) => s.focusNode);
  const handleCrossRefClick = useCallback((e: React.MouseEvent, ref: string) => {
    e.stopPropagation();
    const target = numberIndex.get(ref);
    if (!target) return;
    focusNode(target.mapId, target.nodeId);
  }, [numberIndex, focusNode]);

  const color = nodeData.color || config.color;
  const isSubprocess = nodeData.nodeType === 'subprocess';
  const isDecision = nodeData.nodeType === 'decision';
  const isStart = nodeData.nodeType === 'start';
  const isEnd = nodeData.nodeType === 'end';
  const isTerminal = isStart || isEnd;
  const chapterNum = showNumbers ? nodeNumbers.get(id) : null;

  const focusNodeId = useAppStore((s) => s.focusNodeId);
  const isFocused = focusNodeId === id;

  const stepCount = isSubprocess && nodeData.subMapId && project
    ? project.maps[nodeData.subMapId]?.nodes.length ?? 0
    : 0;

  const descriptionWithRefs = useMemo(() => {
    if (!nodeData.description) return null;

    let cursor = 0;
    const parts: React.ReactNode[] = [];
    const matches = [...nodeData.description.matchAll(CROSS_REF_PATTERN)];

    if (matches.length === 0) {
      return highlightText(nodeData.description, searchTerm);
    }

    for (const match of matches) {
      const full = match[0];
      const idx = match.index ?? 0;
      if (idx > cursor) {
        parts.push(highlightText(nodeData.description.slice(cursor, idx), searchTerm));
      }

      const target = numberIndex.get(full);
      if (target) {
        parts.push(
          <button
            key={`${id}-${idx}-${full}`}
            className="jnode__xref"
            onClick={(e) => handleCrossRefClick(e, full)}
            title={`Go to step ${full}`}
          >
            {full}
          </button>,
        );
      } else {
        parts.push(highlightText(full, searchTerm));
      }

      cursor = idx + full.length;
    }

    if (cursor < nodeData.description.length) {
      parts.push(highlightText(nodeData.description.slice(cursor), searchTerm));
    }

    return parts;
  }, [nodeData.description, searchTerm, numberIndex, id, handleCrossRefClick]);

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
        className={`jnode jnode--diamond ${selected ? 'jnode--selected' : ''} ${isFocused ? 'jnode--focused' : ''}`}
        style={{ borderColor: color }}
        title={nodeData.description}
      >
        {chapterNum && <span className="jnode__number">{chapterNum}</span>}
        <Handle type="target" position={Position.Left} className="jnode__handle" />
        <Handle type="source" position={Position.Right} id="right" className="jnode__handle" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="jnode__handle" />
        <div className="jnode__content">
          <div className="jnode__label jnode__label--dark">{highlightText(nodeData.label, searchTerm)}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`jnode ${isSubprocess ? 'jnode--subprocess' : 'jnode--rect'} ${selected ? 'jnode--selected' : ''} ${isFocused ? 'jnode--focused' : ''}`}
      style={{ borderColor: color, background: `${color}12` }}
    >
      {chapterNum && <span className="jnode__number">{chapterNum}</span>}
      <Handle type="target" position={Position.Left} className="jnode__handle" />
      <Handle type="source" position={Position.Right} className="jnode__handle" />
      <div className="jnode__content">
        <div className="jnode__label" style={{ color }}>{highlightText(nodeData.label, searchTerm)}</div>
        {nodeData.description && (
          <div className="jnode__desc">{descriptionWithRefs}</div>
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
