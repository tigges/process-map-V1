import { useCallback, useRef, useMemo, useEffect, useState, useContext } from 'react';
import {
  ReactFlow, ReactFlowProvider,
  Background, Controls, MiniMap,
  BackgroundVariant, SelectionMode, useReactFlow,
  type ReactFlowInstance, type Node, type Edge, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import JourneyNode from './JourneyNode';
import { useAppStore } from '../store/useAppStore';
import type { JourneyNodeType, JourneyNodeData, ProcessMap } from '../types';
import { NumbersContext } from '../contexts';

type GroupFrameData = { label: string; color: string };
type CanvasNodeData = JourneyNodeData | GroupFrameData;

const RECT_WIDTH = 160;
const RECT_HEIGHT = 60;
const TERMINAL_SIZE = 56;
const DECISION_SIZE = 100;

function getNodeDimensions(nodeType: JourneyNodeType): { width: number; height: number } {
  if (nodeType === 'start' || nodeType === 'end') return { width: TERMINAL_SIZE, height: TERMINAL_SIZE };
  if (nodeType === 'decision') return { width: DECISION_SIZE, height: DECISION_SIZE };
  return { width: RECT_WIDTH, height: RECT_HEIGHT };
}

function toAlpha(color: string, alphaHex = '14'): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${alphaHex}`;
  return 'rgba(148, 163, 184, 0.08)';
}

function GroupFrameNode({ data }: NodeProps) {
  const frameData = data as GroupFrameData;
  const frameColor = frameData.color || '#64748b';
  return (
    <div
      className="group-frame"
      style={{ borderColor: frameColor, backgroundColor: toAlpha(frameColor) }}
    >
      <span className="group-frame__label" style={{ color: frameColor, borderColor: frameColor }}>
        {frameData.label}
      </span>
    </div>
  );
}

function buildGroupFrameNodes(map: ProcessMap, nodeNumbers: Map<string, string>): Node<CanvasNodeData>[] {
  const grouped = new Map<string, {
    label: string;
    color: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>();

  for (const node of map.nodes) {
    const nodeData = node.data as JourneyNodeData;
    if (nodeData.nodeType === 'start' || nodeData.nodeType === 'end') continue;

    const chapter = nodeNumbers.get(node.id);
    let groupKey: string | null = null;
    let groupLabel = '';

    if (chapter) {
      const parts = chapter.split('.');
      groupKey = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
      groupLabel = parts.length >= 2 ? `Chapter ${groupKey}` : `Category ${groupKey}`;
    } else if (nodeData.nodeType === 'subprocess') {
      groupKey = `subprocess-${node.id}`;
      groupLabel = nodeData.label;
    }

    if (!groupKey) continue;

    const dim = getNodeDimensions(nodeData.nodeType);
    const left = node.position.x;
    const top = node.position.y;
    const right = left + dim.width;
    const bottom = top + dim.height;

    const existing = grouped.get(groupKey);
    if (!existing) {
      grouped.set(groupKey, {
        label: groupLabel,
        color: nodeData.color || '#64748b',
        minX: left,
        minY: top,
        maxX: right,
        maxY: bottom,
      });
      continue;
    }

    existing.minX = Math.min(existing.minX, left);
    existing.minY = Math.min(existing.minY, top);
    existing.maxX = Math.max(existing.maxX, right);
    existing.maxY = Math.max(existing.maxY, bottom);
  }

  const paddingX = 36;
  const paddingY = 28;
  const minWidth = 220;
  const minHeight = 120;

  return Array.from(grouped.entries()).map(([key, group]) => ({
    id: `__group_frame__${map.id}__${key}`,
    type: 'groupFrame',
    position: { x: group.minX - paddingX, y: group.minY - paddingY },
    data: { label: group.label, color: group.color },
    style: {
      width: Math.max(minWidth, group.maxX - group.minX + paddingX * 2),
      height: Math.max(minHeight, group.maxY - group.minY + paddingY * 2),
      pointerEvents: 'none',
    },
    draggable: false,
    selectable: false,
    connectable: false,
    deletable: false,
    focusable: false,
    zIndex: -1,
  }));
}

const nodeTypes = { journeyNode: JourneyNode, groupFrame: GroupFrameNode };

function FlowPane({
  map, nodeNumbers, isPreview, onNodeSelect,
}: { map: ProcessMap; nodeNumbers: Map<string, string>; isPreview?: boolean; onNodeSelect?: () => void }) {
  const rfRef = useRef<ReactFlowInstance<Node<CanvasNodeData>, Edge> | null>(null);
  const { fitView, setCenter } = useReactFlow();
  const onNodesChange = useAppStore((s) => s.onNodesChange);
  const onEdgesChange = useAppStore((s) => s.onEdgesChange);
  const onConnect = useAppStore((s) => s.onConnect);
  const addNode = useAppStore((s) => s.addNode);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const persist = useAppStore((s) => s.persist);
  const focusNodeId = useAppStore((s) => s.focusNodeId);

  const frameNodes = useMemo(() => buildGroupFrameNodes(map, nodeNumbers), [map, nodeNumbers]);
  const nodes = useMemo(
    () => [...frameNodes, ...(map.nodes as Node<CanvasNodeData>[])],
    [frameNodes, map.nodes],
  );
  const edges = useMemo(() => map.edges, [map]);

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
    return () => clearTimeout(t);
  }, [map.id, fitView]);

  useEffect(() => {
    if (!focusNodeId || isPreview) return;
    const node = map.nodes.find((n) => n.id === focusNodeId);
    if (!node) return;
    const t = setTimeout(() => {
      setCenter(node.position.x + 80, node.position.y + 30, { zoom: 1.5, duration: 500 });
      useAppStore.setState({ focusNodeId: null });
    }, 200);
    return () => clearTimeout(t);
  }, [focusNodeId, map.nodes, setCenter, isPreview]);

  const onInit = useCallback((inst: ReactFlowInstance<Node<CanvasNodeData>, Edge>) => {
    rfRef.current = inst;
    inst.fitView({ padding: 0.15 });
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onInit={onInit}
      onNodesChange={isPreview ? undefined : onNodesChange}
      onEdgesChange={isPreview ? undefined : onEdgesChange}
      onConnect={isPreview ? undefined : onConnect}
      onDragOver={isPreview ? undefined : (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={isPreview ? undefined : (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('application/processmap-nodetype') as JourneyNodeType;
        if (type && rfRef.current) addNode(type, rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }}
      onPaneClick={() => setSelectedNode(null)}
      onNodeClick={() => onNodeSelect?.()}
      onNodeDragStop={isPreview ? undefined : () => persist()}
      fitView
      selectionOnDrag={!isPreview}
      selectionMode={SelectionMode.Partial}
      multiSelectionKeyCode="Shift"
      deleteKeyCode={isPreview ? undefined : "Delete"}
      snapToGrid snapGrid={[20, 20]}
      nodesDraggable={!isPreview}
      nodesConnectable={!isPreview}
      defaultEdgeOptions={{ type: 'smoothstep', animated: true, style: { stroke: '#94a3b8', strokeWidth: 2 } }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
      {!isPreview && <Controls />}
      {!isPreview && (
        <MiniMap
          nodeColor={(n) => (n.data as Record<string, unknown>)?.color as string ?? '#94a3b8'}
          maskColor="rgba(0,0,0,0.08)"
          style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
        />
      )}
    </ReactFlow>
  );
}

export default function FlowCanvas({ onNodeSelect }: { onNodeSelect?: () => void }) {
  const nodeNumbers = useContext(NumbersContext);
  const activeMap = useAppStore((s) => s.getActiveMap());
  const project = useAppStore((s) => s.getActiveProject());
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const breadcrumb = useAppStore((s) => s.breadcrumb);
  const [previewMapId, setPreviewMapId] = useState<string | null>(null);
  const depth = breadcrumb.length - 1;

  const computedPreviewId = useMemo(() => {
    if (!selectedNodeId || !activeMap || !project) return null;
    const node = activeMap.nodes.find((n) => n.id === selectedNodeId);
    const data = node?.data as JourneyNodeData | undefined;
    if (data?.nodeType === 'subprocess' && data.subMapId && project.maps[data.subMapId]) {
      return data.subMapId;
    }
    return null;
  }, [selectedNodeId, activeMap, project]);

  useEffect(() => {
    setPreviewMapId(computedPreviewId);
  }, [computedPreviewId]);

  const previewMap = previewMapId && project ? project.maps[previewMapId] : null;

  if (!activeMap) {
    return (
      <div className="canvas-empty">
        <h2>No map selected</h2>
        <p>Create or select a project to get started.</p>
      </div>
    );
  }

  if (previewMap) {
    return (
      <div className="flow-canvas flow-canvas--split" style={{ ['--depth' as string]: depth }}>
        <div className="flow-canvas__main">
          <FlowPane map={activeMap} nodeNumbers={nodeNumbers} onNodeSelect={onNodeSelect} />
        </div>
        <div className="flow-canvas__preview">
          <div className="flow-canvas__preview-header">
            <span className="flow-canvas__preview-title">{previewMap.name}</span>
            <button className="flow-canvas__preview-close" onClick={() => setPreviewMapId(null)}>✕</button>
          </div>
          <div className="flow-canvas__preview-content">
            <ReactFlowProvider>
              <FlowPane map={previewMap} nodeNumbers={nodeNumbers} isPreview />
            </ReactFlowProvider>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-canvas" style={{ ['--depth' as string]: depth }}>
      <FlowPane map={activeMap} nodeNumbers={nodeNumbers} onNodeSelect={onNodeSelect} />
    </div>
  );
}
