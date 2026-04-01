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

function isDashedLine(line: string): boolean {
  return /^[\s]*[-*•]\s/.test(line);
}

function cleanNumberPrefix(line: string): string {
  return line.trim().replace(/^\d+[.)]\s*/, '');
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

    if (isNumberedLine(trimmed)) {
      const content = cleanNumberPrefix(trimmed);
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
    } else if (isDashedLine(trimmed) && currentParent) {
      const content = cleanDashPrefix(trimmed);
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
    } else if (currentParent) {
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(trimmed);
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
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(trimmed);
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

export function stepsToProject(steps: ParsedStep[], projectName: string, isDraft: boolean): ProcessMapProject {
  const projectId = nanoid();
  const rootMapId = nanoid();
  const maps: Record<string, ProcessMap> = {};

  const phases = steps;

  const rawOverviewNodes: Node<JourneyNodeData>[] = [];

  phases.forEach((phase, i) => {
    const nodeId = nanoid();
    const hasChildren = phase.children.length > 0;
    const categoryColor = CATEGORY_COLORS[i % CATEGORY_COLORS.length];

    let subMapId: string | undefined;
    if (hasChildren) {
      subMapId = nanoid();
      const { nodes: subNodes, edges: subEdges } = buildFlowMap(phase.children);
      maps[subMapId] = {
        id: subMapId,
        name: phase.label,
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
      : hasChildren ? `${childCount} steps` : '';

    rawOverviewNodes.push({
      id: nodeId, type: 'journeyNode', position: { x: 0, y: 0 },
      data: {
        label: phase.label,
        description: desc,
        nodeType: hasChildren ? 'subprocess' : phase.nodeType,
        color: hasChildren ? categoryColor : NODE_COLORS[phase.nodeType],
        subMapId,
      },
    });
  });

  const { nodes: overviewNodes } = layoutWithDagre(rawOverviewNodes, [], 'TB');

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
