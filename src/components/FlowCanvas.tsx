import { useCallback, useRef, useMemo, useEffect, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider,
  Background, Controls, MiniMap,
  BackgroundVariant, SelectionMode, useReactFlow,
  type ReactFlowInstance, type Node, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import JourneyNode from './JourneyNode';
import { useAppStore } from '../store/useAppStore';
import type { JourneyNodeType, JourneyNodeData, ProcessMap } from '../types';

const nodeTypes = { journeyNode: JourneyNode };

function FlowPane({
  map, isPreview, onNodeSelect,
}: { map: ProcessMap; isPreview?: boolean; onNodeSelect?: () => void }) {
  const rfRef = useRef<ReactFlowInstance<Node<JourneyNodeData>, Edge> | null>(null);
  const { fitView } = useReactFlow();
  const onNodesChange = useAppStore((s) => s.onNodesChange);
  const onEdgesChange = useAppStore((s) => s.onEdgesChange);
  const onConnect = useAppStore((s) => s.onConnect);
  const addNode = useAppStore((s) => s.addNode);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const persist = useAppStore((s) => s.persist);

  const nodes = useMemo(() => map.nodes, [map]);
  const edges = useMemo(() => map.edges, [map]);

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
    return () => clearTimeout(t);
  }, [map.id, fitView]);

  const onInit = useCallback((inst: ReactFlowInstance<Node<JourneyNodeData>, Edge>) => {
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
  const activeMap = useAppStore((s) => s.getActiveMap());
  const project = useAppStore((s) => s.getActiveProject());
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const [previewMapId, setPreviewMapId] = useState<string | null>(null);

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
      <div className="flow-canvas flow-canvas--split">
        <div className="flow-canvas__main">
          <FlowPane map={activeMap} onNodeSelect={onNodeSelect} />
        </div>
        <div className="flow-canvas__preview">
          <div className="flow-canvas__preview-header">
            <span className="flow-canvas__preview-title">{previewMap.name}</span>
            <button className="flow-canvas__preview-close" onClick={() => setPreviewMapId(null)}>✕</button>
          </div>
          <div className="flow-canvas__preview-content">
            <ReactFlowProvider>
              <FlowPane map={previewMap} isPreview />
            </ReactFlowProvider>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-canvas">
      <FlowPane map={activeMap} onNodeSelect={onNodeSelect} />
    </div>
  );
}
