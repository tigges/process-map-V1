import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { JourneyNodeData } from '../types';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const TERMINAL_SIZE = 56;
const DECISION_SIZE = 100;

function getNodeDimensions(nodeType: string): { width: number; height: number } {
  if (nodeType === 'start' || nodeType === 'end') return { width: TERMINAL_SIZE, height: TERMINAL_SIZE };
  if (nodeType === 'decision') return { width: DECISION_SIZE, height: DECISION_SIZE };
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

const COL_WIDTH = 200;
const ROW_HEIGHT = 80;
const MAX_STACK = 5;

export function layoutSmartFlow(
  nodes: Node<JourneyNodeData>[],
  edges: Edge[],
): { nodes: Node<JourneyNodeData>[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };
  if (nodes.length <= 3) return layoutWithDagre(nodes, edges, 'LR');

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();

  for (const edge of edges) {
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source)!.push(edge.target);
    parentOf.set(edge.target, edge.source);
  }

  const roots = nodes.filter((n) => !parentOf.has(n.id));
  if (roots.length === 0) return layoutWithDagre(nodes, edges, 'LR');

  const mainPath: string[] = [];
  const branchNodes = new Map<string, string[]>();
  const visited = new Set<string>();

  function traceMainPath(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    mainPath.push(nodeId);

    const children = childrenOf.get(nodeId) ?? [];
    if (children.length === 0) return;

    const node = nodeMap.get(nodeId);
    const nodeData = node?.data as JourneyNodeData | undefined;

    if (nodeData?.nodeType === 'decision') {
      const mainChild = children.find((cid) => {
        const edge = edges.find((e) => e.source === nodeId && e.target === cid);
        return !edge?.label || edge.label === 'Yes';
      });
      const otherChildren = children.filter((cid) => cid !== mainChild);
      if (otherChildren.length > 0) {
        branchNodes.set(nodeId, otherChildren);
      }
      if (mainChild) traceMainPath(mainChild);
    } else {
      traceMainPath(children[0]);
      if (children.length > 1) {
        branchNodes.set(nodeId, children.slice(1));
      }
    }
  }

  traceMainPath(roots[0].id);

  const positioned = new Map<string, { x: number; y: number }>();
  let col = 0;
  let stackCount = 0;
  let isFirstInColumn = true;

  for (const nodeId of mainPath) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const data = node.data as JourneyNodeData;
    const isDecision = data.nodeType === 'decision';
    const isTerminal = data.nodeType === 'start' || data.nodeType === 'end';

    if (isDecision || isTerminal) {
      if (!isFirstInColumn && stackCount > 0) {
        col++;
      }
      positioned.set(nodeId, { x: col * COL_WIDTH, y: 0 });
      stackCount = 0;
      isFirstInColumn = true;
      col++;
    } else {
      if (stackCount >= MAX_STACK) {
        col++;
        stackCount = 0;
      }
      positioned.set(nodeId, { x: col * COL_WIDTH, y: (isFirstInColumn ? 0 : stackCount) * ROW_HEIGHT });
      if (isFirstInColumn) {
        isFirstInColumn = false;
        stackCount = 1;
      } else {
        stackCount++;
      }
    }
  }

  for (const [parentId, branchIds] of branchNodes) {
    const parentPos = positioned.get(parentId);
    if (!parentPos) continue;

    branchIds.forEach((bid, bi) => {
      if (!positioned.has(bid)) {
        positioned.set(bid, {
          x: parentPos.x,
          y: parentPos.y + (bi + 1) * ROW_HEIGHT + ROW_HEIGHT,
        });
      }
    });
  }

  for (const node of nodes) {
    if (!positioned.has(node.id)) {
      positioned.set(node.id, { x: col * COL_WIDTH, y: 0 });
      col++;
    }
  }

  const positionedNodes = nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) ?? { x: 0, y: 0 },
  }));

  return { nodes: positionedNodes, edges };
}
