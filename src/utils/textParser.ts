import { nanoid } from 'nanoid';
import type { ProcessMapProject, ProcessMap, JourneyNodeData, JourneyNodeType } from '../types';
import type { Node, Edge } from '@xyflow/react';
import { layoutWithDagre } from './layoutEngine';

export interface ParsedStep {
  id: string;
  label: string;
  description: string;
  nodeType: JourneyNodeType;
  children: ParsedStep[];
  indent: number;
}

const NODE_COLORS: Record<JourneyNodeType, string> = {
  start: '#22c55e',
  action: '#3b82f6',
  decision: '#eab308',
  end: '#ef4444',
  subprocess: '#64748b',
};

const CATEGORY_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#e11d48', '#7c3aed', '#059669',
];

const ASCII_ART = /[─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬▼▲►◄●○■□▪▫◆◇★☆✓✗←↑↓⇒⇐⇑⇓]/g;
const ARROW_CHAR = /→/g;
const SEPARATOR_LINE = /^[\s─═\-_~*#]{4,}$/;
const BOX_LINE = /^[\s]*[┌┐└┘├┤│║╔╗╚╝╠╣].*/;

function stripAsciiArt(text: string): string {
  return text
    .split('\n')
    .filter((line) => !SEPARATOR_LINE.test(line))
    .filter((line) => !BOX_LINE.test(line))
    .map((line) => line.replace(ASCII_ART, ' ').replace(ARROW_CHAR, ' -> ').replace(/\s{2,}/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

const EXPLICIT_TAGS: Record<string, JourneyNodeType> = {
  'start': 'start', 'begin': 'start',
  'end': 'end', 'finish': 'end', 'resolve': 'end',
  'action': 'action', 'step': 'action', 'touchpoint': 'action',
  'touch point': 'action', 'pain point': 'action', 'pain': 'action',
  'opportunity': 'action', 'emotion': 'action',
  'decision': 'decision', 'check': 'decision',
  'subprocess': 'subprocess', 'sub-process': 'subprocess',
  'sub process': 'subprocess', 'phase': 'subprocess',
  'stage': 'subprocess', 'category': 'subprocess',
};

function extractTypePrefix(line: string): { type: JourneyNodeType | null; cleaned: string } {
  const match = line.match(/^\[(\w[\w\s-]*)\]\s*/i);
  if (match) {
    const tag = match[1].toLowerCase().trim();
    const mapped = EXPLICIT_TAGS[tag];
    if (mapped) return { type: mapped, cleaned: line.slice(match[0].length) };
  }
  return { type: null, cleaned: line };
}

function splitLabelDescription(text: string): { label: string; description: string } {
  const colonIdx = text.indexOf(':');
  if (colonIdx > 0 && colonIdx < 60) {
    return { label: text.slice(0, colonIdx).trim(), description: text.slice(colonIdx + 1).trim() };
  }
  const dashIdx = text.indexOf(' - ');
  if (dashIdx > 0 && dashIdx < 60) {
    return { label: text.slice(0, dashIdx).trim(), description: text.slice(dashIdx + 3).trim() };
  }
  return { label: text.slice(0, 50), description: text.length > 50 ? text : '' };
}

function isNumberedLine(line: string): boolean {
  return /^\d+[.)]\s/.test(line.trim());
}

function isTaggedLine(line: string): boolean {
  return /^\[[\w\s-]+\]\s/.test(line.trim());
}

function isDashedLine(line: string): boolean {
  return /^[\s]*[-*•]\s/.test(line);
}

function isHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (isNumberedLine(trimmed)) return true;
  if (isDashedLine(trimmed) || isTaggedLine(trimmed)) return false;
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-Z]/.test(trimmed)) return true;
  if (/^#{1,3}\s/.test(trimmed)) return true;
  return false;
}

function cleanHeaderPrefix(line: string): string {
  return line.trim()
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^#{1,3}\s*/, '')
    .trim();
}

function cleanDashPrefix(line: string): string {
  return line.trim().replace(/^[-*•]\s*/, '');
}

export function parseTextToSteps(text: string): ParsedStep[] {
  const cleaned = stripAsciiArt(text);
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0);
  const steps: ParsedStep[] = [];

  let currentParent: ParsedStep | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (isHeaderLine(trimmed)) {
      const content = cleanHeaderPrefix(trimmed);
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(content);
      const { label, description } = splitLabelDescription(afterPrefix);

      currentParent = {
        id: nanoid(),
        label,
        description,
        nodeType: explicitType ?? 'subprocess',
        children: [],
        indent: 0,
      };
      steps.push(currentParent);
    } else if (currentParent) {
      const content = isDashedLine(trimmed) ? cleanDashPrefix(trimmed) : trimmed;
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(content);
      const { label, description } = splitLabelDescription(afterPrefix);
      const nodeType = explicitType ?? 'action';

      currentParent.children.push({
        id: nanoid(),
        label,
        description,
        nodeType,
        children: [],
        indent: 1,
      });
    } else {
      const content = isDashedLine(trimmed) ? cleanDashPrefix(trimmed) : trimmed;
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(content);
      const { label, description } = splitLabelDescription(afterPrefix);

      currentParent = {
        id: nanoid(),
        label,
        description,
        nodeType: explicitType ?? 'action',
        children: [],
        indent: 0,
      };
      steps.push(currentParent);
    }
  }

  for (const step of steps) {
    if (step.children.length > 0 && step.nodeType !== 'subprocess') {
      step.nodeType = 'subprocess';
    }
  }

  return steps;
}

