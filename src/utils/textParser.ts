import { nanoid } from 'nanoid';
import type { ProcessMapProject, ProcessMap, JourneyNodeData, JourneyNodeType } from '../types';
import type { Node, Edge } from '@xyflow/react';

interface ParsedStep {
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

function layoutSteps(
  steps: ParsedStep[],
  startX: number,
  startY: number,
): { nodes: Node<JourneyNodeData>[]; edges: Edge[] } {
  const nodes: Node<JourneyNodeData>[] = [];
  const edges: Edge[] = [];
  const xGap = 300;
  const yGap = 140;

  steps.forEach((step, i) => {
    const id = nanoid();
    nodes.push({
      id,
      type: 'journeyNode',
      position: { x: startX + i * xGap, y: startY },
      data: {
        label: step.label,
        description: step.description,
        nodeType: step.nodeType,
        color: NODE_COLORS[step.nodeType],
      },
    });

    if (i > 0) {
      edges.push({
        id: `e-${nodes[i - 1].id}-${id}`,
        source: nodes[i - 1].id,
        target: id,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#94a3b8', strokeWidth: 2 },
      });
    }

    step.children.forEach((child, ci) => {
      const childId = nanoid();
      nodes.push({
        id: childId,
        type: 'journeyNode',
        position: { x: startX + i * xGap + (ci % 2 === 0 ? 0 : 150), y: startY + yGap + ci * yGap },
        data: {
          label: child.label,
          description: child.description,
          nodeType: child.nodeType,
          color: NODE_COLORS[child.nodeType],
        },
      });
      edges.push({
        id: `e-${id}-${childId}`,
        source: id,
        target: childId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#94a3b8', strokeWidth: 2 },
      });
    });
  });

  return { nodes, edges };
}

export function parseTextToProject(text: string, projectName: string): ProcessMapProject {
  const steps = parseTextToSteps(text);
  const projectId = nanoid();
  const rootMapId = nanoid();
  const maps: Record<string, ProcessMap> = {};

  const topLevelSteps = steps.filter((s) => s.children.length > 0 || s.indent === 0);
  const topLevel = topLevelSteps.length > 0 ? topLevelSteps : steps;

  const { nodes: rootNodes, edges: rootEdges } = layoutSteps(topLevel, 0, 0);

  const subMapsToCreate: { parentNodeId: string; children: ParsedStep[] }[] = [];
  topLevel.forEach((step, i) => {
    if (step.children.length > 0) {
      subMapsToCreate.push({
        parentNodeId: rootNodes[i].id,
        children: step.children,
      });
    }
  });

  for (const { parentNodeId, children } of subMapsToCreate) {
    if (children.length === 0) continue;
    const subMapId = nanoid();
    const parentNode = rootNodes.find((n) => n.id === parentNodeId);
    if (!parentNode) continue;

    parentNode.data = {
      ...parentNode.data,
      nodeType: 'subprocess',
      color: NODE_COLORS.subprocess,
      subMapId,
    };

    const { nodes: subNodes, edges: subEdges } = layoutSteps(children, 0, 0);
    maps[subMapId] = {
      id: subMapId,
      name: `${parentNode.data.label} — Details`,
      description: `Sub-process details for ${parentNode.data.label}`,
      parentMapId: rootMapId,
      parentNodeId,
      nodes: subNodes,
      edges: subEdges,
    };
  }

  maps[rootMapId] = {
    id: rootMapId,
    name: 'Overview',
    description: 'Auto-generated from text import',
    parentMapId: null,
    parentNodeId: null,
    nodes: rootNodes,
    edges: rootEdges,
  };

  return {
    id: projectId,
    name: projectName,
    description: 'Imported from text input',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rootMapId,
    maps,
  };
}
