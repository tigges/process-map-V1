import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { JourneyNodeData } from '../types';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const TERMINAL_SIZE = 56;

function getNodeDimensions(nodeType: string): { width: number; height: number } {
  if (nodeType === 'start' || nodeType === 'end') return { width: TERMINAL_SIZE, height: TERMINAL_SIZE };
  if (nodeType === 'decision') return { width: 100, height: 100 };
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}

export function layoutWithDagre(
  nodes: Node<JourneyNodeData>[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR',
): { nodes: Node<JourneyNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 80,
    edgesep: 30,
    marginx: 20,
    marginy: 20,
  });

  for (const node of nodes) {
    const d = node.data as JourneyNodeData;
    const dim = getNodeDimensions(d.nodeType);
    g.setNode(node.id, { width: dim.width, height: dim.height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const d = node.data as JourneyNodeData;
    const dim = getNodeDimensions(d.nodeType);
    return {
      ...node,
      position: {
        x: pos.x - dim.width / 2,
        y: pos.y - dim.height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