function makeEdge(sourceId: string, targetId: string, label?: string, sourceHandle?: string): Edge {
  return {
    id: `e-${sourceId}-${targetId}`,
    source: sourceId,
    target: targetId,
    label,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#94a3b8', strokeWidth: 2 },
    ...(label ? { labelStyle: { fontSize: 11, fontWeight: 600 } } : {}),
    ...(sourceHandle ? { sourceHandle } : {}),
  };
}

function buildFlowMap(
  steps: ParsedStep[],
): { nodes: Node<JourneyNodeData>[]; edges: Edge[] } {
  const rawNodes: Node<JourneyNodeData>[] = [];
  const rawEdges: Edge[] = [];

  const startId = nanoid();
  rawNodes.push({
    id: startId, type: 'journeyNode', position: { x: 0, y: 0 },
    data: { label: 'Start', description: '', nodeType: 'start', color: NODE_COLORS.start },
  });

  let prevId = startId;

  steps.forEach((step) => {
    const nodeId = nanoid();
    rawNodes.push({
      id: nodeId, type: 'journeyNode', position: { x: 0, y: 0 },
      data: {
        label: step.label, description: step.description,
        nodeType: step.nodeType, color: NODE_COLORS[step.nodeType],
      },
    });
    rawEdges.push(makeEdge(prevId, nodeId));

    if (step.nodeType === 'decision') {
      const branchId = nanoid();
      const branchLabel = step.description ? step.description.slice(0, 40) : 'Alt path';
      rawNodes.push({
        id: branchId, type: 'journeyNode', position: { x: 0, y: 0 },
        data: { label: branchLabel, description: '', nodeType: 'action', color: NODE_COLORS.action },
      });
      rawEdges.push(makeEdge(nodeId, branchId, 'No', 'bottom'));
    }

    prevId = nodeId;
  });

  const endId = nanoid();
  rawNodes.push({
    id: endId, type: 'journeyNode', position: { x: 0, y: 0 },
    data: { label: 'End', description: '', nodeType: 'end', color: NODE_COLORS.end },
  });
  rawEdges.push(makeEdge(prevId, endId));

  return layoutWithDagre(rawNodes, rawEdges, 'LR');
}

