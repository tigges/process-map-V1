import { nanoid } from 'nanoid';
import type { ProcessMapProject, ProcessMap, JourneyNodeData, JourneyNodeType } from '../types';
import type { Node, Edge } from '@xyflow/react';
import { layoutSmartFlow } from './layoutEngine';

export interface ParsedStep {
  id: string;
  label: string;
  description: string;
  nodeType: JourneyNodeType;
  children: ParsedStep[];
  indent: number;
}

const NODE_COLORS: Record<JourneyNodeType, string> = {
  start: '#22c55e', action: '#3b82f6', decision: '#eab308',
  end: '#ef4444', subprocess: '#64748b',
};

const CATEGORY_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#e11d48', '#7c3aed', '#059669',
];

// ───── TEXT CLEANUP PIPELINE (shared by all import methods) ─────

const ASCII_ART = /[─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬▼▲►◄●○■□▪▫◆◇★☆✓✗←↑↓⇒⇐⇑⇓]/g;
const ARROW_CHAR = /→/g;
const SEPARATOR_LINE = /^[\s─═\-_~*#]{4,}$/;
const BOX_LINE = /^[\s]*[┌┐└┘├┤│║╔╗╚╝╠╣].*/;
const PAGE_MARKER = /^--\s*\d+\s*(of|\/)\s*\d+\s*--$/i;
const QUOTED_BLOCK = /^[""].{40,}[""]$/;

const JUNK_PATTERNS = [
  /^page\s+\d+$/i, /^\d+\s*\/\s*\d+$/, /^\d+$/,
  /^https?:\/\//, /^www\./, /^copyright/i, /^all rights reserved/i,
  /^table of contents$/i, /^contents$/i, /^index$/i,
  /^\.{3,}$/, /^[.\-_=*#\s]{1,4}$/, /^\(?\d+\)?$/,
  /^(version|revision|rev|v)\s*[\d.]+/i,
  /^(author|created by|written by|prepared by|updated by|by\s)/i,
  /^(date|last updated|modified|effective)/i,
  /^(confidential|internal use|draft|do not distribute)/i,
  /^(training team|training department|hr department|cstrainingteam)/i,
  /^(note:|disclaimer:|warning:)/i,
  /^end of document$/i,
  /^finance tab$/i,
];

function isJunkLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return true;
  if (trimmed.length < 5 && !/[a-zA-Z]{3,}/.test(trimmed)) return true;
  if (PAGE_MARKER.test(trimmed)) return true;
  if (QUOTED_BLOCK.test(trimmed)) return true;
  if (trimmed.startsWith('"') && trimmed.length > 80) return true;
  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

function cleanupText(text: string): string {
  const lines = text.split('\n');
  const cleaned: string[] = [];
  let inQuote = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SEPARATOR_LINE.test(trimmed)) continue;
    if (BOX_LINE.test(trimmed)) continue;
    if (PAGE_MARKER.test(trimmed)) continue;

    const processed = trimmed
      .replace(ASCII_ART, ' ')
      .replace(ARROW_CHAR, ' -> ')
      .replace(/\t+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (processed.startsWith('"') || inQuote) {
      inQuote = !processed.endsWith('"');
      continue;
    }

    if (!processed || isJunkLine(processed)) continue;
    cleaned.push(processed);
  }

  return cleaned.join('\n');
}

// ───── AUTO-DETECT IF TEXT IS ALREADY CLAUDE-FORMATTED ─────

function isClaudeFormatted(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 3) return false;
  let numbered = 0;
  let tagged = 0;
  for (const line of lines) {
    if (/^\d+[.)]\s/.test(line.trim())) numbered++;
    if (/^\s*-\s*\[[\w\s-]+\]/.test(line)) tagged++;
  }
  return numbered >= 2 && tagged >= 3 && (tagged / lines.length) > 0.3;
}

// ───── TYPE DETECTION ─────

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

