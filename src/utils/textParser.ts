import { nanoid } from 'nanoid';
import type { ProcessMapProject, ProcessMap, JourneyNodeData, JourneyNodeType } from '../types';
import type { Node, Edge } from '@xyflow/react';

export interface ParsedStep {
  id: string;
  label: string;
  description: string;
  nodeType: JourneyNodeType;
  children: ParsedStep[];
  indent: number;
}

const TYPE_KEYWORDS: Record<string, JourneyNodeType> = {
  'phase': 'phase',
  'stage': 'phase',
  'step': 'action',
  'action': 'action',
  'touchpoint': 'touchpoint',
  'touch point': 'touchpoint',
  'channel': 'touchpoint',
  'decision': 'decision',
  'choose': 'decision',
  'if ': 'decision',
  'emotion': 'emotion',
  'feeling': 'emotion',
  'feel': 'emotion',
  'pain': 'painPoint',
  'pain point': 'painPoint',
  'frustration': 'painPoint',
  'problem': 'painPoint',
  'issue': 'painPoint',
  'opportunity': 'opportunity',
  'improve': 'opportunity',
  'idea': 'opportunity',
  'subprocess': 'subprocess',
  'sub-process': 'subprocess',
  'sub process': 'subprocess',
  'detail': 'subprocess',
};

const NODE_COLORS: Record<JourneyNodeType, string> = {
  phase: '#6366f1',
  touchpoint: '#0ea5e9',
  action: '#10b981',
  decision: '#f59e0b',
  emotion: '#ec4899',
  painPoint: '#ef4444',
  opportunity: '#8b5cf6',
  subprocess: '#64748b',
};

function detectNodeType(text: string): JourneyNodeType {
  const lower = text.toLowerCase();

  for (const [keyword, type] of Object.entries(TYPE_KEYWORDS)) {
    if (lower.includes(keyword)) return type;
  }

  if (lower.includes('?') || lower.startsWith('should') || lower.startsWith('does') || lower.startsWith('will') || lower.startsWith('can')) {
    return 'decision';
  }

  return 'phase';
}

function extractTypePrefix(line: string): { type: JourneyNodeType | null; cleaned: string } {
  const prefixPattern = /^\[(\w[\w\s-]*)\]\s*/i;
  const match = line.match(prefixPattern);
  if (match) {
    const tag = match[1].toLowerCase().trim();
    const mapped = TYPE_KEYWORDS[tag];
    if (mapped) {
      return { type: mapped, cleaned: line.slice(match[0].length) };
    }
  }
  return { type: null, cleaned: line };
}

function parseIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  const spaces = match ? match[1].length : 0;
  return Math.floor(spaces / 2);
}