const CLUSTER_KEYWORDS: Record<string, string[]> = {
  'Account': ['account', 'registration', 'login', 'password', 'profile', 'username', 'email change', 'phone change', 'personal info', 'duplicate', 'reopening', 'closure', 'close', 'frozen', 'reopen'],
  'Financial': ['deposit', 'withdrawal', 'payment', 'cashier', 'commission', 'wager', 'rollover', 'arn', 'noda', 'credit card', 'bank', 'funds', 'pending', 'complete'],
  'Verification': ['verification', 'kyc', 'document', 'dvs', 'identity', 'id', 'selfie', 'proof'],
  'Bonuses': ['bonus', 'promo', 'cashback', 'welcome', 'wagering', 'crab', 'hunter', 'abuser', 'free spin', 'reward'],
  'Security': ['security', 'fraud', 'gdpr', 'data', 'hacked', 'suspicious', 'underage', 'complaint', 'refund', 'missing win'],
  'Responsible Gaming': ['self-harm', 'gambling addiction', 'responsible', 'helpline', 'self-exclusion', 'care'],
  'VIP': ['vip', 'platinum', 'diamond', 'gold', 'silver', 'bronze', 'loyalty'],
  'Technical': ['browser', 'cache', 'ad blocker', 'pop-up', '3ds', 'technical', 'error', 'bug', 'unresponsive'],
  'Marketing': ['marketing', 'subscription', 'unsubscribe', 'email campaign', 'newsletter', 'promo'],
  'Escalation': ['escalat', 'slack', 'channel', 'manager', 'sm ', 'sport_request'],
};

function classifyStep(step: ParsedStep): string {
  const text = `${step.label} ${step.description}`.toLowerCase();
  let bestCluster = '';
  let bestScore = 0;

  for (const [cluster, keywords] of Object.entries(CLUSTER_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCluster = cluster;
    }
  }

  return bestScore > 0 ? bestCluster : '';
}

