import { nanoid } from 'nanoid';
import type { ProcessMapProject, ProcessMap, JourneyNodeData } from '../types';
import type { Node, Edge } from '@xyflow/react';

function makeNode(
  id: string,
  x: number,
  y: number,
  data: JourneyNodeData,
): Node<JourneyNodeData> {
  return { id, type: 'journeyNode', position: { x, y }, data };
}

function makeEdge(source: string, target: string, label?: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    label,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#94a3b8', strokeWidth: 2 },
    ...(label ? { labelStyle: { fontSize: 11, fontWeight: 600 } } : {}),
  };
}

export function createSampleProject(): ProcessMapProject {
  const projectId = nanoid();
  const rootMapId = nanoid();
  const regSubMapId = nanoid();
  const onboardSubMapId = nanoid();

  const rootNodes: Node<JourneyNodeData>[] = [
    makeNode('awareness', 0, 0, {
      label: 'Awareness', description: 'User discovers the product (4 steps)',
      nodeType: 'subprocess', color: '#64748b', subMapId: regSubMapId,
    }),
    makeNode('consideration', 300, 0, {
      label: 'Consideration', description: 'User evaluates options (3 steps)',
      nodeType: 'subprocess', color: '#64748b', subMapId: onboardSubMapId,
    }),
    makeNode('engagement', 600, 0, {
      label: 'Engagement', description: 'Active product usage',
      nodeType: 'subprocess', color: '#64748b',
    }),
  ];

  const regNodes: Node<JourneyNodeData>[] = [
    makeNode('r-start', 0, 0, { label: 'Start', description: '', nodeType: 'start', color: '#22c55e' }),
    makeNode('r-visit', 260, 0, { label: 'Visit landing page', description: 'User arrives from ad or referral', nodeType: 'action', color: '#3b82f6' }),
    makeNode('r-decide', 520, 0, { label: 'Interested?', description: 'User decides to sign up', nodeType: 'decision', color: '#eab308' }),
    makeNode('r-signup', 780, 0, { label: 'Create account', description: 'Fill registration form', nodeType: 'action', color: '#3b82f6' }),
    makeNode('r-end', 1040, 0, { label: 'End', description: '', nodeType: 'end', color: '#ef4444' }),
    makeNode('r-leave', 520, 140, { label: 'Leave site', description: 'User exits', nodeType: 'action', color: '#3b82f6' }),
  ];

  const regEdges: Edge[] = [
    makeEdge('r-start', 'r-visit'),
    makeEdge('r-visit', 'r-decide'),
    { ...makeEdge('r-decide', 'r-signup', 'Yes'), sourceHandle: 'right' },
    { ...makeEdge('r-decide', 'r-leave', 'No'), sourceHandle: 'bottom' },
    makeEdge('r-signup', 'r-end'),
  ];

  const onboardNodes: Node<JourneyNodeData>[] = [
    makeNode('o-start', 0, 0, { label: 'Start', description: '', nodeType: 'start', color: '#22c55e' }),
    makeNode('o-welcome', 260, 0, { label: 'Welcome screen', description: 'First-time greeting', nodeType: 'action', color: '#3b82f6' }),
    makeNode('o-tutorial', 520, 0, { label: 'Take tutorial?', description: '', nodeType: 'decision', color: '#eab308' }),
    makeNode('o-guided', 780, 0, { label: 'Guided tour', description: 'Step-by-step walkthrough', nodeType: 'action', color: '#3b82f6' }),
    makeNode('o-skip', 520, 140, { label: 'Free explore', description: 'User explores on their own', nodeType: 'action', color: '#3b82f6' }),
    makeNode('o-end', 1040, 0, { label: 'End', description: '', nodeType: 'end', color: '#ef4444' }),
  ];

  const onboardEdges: Edge[] = [
    makeEdge('o-start', 'o-welcome'),
    makeEdge('o-welcome', 'o-tutorial'),
    { ...makeEdge('o-tutorial', 'o-guided', 'Yes'), sourceHandle: 'right' },
    { ...makeEdge('o-tutorial', 'o-skip', 'No'), sourceHandle: 'bottom' },
    makeEdge('o-guided', 'o-end'),
    makeEdge('o-skip', 'o-end'),
  ];

  const rootMap: ProcessMap = {
    id: rootMapId, name: 'Overview', description: 'High-level user journey categories',
    parentMapId: null, parentNodeId: null, nodes: rootNodes, edges: [],
  };

  const regMap: ProcessMap = {
    id: regSubMapId, name: 'Awareness', description: 'Discovery flow',
    parentMapId: rootMapId, parentNodeId: 'awareness', nodes: regNodes, edges: regEdges,
  };

  const onboardMap: ProcessMap = {
    id: onboardSubMapId, name: 'Consideration', description: 'Evaluation flow',
    parentMapId: rootMapId, parentNodeId: 'consideration', nodes: onboardNodes, edges: onboardEdges,
  };

  return {
    id: projectId, name: 'Sample Flow Chart', description: 'A sample project with Start → Action → Decision → End flow',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    rootMapId, maps: { [rootMapId]: rootMap, [regSubMapId]: regMap, [onboardSubMapId]: onboardMap },
  };
}