const DECISION_STARTERS = /^(if |when |does |should |will |can |is |are |has |have |check |verify |confirm |validate |ensure )/i;
const ACTION_VERBS = /^(send |create |update |delete |add |remove |set |get |open |close |log |save |submit |upload |download |assign |escalate |notify |inform |redirect |advise |guide |process |handle |review |approve |reject |cancel |complete |reset |change |modify |request |contact |transfer |forward |post |click |select |enter |fill |search |navigate |enable |disable )/i;
const FLOW_ARROW = / -> /;

function classifyByContent(text: string): JourneyNodeType {
  const lower = text.toLowerCase();
  if (lower.includes('?')) return 'decision';
  if (DECISION_STARTERS.test(lower)) return 'decision';
  if (ACTION_VERBS.test(lower)) return 'action';
  return 'action';
}

// ───── LABEL EXTRACTION ─────

function smartSplitLabel(text: string): { label: string; description: string } {
  if (FLOW_ARROW.test(text)) {
    const parts = text.split(' -> ');
    return { label: parts[0].trim(), description: parts.slice(1).join(' -> ').trim() };
  }
  const colonIdx = text.indexOf(':');
  if (colonIdx > 0 && colonIdx < 50) {
    return { label: text.slice(0, colonIdx).trim(), description: text.slice(colonIdx + 1).trim() };
  }
  const dashIdx = text.indexOf(' — ');
  if (dashIdx > 0 && dashIdx < 50) {
    return { label: text.slice(0, dashIdx).trim(), description: text.slice(dashIdx + 3).trim() };
  }
  const simpleDash = text.indexOf(' - ');
  if (simpleDash > 0 && simpleDash < 50) {
    return { label: text.slice(0, simpleDash).trim(), description: text.slice(simpleDash + 3).trim() };
  }
  if (text.length > 50) {
    const spaceIdx = text.lastIndexOf(' ', 45);
    if (spaceIdx > 15) return { label: text.slice(0, spaceIdx).trim(), description: text.slice(spaceIdx + 1).trim() };
  }
  return { label: text.slice(0, 50), description: text.length > 50 ? text : '' };
}

// ───── LINE CLASSIFICATION ─────

function isNumberedLine(line: string): boolean { return /^\d+[.)]\s/.test(line.trim()); }
function isTaggedLine(line: string): boolean { return /^\[[\w\s-]+\]\s/.test(line.trim()); }
function isDashedLine(line: string): boolean { return /^[\s]*[-*•]\s/.test(line); }

function isHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (isNumberedLine(trimmed)) return true;
  if (isDashedLine(trimmed) || isTaggedLine(trimmed)) return false;
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-Z]/.test(trimmed)) return true;
  if (/^#{1,3}\s/.test(trimmed)) return true;
  if (/^[\d.]+\s+[A-Z]/.test(trimmed) && trimmed.length < 80) return true;
  return false;
}

function cleanHeaderPrefix(line: string): string {
  return line.trim().replace(/^\d+[.)]\s*/, '').replace(/^[\d.]+\s+/, '').replace(/^#{1,3}\s*/, '').trim();
}

function cleanDashPrefix(line: string): string { return line.trim().replace(/^[-*•]\s*/, ''); }

// ───── ACTOR DETECTION ─────

function detectActor(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(player|customer|user)\b/.test(lower)) return 'Player';
  if (/\b(agent|support|cs |we )\b/.test(lower)) return 'Agent';
  if (/\b(sm|shift manager|manager)\b/.test(lower)) return 'SM';
  if (/\b(kyc|verification|finance)\b/.test(lower)) return 'System';
  return '';
}

// ───── MAIN PARSER ─────