function isGraveyardItem(step: ParsedStep): boolean {
  const label = step.label.trim();
  if (label.length <= 3) return true;
  if (/^\d+$/.test(label)) return true;
  if (/^[.\-_=*#]+$/.test(label)) return true;
  if (label.toLowerCase() === 'undefined' || label.toLowerCase() === 'null') return true;
  if (!step.description && step.children.length === 0 && label.length < 5 && !/[a-zA-Z]{3,}/.test(label)) return true;
  return false;
}

export function stepsToProject(steps: ParsedStep[], projectName: string, isDraft: boolean): ProcessMapProject {
  const projectId = nanoid();
  const rootMapId = nanoid();
  const maps: Record<string, ProcessMap> = {};

  const validSteps: ParsedStep[] = [];
  const graveyardSteps: ParsedStep[] = [];

  for (const step of steps) {
    if (isGraveyardItem(step)) {
      graveyardSteps.push(step);
    } else {
      validSteps.push(step);
    }
  }

  const clustered: Record<string, ParsedStep[]> = {};
  const unclustered: ParsedStep[] = [];

  for (const step of validSteps) {
    const cluster = classifyStep(step);
    if (cluster) {
      if (!clustered[cluster]) clustered[cluster] = [];
      clustered[cluster].push(step);
    } else {
      unclustered.push(step);
    }
  }

  const rawOverviewNodes: Node<JourneyNodeData>[] = [];
  let colorIdx = 0;

  for (const [clusterName, clusterSteps] of Object.entries(clustered)) {
    const categoryColor = CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length];
    colorIdx++;

    if (clusterSteps.length === 1 && clusterSteps[0].children.length > 0) {
      const step = clusterSteps[0];
      const nodeId = nanoid();
      const subMapId = nanoid();
      const { nodes: subNodes, edges: subEdges } = buildFlowMap(step.children);
      maps[subMapId] = {
        id: subMapId, name: step.label,
        description: step.description || `Details for ${step.label}`,
        parentMapId: rootMapId, parentNodeId: nodeId,
        nodes: subNodes, edges: subEdges,
      };
      rawOverviewNodes.push({
        id: nodeId, type: 'journeyNode', position: { x: 0, y: 0 },
        data: {
          label: step.label,
          description: `${step.description || ''} (${step.children.length} steps)`.trim(),
          nodeType: 'subprocess', color: categoryColor, subMapId,
        },
      });
    } else {
      const nodeId = nanoid();
      const subMapId = nanoid();

      const allChildren: ParsedStep[] = [];
      for (const step of clusterSteps) {
        if (step.children.length > 0) {
          allChildren.push(...step.children);
        } else {
          allChildren.push(step);
        }
      }

      const { nodes: subNodes, edges: subEdges } = buildFlowMap(
        allChildren.length > 0 ? allChildren : clusterSteps,
      );
      maps[subMapId] = {
        id: subMapId, name: clusterName,
        description: `${clusterSteps.length} topics in this category`,
        parentMapId: rootMapId, parentNodeId: nodeId,
        nodes: subNodes, edges: subEdges,
      };

      const stepCount = allChildren.length || clusterSteps.length;
      rawOverviewNodes.push({
        id: nodeId, type: 'journeyNode', position: { x: 0, y: 0 },
        data: {
          label: clusterName,
          description: `${clusterSteps.map((s) => s.label).join(', ').slice(0, 80)} (${stepCount} steps)`,
          nodeType: 'subprocess', color: categoryColor, subMapId,
        },
      });
    }
  }

  for (const step of unclustered) {
    const nodeId = nanoid();
    const hasChildren = step.children.length > 0;
    const categoryColor = CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length];
    colorIdx++;

    let subMapId: string | undefined;
    if (hasChildren) {
      subMapId = nanoid();
      const { nodes: subNodes, edges: subEdges } = buildFlowMap(step.children);
      maps[subMapId] = {
        id: subMapId, name: step.label,
        description: step.description || `Details for ${step.label}`,
        parentMapId: rootMapId, parentNodeId: nodeId,
        nodes: subNodes, edges: subEdges,
      };
    }

    rawOverviewNodes.push({
      id: nodeId, type: 'journeyNode', position: { x: 0, y: 0 },
      data: {
        label: step.label,
        description: step.description
          ? `${step.description}${hasChildren ? ` (${step.children.length} steps)` : ''}`
          : hasChildren ? `${step.children.length} steps` : '',
        nodeType: hasChildren ? 'subprocess' : step.nodeType,
        color: hasChildren ? categoryColor : NODE_COLORS[step.nodeType],
        subMapId,
      },
    });
  }

  if (graveyardSteps.length > 0) {
    const graveyardId = nanoid();
    const graveyardMapId = nanoid();
    const graveyardNodes: Node<JourneyNodeData>[] = graveyardSteps.map((step, i) => ({
      id: nanoid(), type: 'journeyNode' as const,
      position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 100 },
      data: { label: step.label, description: step.description, nodeType: 'action' as const, color: '#94a3b8' },
    }));

    maps[graveyardMapId] = {
      id: graveyardMapId, name: 'Unclassified Items',
      description: `${graveyardSteps.length} items that could not be categorized — review and reassign`,
      parentMapId: rootMapId, parentNodeId: graveyardId,
      nodes: graveyardNodes, edges: [],
    };

    rawOverviewNodes.push({
      id: graveyardId, type: 'journeyNode', position: { x: 0, y: 0 },
      data: {
        label: 'Unclassified Items',
        description: `${graveyardSteps.length} items to review`,
        nodeType: 'subprocess', color: '#94a3b8', subMapId: graveyardMapId,
      },
    });
  }

  const columns = Math.min(Math.ceil(Math.sqrt(rawOverviewNodes.length)), 4);
  const overviewNodes = rawOverviewNodes.map((node, i) => ({
    ...node,
    position: {
      x: (i % columns) * 280,
      y: Math.floor(i / columns) * 160,
    },
  }));

  maps[rootMapId] = {
    id: rootMapId,
    name: 'Overview',
    description: 'Top-level categories',
    parentMapId: null,
    parentNodeId: null,
    nodes: overviewNodes,
    edges: [],
  };

  return {
    id: projectId,
    name: projectName,
    description: isDraft ? 'Draft — review and finalize' : 'Imported from text',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rootMapId,
    maps,
    isDraft,
  };
}

export function parseTextToProject(text: string, projectName: string): ProcessMapProject {
  const steps = parseTextToSteps(text);
  return stepsToProject(steps, projectName, false);
}
