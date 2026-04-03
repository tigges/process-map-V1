import type { JourneyNodeData, ProcessMap, ProcessMapProject } from '../types';
import type { ParsedStep } from './textParser';
import { generateNodeNumbers } from './numbering';

const XREF_PATTERN = /\b\d+\.\d+(?:\.\d+)?\b/g;
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'after', 'before',
  'step', 'stage', 'process', 'subprocess', 'flow', 'status', 'request', 'review',
  'check', 'update', 'create', 'manage', 'handling', 'monitoring',
]);

export interface ParsedConnectionPreview {
  id: string;
  sourceStepId: string;
  targetStepId: string;
  sourceLabel: string;
  targetLabel: string;
  sourceNumber?: string;
  targetNumber?: string;
  reason: string;
  confidence: number;
}

export interface ConnectionSuggestion {
  id: string;
  kind: 'edge';
  projectId: string;
  mapId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceLabel: string;
  targetLabel: string;
  sourceNumber?: string;
  targetNumber?: string;
  reason: string;
  confidence: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function extractRefs(text: string): string[] {
  const refs = text.match(XREF_PATTERN);
  if (!refs) return [];
  return Array.from(new Set(refs));
}

function tokenOverlapScore(a: string, b: string): { shared: string[]; score: number } {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return { shared: [], score: 0 };
  const shared: string[] = [];
  for (const token of aTokens) {
    if (bTokens.has(token)) shared.push(token);
  }
  const denom = Math.max(1, Math.min(aTokens.size, bTokens.size));
  return { shared, score: shared.length / denom };
}

function flattenParsedSteps(steps: ParsedStep[]): ParsedStep[] {
  const out: ParsedStep[] = [];
  const visit = (nodes: ParsedStep[]) => {
    for (const node of nodes) {
      out.push(node);
      if (node.children.length > 0) visit(node.children);
    }
  };
  visit(steps);
  return out;
}

export function buildParsedStepNumberMap(steps: ParsedStep[]): Map<string, string> {
  const numberMap = new Map<string, string>();
  const visit = (nodes: ParsedStep[], prefix = '') => {
    nodes.forEach((node, idx) => {
      const number = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
      numberMap.set(node.id, number);
      if (node.children.length > 0) visit(node.children, number);
    });
  };
  visit(steps);
  return numberMap;
}

export function buildParsedStepConnectionCandidates(steps: ParsedStep[]): ParsedConnectionPreview[] {
  const candidates: ParsedConnectionPreview[] = [];
  const numberMap = buildParsedStepNumberMap(steps);
  const all = flattenParsedSteps(steps);
  const byId = new Map(all.map((step) => [step.id, step]));
  const seen = new Set<string>();

  for (const step of all) {
    const refs = extractRefs(`${step.label} ${step.description}`);
    for (const ref of refs) {
      const target = Array.from(byId.values()).find((s) => numberMap.get(s.id) === ref);
      if (!target || target.id === step.id) continue;
      const key = `${step.id}->${target.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        id: `parsed-ref-${key}`,
        sourceStepId: step.id,
        targetStepId: target.id,
        sourceLabel: step.label,
        targetLabel: target.label,
        sourceNumber: numberMap.get(step.id),
        targetNumber: numberMap.get(target.id),
        reason: `Explicit reference to ${ref}`,
        confidence: 0.95,
      });
    }
  }

  for (let i = 0; i < steps.length; i++) {
    for (let j = i + 1; j < steps.length; j++) {
      const source = steps[i];
      const target = steps[j];
      const overlap = tokenOverlapScore(source.label, target.label);
      if (overlap.shared.length < 1 || overlap.score < 0.5) continue;
      const key = `${source.id}->${target.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        id: `parsed-topic-${key}`,
        sourceStepId: source.id,
        targetStepId: target.id,
        sourceLabel: source.label,
        targetLabel: target.label,
        sourceNumber: numberMap.get(source.id),
        targetNumber: numberMap.get(target.id),
        reason: `Shared topic: ${overlap.shared.slice(0, 2).join(', ')}`,
        confidence: Number(Math.min(0.8, 0.45 + overlap.score / 2).toFixed(2)),
      });
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function hasEdge(map: ProcessMap, sourceNodeId: string, targetNodeId: string): boolean {
  return map.edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId);
}

export function buildProjectConnectionSuggestions(project: ProcessMapProject): ConnectionSuggestion[] {
  const suggestions: ConnectionSuggestion[] = [];
  const seen = new Set<string>();
  const numberMap = generateNodeNumbers(project);
  const reverseNumberMap = new Map<string, string>();
  numberMap.forEach((num, id) => reverseNumberMap.set(num, id));

  const nodeToMapId = new Map<string, string>();
  for (const [mapId, map] of Object.entries(project.maps)) {
    for (const node of map.nodes) nodeToMapId.set(node.id, mapId);
  }

  for (const [mapId, map] of Object.entries(project.maps)) {
    for (const node of map.nodes) {
      const data = node.data as JourneyNodeData;
      if (data.nodeType === 'start' || data.nodeType === 'end') continue;
      const refs = extractRefs(`${data.label} ${data.description}`);
      for (const ref of refs) {
        const targetNodeId = reverseNumberMap.get(ref);
        if (!targetNodeId || targetNodeId === node.id) continue;
        const targetMapId = nodeToMapId.get(targetNodeId);
        if (!targetMapId || targetMapId !== mapId) continue;
        if (hasEdge(map, node.id, targetNodeId)) continue;
        const key = `${mapId}:${node.id}->${targetNodeId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const targetNode = map.nodes.find((n) => n.id === targetNodeId);
        suggestions.push({
          id: `proj-ref-${key}`,
          kind: 'edge',
          projectId: project.id,
          mapId,
          sourceNodeId: node.id,
          targetNodeId,
          sourceLabel: data.label,
          targetLabel: (targetNode?.data as JourneyNodeData | undefined)?.label ?? ref,
          sourceNumber: numberMap.get(node.id),
          targetNumber: numberMap.get(targetNodeId),
          reason: `Explicit reference to ${ref}`,
          confidence: 0.95,
        });
      }
    }
  }

  const rootMap = project.maps[project.rootMapId];
  if (rootMap) {
    const subprocessNodes = rootMap.nodes.filter((node) => {
      const data = node.data as JourneyNodeData;
      return data.nodeType === 'subprocess';
    });
    for (let i = 0; i < subprocessNodes.length; i++) {
      for (let j = i + 1; j < subprocessNodes.length; j++) {
        const source = subprocessNodes[i];
        const target = subprocessNodes[j];
        const sourceData = source.data as JourneyNodeData;
        const targetData = target.data as JourneyNodeData;
        const overlap = tokenOverlapScore(sourceData.label, targetData.label);
        if (overlap.shared.length < 1 || overlap.score < 0.5) continue;
        if (hasEdge(rootMap, source.id, target.id)) continue;
        const key = `${project.rootMapId}:${source.id}->${target.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        suggestions.push({
          id: `proj-topic-${key}`,
          kind: 'edge',
          projectId: project.id,
          mapId: project.rootMapId,
          sourceNodeId: source.id,
          targetNodeId: target.id,
          sourceLabel: sourceData.label,
          targetLabel: targetData.label,
          sourceNumber: numberMap.get(source.id),
          targetNumber: numberMap.get(target.id),
          reason: `Shared topic: ${overlap.shared.slice(0, 2).join(', ')}`,
          confidence: Number(Math.min(0.8, 0.45 + overlap.score / 2).toFixed(2)),
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

export interface ConnectionDraftInput {
  sourceStepId: string;
  targetStepId: string;
  reason: string;
  confidence: number;
}

export function resolveDraftConnectionSuggestions(
  project: ProcessMapProject,
  drafts: ConnectionDraftInput[],
): ConnectionSuggestion[] {
  if (drafts.length === 0) return [];

  const nodeNumbers = generateNodeNumbers(project);
  const stepToNode = new Map<string, { nodeId: string; mapId: string; label: string }>();
  for (const [mapId, map] of Object.entries(project.maps)) {
    for (const node of map.nodes) {
      const data = node.data as JourneyNodeData & { sourceStepId?: string };
      if (!data.sourceStepId) continue;
      if (!stepToNode.has(data.sourceStepId)) {
        stepToNode.set(data.sourceStepId, { nodeId: node.id, mapId, label: data.label });
      }
    }
  }

  const suggestions: ConnectionSuggestion[] = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    const source = stepToNode.get(draft.sourceStepId);
    const target = stepToNode.get(draft.targetStepId);
    if (!source || !target) continue;
    if (source.nodeId === target.nodeId) continue;
    if (source.mapId !== target.mapId) continue;

    const key = `${project.id}:${source.mapId}:${source.nodeId}->${target.nodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push({
      id: `resolved-${source.nodeId}-${target.nodeId}`,
      kind: 'edge',
      projectId: project.id,
      mapId: source.mapId,
      sourceNodeId: source.nodeId,
      targetNodeId: target.nodeId,
      sourceLabel: source.label,
      targetLabel: target.label,
      sourceNumber: nodeNumbers.get(source.nodeId),
      targetNumber: nodeNumbers.get(target.nodeId),
      reason: draft.reason,
      confidence: draft.confidence,
    });
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}
