import { useCallback, useRef, useMemo, useEffect, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  type ReactFlowInstance,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import JourneyNode from './JourneyNode';
import { useAppStore } from '../store/useAppStore';
import type { JourneyNodeType, JourneyNodeData } from '../types';

const nodeTypes = { journeyNode: JourneyNode };

export default function FlowCanvas({ onNodeSelect }: { onNodeSelect?: () => void }) {
  const reactFlowRef = useRef<ReactFlowInstance<Node<JourneyNodeData>, Edge> | null>(null);
  const { fitView } = useReactFlow();

  const activeMapId = useAppStore((s) => s.activeMapId);
  const activeMap = useAppStore((s) => s.getActiveMap());
  const onNodesChange = useAppStore((s) => s.onNodesChange);
  const onEdgesChange = useAppStore((s) => s.onEdgesChange);
  const onConnect = useAppStore((s) => s.onConnect);
  const addNode = useAppStore((s) => s.addNode);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const persist = useAppStore((s) => s.persist);

  const nodes = useMemo(() => activeMap?.nodes ?? [], [activeMap]);
  const edges = useMemo(() => activeMap?.edges ?? [], [activeMap]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.15, duration: 300 });
    }, 50);
    return () => clearTimeout(timer);
  }, [activeMapId, fitView]);

  const onInit = useCallback((instance: ReactFlowInstance<Node<JourneyNodeData>, Edge>) => {
    reactFlowRef.current = instance;
    instance.fitView({ padding: 0.15 });
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/processmap-nodetype') as JourneyNodeType;
      if (!type || !reactFlowRef.current) return;

      const position = reactFlowRef.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      addNode(type, position);
    },
    [addNode],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const onNodeClick = useCallback(() => {
    onNodeSelect?.();
  }, [onNodeSelect]);

  const onNodeDragStop = useCallback(() => {
    persist();
  }, [persist]);

  if (!activeMap) {
    return (
      <div className="canvas-empty">
        <h2>No map selected</h2>
        <p>Create or select a project to get started.</p>
      </div>
    );
  }

  return (
    <div className="flow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as Record<string, unknown>;
            return (d?.color as string) ?? '#94a3b8';
          }}
          maskColor="rgba(0,0,0,0.08)"
          style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  );
}
