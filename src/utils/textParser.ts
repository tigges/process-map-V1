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

const NODE_COLORS: Record<JourneyNodeType, string> = {
  start: '#22c55e',
  action: '#3b82f6',
  decision: '#eab308',
  end: '#ef4444',
  subprocess: '#64748b',
};

const ASCII_ART = /[─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬▼▲►◄●○■□▪▫◆◇★☆✓✗→←↑↓⇒⇐⇑⇓]/g;
const SEPARATOR_LINE = /^[\s─═\-_~*#]{4,}$/;
const BOX_LINE = /^[\s]*[┌┐└┘├┤│║╔╗╚╝╠╣].*/;

function stripAsciiArt(text: string): string {
  return text
    .split('\n')
    .filter((line) => !SEPARATOR_LINE.test(line))
    .filter((line) => !BOX_LINE.test(line))
    .map((line) => line.replace(ASCII_ART, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

const EXPLICIT_TAGS: Record<string, JourneyNodeType> = {
  'start': 'start',
  'begin': 'start',
  'end': 'end',
  'finish': 'end',
  'resolve': 'end',
  'action': 'action',
  'step': 'action',
  'touchpoint': 'action',
  'touch point': 'action',
  'decision': 'decision',
  'check': 'decision',
  'subprocess': 'subprocess',
  'sub-process': 'subprocess',
  'sub process': 'subprocess',
  'phase': 'subprocess',
  'stage': 'subprocess',
  'category': 'subprocess',
  'pain point': 'action',
  'pain': 'action',
  'opportunity': 'action',
  'emotion': 'action',
};

function detectNodeType(text: string, hasChildren: boolean): JourneyNodeType {
  if (hasChildren) return 'subprocess';
  const lower = text.toLowerCase();
  if (lower.includes('?') || lower.startsWith('should') || lower.startsWith('does') || lower.startsWith('will') || lower.startsWith('can') || lower.startsWith('is ')) {
    return 'decision';
  }
  return 'action';
}

function extractTypePrefix(line: string): { type: JourneyNodeType | null; cleaned: string } {
  const match = line.match(/^\[(\w[\w\s-]*)\]\s*/i);
  if (match) {
    const tag = match[1].toLowerCase().trim();
    const mapped = EXPLICIT_TAGS[tag];
    if (mapped) return { type: mapped, cleaned: line.slice(match[0].length) };
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
    .replace(/^[\s]*[-*•>]+\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .trim();
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

function detectSections(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let sectionIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isAllCaps = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-Z]/.test(trimmed);
    const nextLine = lines[i + 1]?.trim() ?? '';
    const nextIsIndented = nextLine.startsWith('-') || nextLine.startsWith('  ') || nextLine.match(/^\d+[.)]/);
    const isSectionHeader = isAllCaps || (trimmed.match(/^#{1,3}\s/) !== null);

    if (isSectionHeader || (!line.startsWith(' ') && !line.startsWith('-') && nextIsIndented && !line.match(/^\d+[.)]/))) {
      sectionIdx++;
      const cleaned = trimmed.replace(/^#{1,3}\s*/, '').replace(/[=\-_*#]+$/, '').trim();
      if (cleaned.length > 0) {
        result.push(`${sectionIdx}. ${cleaned}`);
        continue;
      }
    }

    if (line.startsWith('  ') || line.startsWith('\t') || line.startsWith('-') || line.startsWith('*')) {
      result.push(line);
    } else if (line.match(/^\d+[.)]/)) {
      result.push(line);
    } else {
      result.push(`  - ${trimmed}`);
    }
  }

  return result.join('\n');
}

export function parseTextToSteps(text: string): ParsedStep[] {
  const cleaned = stripAsciiArt(text);
  const structured = detectSections(cleaned);
  const lines = structured.split('\n').filter((l) => l.trim().length > 0);
  const steps: ParsedStep[] = [];
  const stack: { step: ParsedStep; indent: number }[] = [];

  for (const rawLine of lines) {
    const indent = parseIndent(rawLine);
    const lineContent = cleanLine(rawLine);
    if (!lineContent) continue;

    const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(lineContent);
    const { label, description } = splitLabelDescription(afterPrefix);
    const nodeType = explicitType ?? 'action';

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

  for (const step of steps) {
    if (step.children.length > 0 && step.nodeType === 'action') {
      step.nodeType = 'subprocess';
    }
    step.nodeType = detectNodeType(step.label, step.children.length > 0);
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
    ...(label ? { labelStyle: { fontSize: 11, fontWeight: 600 } } : {}),
  };
}

function gridPosition(index: number, columns: number, w: number, h: number): { x: number; y: number } {
  const col = index % columns;
  const row = Math.floor(index / columns);
  return { x: col * (w + 40), y: row * (h + 40) };
}

function layoutAsFlow(
  steps: ParsedStep[],
): { nodes: Node<JourneyNodeData>[]; edges: Edge[] } {
  const nodes: Node<JourneyNodeData>[] = [];
  const edges: Edge[] = [];
  const xGap = 260;
  const yBranch = 140;

  const startId = nanoid();
  nodes.push({
    id: startId,
    type: 'journeyNode',
    position: { x: 0, y: 0 },
    data: { label: 'Start', description: '', nodeType: 'start', color: NODE_COLORS.start },
  });

  let prevId = startId;
  let xPos = xGap;

  steps.forEach((step) => {
    const nodeId = nanoid();
    const isDecision = step.nodeType === 'decision';

    nodes.push({
      id: nodeId,
      type: 'journeyNode',
      position: { x: xPos, y: 0 },
      data: {
        label: step.label,
        description: step.description,
        nodeType: step.nodeType,
        color: NODE_COLORS[step.nodeType],
      },
    });
    edges.push(makeEdge(prevId, nodeId));

    if (isDecision && step.description) {
      const yesId = nanoid();
      nodes.push({
        id: yesId,
        type: 'journeyNode',
        position: { x: xPos, y: yBranch },
        data: { label: step.description, description: '', nodeType: 'action', color: NODE_COLORS.action },
      });
      edges.push({ ...makeEdge(nodeId, yesId, 'Yes'), sourceHandle: 'bottom' });
    }

    prevId = nodeId;
    xPos += xGap;
  });

  const endId = nanoid();
  nodes.push({
    id: endId,
    type: 'journeyNode',
    position: { x: xPos, y: 0 },
    data: { label: 'End', description: '', nodeType: 'end', color: NODE_COLORS.end },
  });
  edges.push(makeEdge(prevId, endId));

  return { nodes, edges };
}

export function stepsToProject(steps: ParsedStep[], projectName: string, isDraft: boolean): ProcessMapProject {
  const projectId = nanoid();
  const rootMapId = nanoid();
  const maps: Record<string, ProcessMap> = {};

  const topLevel = steps.filter((s) => s.indent === 0);
  const phases = topLevel.length > 0 ? topLevel : steps;

  const phaseNodes: Node<JourneyNodeData>[] = [];
  const columns = Math.min(Math.ceil(Math.sqrt(phases.length)), 4);

  phases.forEach((phase, i) => {
    const nodeId = nanoid();
    const hasChildren = phase.children.length > 0;

    let subMapId: string | undefined;
    if (hasChildren) {
      subMapId = nanoid();
      const { nodes: subNodes, edges: subEdges } = layoutAsFlow(phase.children);
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
    description: 'Top-level categories',
    parentMapId: null,
    parentNodeId: null,
    nodes: phaseNodes,
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