function cleanLine(line: string): string {
  return line
    .replace(/^[\s]*[-*•→>]+\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .trim();
}

function splitLabelDescription(text: string): { label: string; description: string } {
  const colonIdx = text.indexOf(':');
  if (colonIdx > 0 && colonIdx < 60) {
    return {
      label: text.slice(0, colonIdx).trim(),
      description: text.slice(colonIdx + 1).trim(),
    };
  }
  const dashIdx = text.indexOf(' - ');
  if (dashIdx > 0 && dashIdx < 60) {
    return {
      label: text.slice(0, dashIdx).trim(),
      description: text.slice(dashIdx + 3).trim(),
    };
  }
  return { label: text.slice(0, 50), description: text.length > 50 ? text : '' };
}

export function parseTextToSteps(text: string): ParsedStep[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const steps: ParsedStep[] = [];
  const stack: { step: ParsedStep; indent: number }[] = [];

  for (const rawLine of lines) {
    const indent = parseIndent(rawLine);
    const cleaned = cleanLine(rawLine);
    if (!cleaned) continue;

    const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(cleaned);
    const { label, description } = splitLabelDescription(afterPrefix);
    const nodeType = explicitType ?? detectNodeType(afterPrefix);

    const step: ParsedStep = {
      id: nanoid(),
      label,
      description,
      nodeType,
      children: [],
      indent,
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length > 0) {
      stack[stack.length - 1].step.children.push(step);
    } else {
      steps.push(step);
    }

    stack.push({ step, indent });
  }

  return steps;
}

function makeEdge(sourceId: string, targetId: string, label?: string): Edge {
  return {
    id: `e-${sourceId}-${targetId}`,
    source: sourceId,
    target: targetId,
    label,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#94a3b8', strokeWidth: 2 },
  };
}

function gridPosition(index: number, columns: number, nodeWidth: number, nodeHeight: number): { x: number; y: number } {
  const xGap = nodeWidth + 40;
  const yGap = nodeHeight + 40;
  const col = index % columns;
  const row = Math.floor(index / columns);
  return { x: col * xGap, y: row * yGap };
}

function layoutChildSteps(
  steps: ParsedStep[],
  isLeafLevel: boolean,
): { nodes: Node<JourneyNodeData>[]; edges: Edge[] } {
  const nodes: Node<JourneyNodeData>[] = [];
  const edges: Edge[] = [];
  const columns = Math.min(Math.ceil(Math.sqrt(steps.length)), 4);

  steps.forEach((step, i) => {
    const id = nanoid();
    const pos = gridPosition(i, columns, 240, 100);
    nodes.push({
      id,
      type: 'journeyNode',
      position: pos,
      data: {
        label: step.label,
        description: step.description,
        nodeType: step.nodeType,
        color: NODE_COLORS[step.nodeType],
      },
    });

    if (isLeafLevel && i > 0) {
      edges.push(makeEdge(nodes[i - 1].id, id));
    }
  });

  return { nodes, edges };
}

export function stepsToProject(steps: ParsedStep[], projectName: string, isDraft: boolean): ProcessMapProject {
  const projectId = nanoid();
  const rootMapId = nanoid();
  const maps: Record<string, ProcessMap> = {};

  const topLevel = steps.filter((s) => s.indent === 0);
  const phases = topLevel.length > 0 ? topLevel : steps;

  const phaseNodes: Node<JourneyNodeData>[] = [];
  const phaseEdges: Edge[] = [];
  const columns = Math.min(Math.ceil(Math.sqrt(phases.length)), 4);

  phases.forEach((phase, i) => {
    const nodeId = nanoid();
    const hasChildren = phase.children.length > 0;

    let subMapId: string | undefined;
    if (hasChildren) {
      subMapId = nanoid();
      const anyChildHasChildren = phase.children.some((c) => c.children.length > 0);
      const { nodes: subNodes, edges: subEdges } = layoutChildSteps(phase.children, !anyChildHasChildren);
      maps[subMapId] = {
        id: subMapId,
        name: `${phase.label}`,
        description: phase.description || `Details for ${phase.label}`,
        parentMapId: rootMapId,
        parentNodeId: nodeId,
        nodes: subNodes,
        edges: subEdges,
      };
    }

    const childCount = phase.children.length;
    const desc = phase.description
      ? `${phase.description}${hasChildren ? ` (${childCount} steps)` : ''}`
      : hasChildren ? `${childCount} steps — open to explore` : '';

    const pos = gridPosition(i, columns, 240, 120);

    phaseNodes.push({
      id: nodeId,
      type: 'journeyNode',
      position: pos,
      data: {
        label: phase.label,
        description: desc,
        nodeType: hasChildren ? 'subprocess' : phase.nodeType,
        color: hasChildren ? NODE_COLORS.subprocess : NODE_COLORS[phase.nodeType],
        subMapId,
      },
    });
  });

  maps[rootMapId] = {
    id: rootMapId,
    name: 'Overview',
    description: 'Top-level journey phases',
    parentMapId: null,
    parentNodeId: null,
    nodes: phaseNodes,
    edges: phaseEdges,
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
