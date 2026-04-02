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

export function layoutSmartFlow(
  nodes: Node<JourneyNodeData>[],
  edges: Edge[],
): { nodes: Node<JourneyNodeData>[]; edges: Edge[] } {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();

  for (const edge of edges) {
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source)!.push(edge.target);
    parentOf.set(edge.target, edge.source);
  }

  const roots = nodes.filter((n) => !parentOf.has(n.id));
  if (roots.length === 0 && nodes.length > 0) return layoutWithDagre(nodes, edges, 'LR');

  const mainPathIds = new Set<string>();
  const visited = new Set<string>();

  function findMainPath(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    mainPathIds.add(nodeId);

    const children = childrenOf.get(nodeId) ?? [];
    const node = nodeMap.get(nodeId);
    const nodeData = node?.data as JourneyNodeData | undefined;

    if (nodeData?.nodeType === 'decision') {
      const mainChild = children.find((cid) => {
        const edge = edges.find((e) => e.source === nodeId && e.target === cid);
        return !edge?.label || edge.label === 'Yes';
      });
      if (mainChild) findMainPath(mainChild);
    } else if (children.length === 1) {
      findMainPath(children[0]);
    } else if (children.length > 1) {
      const primaryChild = children.find((cid) => {
        const cd = (nodeMap.get(cid)?.data as JourneyNodeData | undefined);
        return cd?.nodeType === 'decision' || cd?.nodeType === 'end';
      }) ?? children[0];
      findMainPath(primaryChild);
    }
  }

  if (roots.length > 0) {
    findMainPath(roots[0].id);
  }

  const mainPathNodes = nodes.filter((n) => mainPathIds.has(n.id));
  const detailNodes = nodes.filter((n) => !mainPathIds.has(n.id));

  const detailParent = new Map<string, string>();
  for (const dn of detailNodes) {
    const parent = parentOf.get(dn.id);
    if (parent && mainPathIds.has(parent)) {
      detailParent.set(dn.id, parent);
    } else {
      let ancestor = parentOf.get(dn.id);
      while (ancestor && !mainPathIds.has(ancestor)) {
        ancestor = parentOf.get(ancestor);
      }
      detailParent.set(dn.id, ancestor ?? (roots[0]?.id ?? ''));
    }
  }

  const xGap = 220;
  const yMainPath = 0;
  const yDetailStart = 160;
  const yDetailGap = 90;

  const mainPositions = new Map<string, number>();
  mainPathNodes.forEach((node, i) => {
    mainPositions.set(node.id, i);
  });

  const detailsByParent = new Map<string, Node<JourneyNodeData>[]>();
  for (const dn of detailNodes) {
    const pid = detailParent.get(dn.id) ?? '';
    if (!detailsByParent.has(pid)) detailsByParent.set(pid, []);
    detailsByParent.get(pid)!.push(dn);
  }

  const positionedNodes: Node<JourneyNodeData>[] = [];

  for (const node of mainPathNodes) {
    const col = mainPositions.get(node.id) ?? 0;
    const d = node.data as JourneyNodeData;
    const dim = getNodeDimensions(d.nodeType);
    positionedNodes.push({
      ...node,
      position: {
        x: col * xGap,
        y: yMainPath + (d.nodeType === 'decision' ? -20 : 0),
      },
    });

    const details = detailsByParent.get(node.id) ?? [];
    details.forEach((dn, di) => {
      positionedNodes.push({
        ...dn,
        position: {
          x: col * xGap + (dim.width - NODE_WIDTH) / 2,
          y: yDetailStart + di * yDetailGap,
        },
      });
    });
  }

  for (const dn of detailNodes) {
    if (!positionedNodes.find((n) => n.id === dn.id)) {
      positionedNodes.push({
        ...dn,
        position: { x: 0, y: yDetailStart + 200 },
      });
    }
  }

  return { nodes: positionedNodes, edges };
}
