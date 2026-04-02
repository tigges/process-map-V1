import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { JourneyNodeData } from '../types';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const TERMINAL_SIZE = 56;
const DECISION_SIZE = 100;
const SUBPROCESS_STACK_GAP_Y = 140;
const SUBPROCESS_STACK_MIN_ITEMS = 2;

function getNodeDimensions(nodeType: string): { width: number; height: number } {
  if (nodeType === 'start' || nodeType === 'end') return { width: TERMINAL_SIZE, height: TERMINAL_SIZE };
  if (nodeType === 'decision') return { width: DECISION_SIZE, height: DECISION_SIZE };
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}

function isSubprocessNode(node: Node<JourneyNodeData> | undefined): boolean {
  if (!node) return false;
  const d = node.data as JourneyNodeData;
  return d.nodeType === 'subprocess';
}

function pushMapValue(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function buildAdjacency(edges: Edge[]): { outgoing: Map<string, string[]>; incoming: Map<string, string[]> } {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    pushMapValue(outgoing, edge.source, edge.target);
    pushMapValue(incoming, edge.target, edge.source);
  }
  return { outgoing, incoming };
}

function orderIdsByPosition(ids: string[], byId: Map<string, Node<JourneyNodeData>>): string[] {
  return [...ids].sort((a, b) => {
    const aNode = byId.get(a);
    const bNode = byId.get(b);
    if (!aNode || !bNode) return a.localeCompare(b);
    if (aNode.position.y !== bNode.position.y) return aNode.position.y - bNode.position.y;
    if (aNode.position.x !== bNode.position.x) return aNode.position.x - bNode.position.x;
    return a.localeCompare(b);
  });
}

function stackNodesVertically(
  ids: string[],
  byId: Map<string, Node<JourneyNodeData>>,
  alignX: number,
): void {
  if (ids.length < SUBPROCESS_STACK_MIN_ITEMS) return;
  const ys = ids.map((id) => byId.get(id)?.position.y ?? 0);
  const centerY = ys.reduce((sum, y) => sum + y, 0) / ids.length;
  const startY = centerY - ((ids.length - 1) * SUBPROCESS_STACK_GAP_Y) / 2;
  ids.forEach((id, idx) => {
    const node = byId.get(id);
    if (!node) return;
    node.position = { x: alignX, y: startY + idx * SUBPROCESS_STACK_GAP_Y };
  });
}

function applySiblingSubprocessStacks(
  byId: Map<string, Node<JourneyNodeData>>,
  outgoing: Map<string, string[]>,
): Set<string> {
  const moved = new Set<string>();
  const sortedSources = [...outgoing.keys()].sort();
  for (const sourceId of sortedSources) {
    const targets = outgoing.get(sourceId) ?? [];
    const subprocessTargets = orderIdsByPosition(
      targets.filter((id) => isSubprocessNode(byId.get(id))),
      byId,
    );
    if (subprocessTargets.length < SUBPROCESS_STACK_MIN_ITEMS) continue;
    const alignX = Math.max(...subprocessTargets.map((id) => byId.get(id)?.position.x ?? 0));
    stackNodesVertically(subprocessTargets, byId, alignX);
    for (const id of subprocessTargets) moved.add(id);
  }
  return moved;
}

function applyChainSubprocessStacks(
  byId: Map<string, Node<JourneyNodeData>>,
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
  locked: Set<string>,
): void {
  const subprocessIds = [...byId.values()]
    .filter((node) => isSubprocessNode(node))
    .map((node) => node.id)
    .sort((a, b) => {
      const aNode = byId.get(a);
      const bNode = byId.get(b);
      if (!aNode || !bNode) return a.localeCompare(b);
      if (aNode.position.x !== bNode.position.x) return aNode.position.x - bNode.position.x;
      return a.localeCompare(b);
    });

  const visited = new Set<string>();
  for (const rootId of subprocessIds) {
    if (visited.has(rootId) || locked.has(rootId)) continue;

    const incomingSub = (incoming.get(rootId) ?? []).filter((id) => isSubprocessNode(byId.get(id)));
    if (incomingSub.length > 0) continue;

    const chain: string[] = [rootId];
    visited.add(rootId);
    let cursor = rootId;
    while (true) {
      const nextSub = orderIdsByPosition(
        (outgoing.get(cursor) ?? []).filter((id) => isSubprocessNode(byId.get(id))),
        byId,
      );
      if (nextSub.length !== 1) break;
      const nextId = nextSub[0];
      if (visited.has(nextId) || locked.has(nextId)) break;
      const nextIncomingSub = (incoming.get(nextId) ?? []).filter((id) => isSubprocessNode(byId.get(id)));
      if (nextIncomingSub.length !== 1) break;
      chain.push(nextId);
      visited.add(nextId);
      cursor = nextId;
    }

    if (chain.length < SUBPROCESS_STACK_MIN_ITEMS) continue;
    const alignX = chain.reduce((sum, id) => sum + (byId.get(id)?.position.x ?? 0), 0) / chain.length;
    stackNodesVertically(chain, byId, alignX);
  }
}

function applySubprocessStacking(
  nodes: Node<JourneyNodeData>[],
  edges: Edge[],
): Node<JourneyNodeData>[] {
  const subprocessCount = nodes.reduce((count, node) => {
    const d = node.data as JourneyNodeData;
    return count + (d.nodeType === 'subprocess' ? 1 : 0);
  }, 0);

  if (subprocessCount < SUBPROCESS_STACK_MIN_ITEMS) return nodes;

  const cloned = nodes.map((node) => ({ ...node, position: { ...node.position } }));
  const byId = new Map(cloned.map((node) => [node.id, node]));
  const { outgoing, incoming } = buildAdjacency(edges);

  const siblingLocked = applySiblingSubprocessStacks(byId, outgoing);
  applyChainSubprocessStacks(byId, outgoing, incoming, siblingLocked);

  return cloned;
}

export function layoutWithDagre(
  nodes: Node<JourneyNodeData>[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR',
): { nodes: Node<JourneyNodeData>[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 30,
    ranksep: 60,
    edgesep: 20,
    marginx: 10,
    marginy: 10,
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
  if (nodes.length === 0) return { nodes, edges };
  const laidOut = layoutWithDagre(nodes, edges, 'LR');
  return {
    nodes: applySubprocessStacking(laidOut.nodes, edges),
    edges,
  };
}