export function parseTextToSteps(text: string): ParsedStep[] {
  const cleaned = cleanupText(text);
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0);
  const steps: ParsedStep[] = [];
  let currentParent: ParsedStep | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (isHeaderLine(trimmed)) {
      const content = cleanHeaderPrefix(trimmed);
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(content);
      const { label, description } = smartSplitLabel(afterPrefix);
      currentParent = {
        id: nanoid(), label, description,
        nodeType: explicitType ?? 'subprocess', children: [], indent: 0,
      };
      steps.push(currentParent);
    } else if (currentParent) {
      const content = isDashedLine(trimmed) ? cleanDashPrefix(trimmed) : trimmed;
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(content);
      const { label, description } = smartSplitLabel(afterPrefix);
      const nodeType = explicitType ?? classifyByContent(afterPrefix);
      const actor = detectActor(afterPrefix);
      const desc = actor ? `[${actor}] ${description}` : description;
      currentParent.children.push({
        id: nanoid(), label, description: desc, nodeType, children: [], indent: 1,
      });
    } else {
      const content = isDashedLine(trimmed) ? cleanDashPrefix(trimmed) : trimmed;
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(content);
      const { label, description } = smartSplitLabel(afterPrefix);
      currentParent = {
        id: nanoid(), label, description,
        nodeType: explicitType ?? classifyByContent(afterPrefix), children: [], indent: 0,
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

// ───── NORMALIZATION (shared post-parse layer) ─────

function normalizeSteps(steps: ParsedStep[]): ParsedStep[] {
  let result = steps.filter((s) => s.label.trim().length > 0);

  const merged: ParsedStep[] = [];
  const seen = new Map<string, number>();

  for (const step of result) {
    const key = step.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) {
      const existing = merged[seen.get(key)!];
      existing.children.push(...step.children);
      if (!existing.description && step.description) existing.description = step.description;
    } else {
      seen.set(key, merged.length);
      merged.push({ ...step, children: [...step.children] });
    }
  }

  result = merged;

  const MAX_CHILDREN = 12;
  for (const step of result) {
    if (step.children.length > MAX_CHILDREN) {
      const overflow = step.children.splice(MAX_CHILDREN);
      const subGroup: ParsedStep = {
        id: nanoid(),
        label: `${step.label} (continued)`,
        description: `${overflow.length} additional steps`,
        nodeType: 'subprocess',
        children: overflow,
        indent: 1,
      };
      step.children.push(subGroup);
    }
  }

  const tiny = result.filter((s) => s.children.length <= 1 && s.nodeType !== 'start' && s.nodeType !== 'end');
  if (tiny.length > 3 && tiny.length > result.length / 2) {
    const real = result.filter((s) => s.children.length > 1 || s.nodeType === 'start' || s.nodeType === 'end');
    if (real.length > 0) {
      const misc: ParsedStep = {
        id: nanoid(), label: 'Other Items',
        description: `${tiny.length} miscellaneous items`,
        nodeType: 'subprocess', children: tiny.flatMap((t) => t.children.length > 0 ? t.children : [t]),
        indent: 0,
      };
      real.push(misc);
      return real;
    }
  }

  return result;
}

// ───── FLOW MAP BUILDER ─────

function makeEdge(sourceId: string, targetId: string, label?: string, sourceHandle?: string): Edge {
  return {
    id: `e-${sourceId}-${targetId}`, source: sourceId, target: targetId, label,
    type: 'smoothstep', animated: true,
    style: { stroke: '#94a3b8', strokeWidth: 2 },
    ...(label ? { labelStyle: { fontSize: 11, fontWeight: 600 } } : {}),
    ...(sourceHandle ? { sourceHandle } : {}),
  };
}

function buildFlowMap(steps: ParsedStep[]): { nodes: Node<JourneyNodeData>[]; edges: Edge[] } {
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
      data: { label: step.label, description: step.description, nodeType: step.nodeType, color: NODE_COLORS[step.nodeType] },
    });
    rawEdges.push(makeEdge(prevId, nodeId));

    if (step.nodeType === 'decision') {
      const branchId = nanoid();
      rawNodes.push({
        id: branchId, type: 'journeyNode', position: { x: 0, y: 0 },
        data: { label: step.description ? step.description.slice(0, 40) : 'Alt path', description: '', nodeType: 'action', color: NODE_COLORS.action },
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

  return layoutSmartFlow(rawNodes, rawEdges);
}

// ───── CLUSTERING ─────

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
  let bestCluster = ''; let bestScore = 0;
  for (const [cluster, keywords] of Object.entries(CLUSTER_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) { if (text.includes(kw)) score++; }
    if (score > bestScore) { bestScore = score; bestCluster = cluster; }
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
  const lower = label.toLowerCase();
  if (/^(note|disclaimer|warning|version|revision|by |prepared|training)/.test(lower)) return true;
  return false;
}

// ───── PROJECT BUILDER ─────

function buildOverviewNode(
  nodeId: string, label: string, desc: string, color: string, subMapId: string | undefined,
): Node<JourneyNodeData> {
  return {
    id: nodeId, type: 'journeyNode', position: { x: 0, y: 0 },
    data: { label, description: desc, nodeType: 'subprocess', color, subMapId },
  };
}

export function stepsToProject(
  steps: ParsedStep[], projectName: string, isDraft: boolean, skipClustering = false,
): ProcessMapProject {
  const projectId = nanoid();
  const rootMapId = nanoid();
  const maps: Record<string, ProcessMap> = {};

  const normalized = normalizeSteps(steps);

  const validSteps: ParsedStep[] = [];
  const graveyardSteps: ParsedStep[] = [];
  for (const step of normalized) {
    if (isGraveyardItem(step)) graveyardSteps.push(step);
    else validSteps.push(step);
  }

  const shouldSkipClustering = skipClustering || isClaudeFormatted(
    validSteps.map((s) => `${s.indent === 0 ? '1. ' : '- [action] '}${s.label}`).join('\n'),
  );

  const rawOverviewNodes: Node<JourneyNodeData>[] = [];
  let colorIdx = 0;

  if (shouldSkipClustering) {
    for (const step of validSteps) {
      const nodeId = nanoid();
      const hasChildren = step.children.length > 0;
      const categoryColor = CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length];
      colorIdx++;

      let subMapId: string | undefined;
      if (hasChildren) {
        subMapId = nanoid();
        const allSubprocess = step.children.every((c) => c.children.length > 0 || c.nodeType === 'subprocess');

        if (allSubprocess && step.children.length > 1) {
          const subOverviewNodes: Node<JourneyNodeData>[] = [];
          for (const child of step.children) {
            const childNodeId = nanoid();
            const childColor = CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length];
            colorIdx++;
            let childSubMapId: string | undefined;
            if (child.children.length > 0) {
              childSubMapId = nanoid();
              const { nodes: cNodes, edges: cEdges } = buildFlowMap(child.children);
              maps[childSubMapId] = { id: childSubMapId, name: child.label, description: child.description || '', parentMapId: subMapId, parentNodeId: childNodeId, nodes: cNodes, edges: cEdges };
            }
            subOverviewNodes.push(buildOverviewNode(childNodeId, child.label,
              child.description ? `${child.description} (${child.children.length} steps)` : `${child.children.length} steps`,
              childColor, childSubMapId));
          }
          const cols = Math.min(Math.ceil(Math.sqrt(subOverviewNodes.length)), 3);
          const positioned = subOverviewNodes.map((n, i) => ({ ...n, position: { x: (i % cols) * 280, y: Math.floor(i / cols) * 160 } }));
          maps[subMapId] = { id: subMapId, name: step.label, description: step.description || '', parentMapId: rootMapId, parentNodeId: nodeId, nodes: positioned, edges: [] };
        } else {
          const { nodes: subNodes, edges: subEdges } = buildFlowMap(step.children);
          maps[subMapId] = { id: subMapId, name: step.label, description: step.description || '', parentMapId: rootMapId, parentNodeId: nodeId, nodes: subNodes, edges: subEdges };
        }
      }

      rawOverviewNodes.push(buildOverviewNode(nodeId, step.label,
        step.description ? `${step.description}${hasChildren ? ` (${step.children.length} steps)` : ''}` : hasChildren ? `${step.children.length} steps` : '',
        hasChildren ? categoryColor : NODE_COLORS[step.nodeType], subMapId));
    }
  } else {
    const clustered: Record<string, ParsedStep[]> = {};
    const unclustered: ParsedStep[] = [];
    for (const step of validSteps) {
      const cluster = classifyStep(step);
      if (cluster) { if (!clustered[cluster]) clustered[cluster] = []; clustered[cluster].push(step); }
      else unclustered.push(step);
    }

    for (const [clusterName, clusterSteps] of Object.entries(clustered)) {
      const categoryColor = CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length]; colorIdx++;
      if (clusterSteps.length === 1 && clusterSteps[0].children.length > 0) {
        const step = clusterSteps[0]; const nodeId = nanoid(); const subMapId = nanoid();
        const { nodes: subNodes, edges: subEdges } = buildFlowMap(step.children);
        maps[subMapId] = { id: subMapId, name: step.label, description: step.description || '', parentMapId: rootMapId, parentNodeId: nodeId, nodes: subNodes, edges: subEdges };
        rawOverviewNodes.push(buildOverviewNode(nodeId, step.label, `${step.description || ''} (${step.children.length} steps)`.trim(), categoryColor, subMapId));
      } else {
        const nodeId = nanoid(); const subMapId = nanoid();
        const allChildren: ParsedStep[] = [];
        for (const step of clusterSteps) { if (step.children.length > 0) allChildren.push(...step.children); else allChildren.push(step); }
        const { nodes: subNodes, edges: subEdges } = buildFlowMap(allChildren.length > 0 ? allChildren : clusterSteps);
        maps[subMapId] = { id: subMapId, name: clusterName, description: `${clusterSteps.length} topics`, parentMapId: rootMapId, parentNodeId: nodeId, nodes: subNodes, edges: subEdges };
        rawOverviewNodes.push(buildOverviewNode(nodeId, clusterName, `${clusterSteps.map((s) => s.label).join(', ').slice(0, 80)} (${allChildren.length || clusterSteps.length} steps)`, categoryColor, subMapId));
      }
    }

    for (const step of unclustered) {
      const nodeId = nanoid(); const hasChildren = step.children.length > 0;
      const categoryColor = CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length]; colorIdx++;
      let subMapId: string | undefined;
      if (hasChildren) {
        subMapId = nanoid();
        const { nodes: subNodes, edges: subEdges } = buildFlowMap(step.children);
        maps[subMapId] = { id: subMapId, name: step.label, description: step.description || '', parentMapId: rootMapId, parentNodeId: nodeId, nodes: subNodes, edges: subEdges };
      }
      rawOverviewNodes.push(buildOverviewNode(nodeId, step.label,
        step.description ? `${step.description}${hasChildren ? ` (${step.children.length} steps)` : ''}` : hasChildren ? `${step.children.length} steps` : '',
        hasChildren ? categoryColor : NODE_COLORS[step.nodeType], subMapId));
    }
  }

  if (graveyardSteps.length > 0) {
    const graveyardId = nanoid(); const graveyardMapId = nanoid();
    const graveyardNodes: Node<JourneyNodeData>[] = graveyardSteps.map((step, i) => ({
      id: nanoid(), type: 'journeyNode' as const,
      position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 100 },
      data: { label: step.label, description: step.description, nodeType: 'action' as const, color: '#94a3b8' },
    }));
    maps[graveyardMapId] = { id: graveyardMapId, name: 'Unclassified Items', description: `${graveyardSteps.length} items to review`, parentMapId: rootMapId, parentNodeId: graveyardId, nodes: graveyardNodes, edges: [] };
    rawOverviewNodes.push(buildOverviewNode(graveyardId, 'Unclassified Items', `${graveyardSteps.length} items to review`, '#94a3b8', graveyardMapId));
  }

  const columns = Math.min(Math.ceil(Math.sqrt(rawOverviewNodes.length)), 4);
  const overviewNodes = rawOverviewNodes.map((node, i) => ({
    ...node, position: { x: (i % columns) * 280, y: Math.floor(i / columns) * 160 },
  }));

  maps[rootMapId] = { id: rootMapId, name: 'Overview', description: 'Top-level categories', parentMapId: null, parentNodeId: null, nodes: overviewNodes, edges: [] };

  return { id: projectId, name: projectName, description: isDraft ? 'Draft — review and finalize' : 'Imported from text',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rootMapId, maps, isDraft };
}

export function parseTextToProject(text: string, projectName: string): ProcessMapProject {
  const steps = parseTextToSteps(text);
  return stepsToProject(steps, projectName, false);
}
