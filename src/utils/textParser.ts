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
  semanticKind?: 'process' | 'fact';
  semanticScore?: number;
  semanticSignals?: string[];
  sourceId?: string;
  sourceName?: string;
}

export interface HierarchyPreviewItem {
  category: string;
  sections: string[];
  directSteps: number;
}

export interface HierarchySummary {
  categories: number;
  sections: number;
  processSteps: number;
  nestedSubprocesses: number;
  estimatedMaps: number;
  preview: HierarchyPreviewItem[];
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
export const FACTS_CATEGORY_NAME = 'Facts & Context';
export const FACTS_CATEGORY_DESCRIPTION = 'Definitions, assumptions, constraints, and baseline statements';

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
  let foundFirstNumbered = false;

  const promptPatterns = [
    /^output (format|rules)/i, /^available type tags/i, /^critical rules/i,
    /^example( output)?:/i, /^important:/i, /^now convert/i,
    /^you are a process map/i, /^convert (the |this |attached)/i,
    /^paste (your |document)/i, /^--- paste document/i,
    /^copy this prompt/i, /^\[replace this line/i,
    /^(top-level items|sub-items start|aim for \d)/i,
    /^\[action\] —/i, /^\[decision\] —/i, /^\[subprocess\] —/i,
    /^\[start\] —/i, /^\[end\] —/i,
    /^tags:/i, /^use "label:/i, /^identify actor/i,
    /^for (decisions|checks)/i, /^omit junk/i, /^remove all non/i,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SEPARATOR_LINE.test(trimmed)) continue;
    if (BOX_LINE.test(trimmed)) continue;
    if (PAGE_MARKER.test(trimmed)) continue;
    if (/^---\s*$/.test(trimmed)) continue;

    if (!foundFirstNumbered) {
      if (/^\d+[.)]\s/.test(trimmed)) {
        foundFirstNumbered = true;
      } else {
        let isPrompt = false;
        for (const pattern of promptPatterns) {
          if (pattern.test(trimmed)) { isPrompt = true; break; }
        }
        if (isPrompt) continue;
      }
    }

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
const ACTION_WORD_PATTERN = /\b(send|create|update|delete|add|remove|set|get|open|close|log|save|submit|upload|download|assign|escalate|notify|inform|redirect|advise|guide|process|handle|review|approve|reject|cancel|complete|reset|change|modify|request|contact|transfer|forward|post|click|select|enter|fill|search|navigate|enable|disable)\b/i;
const FACT_CUE_STARTERS = /^(context|background|fact|statement|definition|policy|rule|constraint|assumption|premise|current state|concept)\b/i;
const FACT_DEFINITION_PATTERN = /\b(is|are|means|defined as|refers to|consists of)\b/i;
const FACT_MEASURE_PATTERN = /(%|\bas of\b|\bcurrently\b|\bbaseline\b|\btarget\b|\bthreshold\b|\bsla\b|\bkpi\b|\b\d+\s*(days?|hours?|minutes?)\b)/i;

function normalizeDedupKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection++;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function textSimilarity(a: string, b: string): number {
  const aNorm = normalizeDedupKey(a);
  const bNorm = normalizeDedupKey(b);
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;
  return jaccardSimilarity(tokenize(a), tokenize(b));
}

function scoreFactStatement(step: ParsedStep): { score: number; signals: string[] } {
  const label = step.label.trim();
  const descRaw = step.description.replace(/^\[[^\]]+\]\s*/, '').trim();
  const combined = `${label} ${descRaw}`.trim();
  const lower = combined.toLowerCase();
  let score = 0;
  const signals: string[] = [];

  if (FACT_CUE_STARTERS.test(label.toLowerCase())) {
    score += 0.45;
    signals.push('fact-cue-starter');
  }
  if (FACT_DEFINITION_PATTERN.test(lower)) {
    score += 0.2;
    signals.push('definition-pattern');
  }
  if (FACT_MEASURE_PATTERN.test(lower)) {
    score += 0.15;
    signals.push('metric-or-baseline');
  }

  const hasQuestion = lower.includes('?') || DECISION_STARTERS.test(label.toLowerCase());
  const actionLike = ACTION_VERBS.test(label.toLowerCase()) || ACTION_VERBS.test(descRaw.toLowerCase());
  if (!hasQuestion && !actionLike) {
    score += 0.1;
    signals.push('non-procedural-tone');
  }

  if (step.nodeType === 'decision' || hasQuestion) {
    score -= 0.45;
    signals.push('decision-like');
  }
  if (actionLike) {
    score -= 0.3;
    signals.push('action-like');
  }
  if (/\b(player|customer|user|agent|support|system|sm)\b/i.test(lower) && ACTION_WORD_PATTERN.test(lower)) {
    score -= 0.2;
    signals.push('actor-action');
  }

  const clamped = Math.max(0, Math.min(1, score));
  return { score: clamped, signals };
}

function annotateSemanticStep(step: ParsedStep): ParsedStep {
  const { score, signals } = scoreFactStatement(step);
  const isFact = score >= 0.6;
  return {
    ...step,
    semanticKind: isFact ? 'fact' : 'process',
    semanticScore: score,
    semanticSignals: signals,
    children: step.children.map(annotateSemanticStep),
  };
}

function annotateSemanticSteps(steps: ParsedStep[]): ParsedStep[] {
  return steps.map(annotateSemanticStep);
}

export function ensureFactsCategory(names: string[]): string[] {
  const hasFacts = names.some((n) => normalizeDedupKey(n) === normalizeDedupKey(FACTS_CATEGORY_NAME));
  if (hasFacts) return names;
  return [...names, FACTS_CATEGORY_NAME];
}

function countFactsInStep(step: ParsedStep): number {
  const self = step.semanticKind === 'fact' ? 1 : 0;
  return self + step.children.reduce((sum, child) => sum + countFactsInStep(child), 0);
}

export function countFactCandidates(steps: ParsedStep[]): number {
  return steps.reduce((sum, step) => sum + countFactsInStep(step), 0);
}

function shouldMergeDuplicate(existing: ParsedStep, candidate: ParsedStep): boolean {
  if (existing.nodeType !== candidate.nodeType) return false;
  const existingChildren = existing.children.map((c) => normalizeDedupKey(c.label)).filter(Boolean);
  const candidateChildren = candidate.children.map((c) => normalizeDedupKey(c.label)).filter(Boolean);

  if (existingChildren.length > 0 || candidateChildren.length > 0) {
    if (existingChildren.length === 0 || candidateChildren.length === 0) return false;
    const childSimilarity = jaccardSimilarity(existingChildren, candidateChildren);
    const descSimilarity = textSimilarity(existing.description, candidate.description);
    return childSimilarity >= 0.65 || (childSimilarity >= 0.4 && descSimilarity >= 0.7);
  }

  if (!existing.description && !candidate.description) return true;
  if (!existing.description || !candidate.description) return false;
  return textSimilarity(existing.description, candidate.description) >= 0.8;
}

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

function inferHeaderLevel(line: string, hasCategoryContext: boolean): 1 | 2 {
  const trimmed = line.trim();
  const numbered = trimmed.match(/^(\d+(?:\.\d+)*)(?:[.)])?\s+/);
  if (numbered) {
    const depth = numbered[1].split('.').filter(Boolean).length;
    return depth >= 2 ? 2 : 1;
  }
  const markdown = trimmed.match(/^(#{1,6})\s+/);
  if (markdown) {
    return markdown[1].length >= 2 ? 2 : 1;
  }
  if (trimmed === trimmed.toUpperCase() && hasCategoryContext) return 2;
  return hasCategoryContext ? 2 : 1;
}

function cleanHeaderPrefix(line: string): string {
  return line
    .trim()
    .replace(/^\d+(?:\.\d+)*(?:[.)])?\s+/, '')
    .replace(/^#{1,6}\s+/, '')
    .trim();
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
  let currentCategory: ParsedStep | null = null;
  let currentSection: ParsedStep | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (isHeaderLine(trimmed)) {
      const headerLevel = inferHeaderLevel(trimmed, Boolean(currentCategory));
      const content = cleanHeaderPrefix(trimmed);
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(content);
      const { label, description } = smartSplitLabel(afterPrefix);
      const headerStep: ParsedStep = {
        id: nanoid(), label, description,
        nodeType: explicitType ?? 'subprocess',
        children: [],
        indent: headerLevel === 1 ? 0 : 1,
      };
      if (headerLevel === 1 || !currentCategory) {
        currentCategory = headerStep;
        currentSection = null;
        steps.push(currentCategory);
      } else {
        currentCategory.children.push(headerStep);
        currentSection = headerStep;
      }
    } else if (currentSection || currentCategory) {
      const content = isDashedLine(trimmed) ? cleanDashPrefix(trimmed) : trimmed;
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(content);
      const { label, description } = smartSplitLabel(afterPrefix);
      const nodeType = explicitType ?? classifyByContent(afterPrefix);
      const actor = detectActor(afterPrefix);
      const desc = actor ? `[${actor}] ${description}` : description;
      const step: ParsedStep = {
        id: nanoid(), label, description: desc, nodeType, children: [],
        indent: currentSection ? 2 : 1,
      };
      if (currentSection) {
        currentSection.children.push(step);
      } else if (currentCategory) {
        currentCategory.children.push(step);
      }
    } else {
      const content = isDashedLine(trimmed) ? cleanDashPrefix(trimmed) : trimmed;
      const { type: explicitType, cleaned: afterPrefix } = extractTypePrefix(content);
      const { label, description } = smartSplitLabel(afterPrefix);
      currentCategory = {
        id: nanoid(), label, description,
        nodeType: explicitType ?? 'subprocess',
        children: [],
        indent: 0,
      };
      currentSection = null;
      steps.push(currentCategory);
    }
  }

  for (const category of steps) {
    if (category.children.length > 0 && category.nodeType !== 'subprocess') {
      category.nodeType = 'subprocess';
    }
    for (const section of category.children) {
      if (section.children.length > 0 && section.nodeType !== 'subprocess') {
        section.nodeType = 'subprocess';
      }
    }
  }

  return annotateSemanticSteps(steps);
}

function countLeafSteps(steps: ParsedStep[]): number {
  let count = 0;
  for (const step of steps) {
    if (step.children.length === 0) {
      count++;
    } else {
      count += countLeafSteps(step.children);
    }
  }
  return count;
}

function countNestedContainers(steps: ParsedStep[], depth = 0): number {
  let count = 0;
  for (const step of steps) {
    if (depth > 0 && step.children.length > 0) count++;
    if (step.children.length > 0) count += countNestedContainers(step.children, depth + 1);
  }
  return count;
}

function countMapsFromHierarchy(steps: ParsedStep[]): number {
  let maps = 1; // root overview map
  const visit = (nodes: ParsedStep[]) => {
    for (const node of nodes) {
      if (node.children.length > 0) {
        maps++;
        visit(node.children);
      }
    }
  };
  visit(steps);
  return maps;
}

export function summarizeHierarchy(steps: ParsedStep[]): HierarchySummary {
  const categories = steps.length;
  const sections = steps.reduce(
    (sum, step) => sum + step.children.filter((child) => child.children.length > 0 || child.nodeType === 'subprocess').length,
    0,
  );
  const processSteps = countLeafSteps(steps);
  const nestedSubprocesses = countNestedContainers(steps);
  const estimatedMaps = countMapsFromHierarchy(steps);
  const preview = steps.slice(0, 5).map((step) => {
    const sectionLabels = step.children
      .filter((child) => child.children.length > 0 || child.nodeType === 'subprocess')
      .map((child) => child.label)
      .slice(0, 4);
    const directSteps = step.children.filter((child) => child.children.length === 0 && child.nodeType !== 'subprocess').length;
    return {
      category: step.label,
      sections: sectionLabels,
      directSteps,
    };
  });

  return {
    categories,
    sections,
    processSteps,
    nestedSubprocesses,
    estimatedMaps,
    preview,
  };
}

// ───── NORMALIZATION (shared post-parse layer) ─────

function normalizeSteps(steps: ParsedStep[]): ParsedStep[] {
  let result = steps.filter((s) => s.label.trim().length > 0);

  const merged: ParsedStep[] = [];
  const seen = new Map<string, number[]>();

  for (const step of result) {
    const key = normalizeDedupKey(step.label);
    const candidateIndexes = seen.get(key) ?? [];
    let mergedInto = -1;
    for (const idx of candidateIndexes) {
      if (shouldMergeDuplicate(merged[idx], step)) {
        mergedInto = idx;
        break;
      }
    }

    if (mergedInto >= 0) {
      const existing = merged[mergedInto];
      existing.children.push(...step.children);
      if (!existing.description && step.description) existing.description = step.description;
      if ((step.semanticScore ?? 0) > (existing.semanticScore ?? 0)) {
        existing.semanticScore = step.semanticScore;
        existing.semanticKind = step.semanticKind;
        existing.semanticSignals = step.semanticSignals;
      }
    } else {
      const newIndex = merged.length;
      merged.push({ ...step, children: [...step.children] });
      seen.set(key, [...candidateIndexes, newIndex]);
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

  const buildCategorySubMap = (
    parentStep: ParsedStep,
    parentMapId: string,
    parentNodeId: string,
  ): string => {
    const categoryMapId = nanoid();
    const sectionNodes = parentStep.children.filter((child) => child.children.length > 0);
    const directFlowSteps = parentStep.children.filter((child) => child.children.length === 0);
    const categoryOverviewNodes: Node<JourneyNodeData>[] = [];

    for (const section of sectionNodes) {
      const sectionNodeId = nanoid();
      const sectionColor = CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length];
      colorIdx++;
      const sectionMapId = nanoid();
      const { nodes: sectionNodesFlow, edges: sectionEdgesFlow } = buildFlowMap(section.children);
      maps[sectionMapId] = {
        id: sectionMapId,
        name: section.label,
        description: section.description || '',
        parentMapId: categoryMapId,
        parentNodeId: sectionNodeId,
        nodes: sectionNodesFlow,
        edges: sectionEdgesFlow,
      };
      categoryOverviewNodes.push(buildOverviewNode(
        sectionNodeId,
        section.label,
        section.description ? `${section.description} (${section.children.length} steps)` : `${section.children.length} steps`,
        sectionColor,
        sectionMapId,
      ));
    }

    if (directFlowSteps.length > 0) {
      const directNodeId = nanoid();
      const directMapId = nanoid();
      const { nodes: directNodes, edges: directEdges } = buildFlowMap(directFlowSteps);
      maps[directMapId] = {
        id: directMapId,
        name: `${parentStep.label} Flow`,
        description: `${directFlowSteps.length} direct steps`,
        parentMapId: categoryMapId,
        parentNodeId: directNodeId,
        nodes: directNodes,
        edges: directEdges,
      };
      categoryOverviewNodes.push(buildOverviewNode(
        directNodeId,
        'Direct Flow',
        `${directFlowSteps.length} steps`,
        '#64748b',
        directMapId,
      ));
    }

    const cols = Math.min(Math.ceil(Math.sqrt(categoryOverviewNodes.length || 1)), 3);
    const positionedCategoryNodes = categoryOverviewNodes.map((n, i) => ({
      ...n,
      position: { x: (i % cols) * 280, y: Math.floor(i / cols) * 160 },
    }));

    maps[categoryMapId] = {
      id: categoryMapId,
      name: parentStep.label,
      description: parentStep.description || '',
      parentMapId,
      parentNodeId,
      nodes: positionedCategoryNodes,
      edges: [],
    };

    return categoryMapId;
  };

  if (shouldSkipClustering) {
    for (const step of validSteps) {
      const nodeId = nanoid();
      const hasChildren = step.children.length > 0;
      const categoryColor = CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length];
      colorIdx++;

      let subMapId: string | undefined;
      if (hasChildren) {
        const hasSectionHierarchy = step.children.some((child) => child.children.length > 0);
        if (hasSectionHierarchy) {
          subMapId = buildCategorySubMap(step, rootMapId, nodeId);
        } else {
          subMapId = nanoid();
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

export interface AllocatedCategory {
  name: string;
  kind?: 'process' | 'facts';
  sourceId?: string;
  sourceName?: string;
  steps: ParsedStep[];
}

export interface AllocatedToProjectOptions {
  groupBySource?: boolean;
  dedupePolicy?: 'within_file' | 'cross_file_safe';
}

export function allocatedToProject(
  categories: AllocatedCategory[],
  graveyardSteps: ParsedStep[],
  projectName: string,
  isDraft: boolean,
  options?: AllocatedToProjectOptions,
): ProcessMapProject {
  const projectId = nanoid();
  const rootMapId = nanoid();
  const maps: Record<string, ProcessMap> = {};
  const rawOverviewNodes: Node<JourneyNodeData>[] = [];
  let colorIdx = 0;

  const createCategorySubMap = (
    cat: AllocatedCategory,
    parentMapId: string,
    parentNodeId: string,
  ): { subMapId: string; description: string; color: string } => {
    const subMapId = nanoid();
    const isFactsCategory = cat.kind === 'facts';
    const color = isFactsCategory ? '#94a3b8' : CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length];
    colorIdx++;

    let subNodes: Node<JourneyNodeData>[];
    let subEdges: Edge[];
    if (isFactsCategory) {
      const columns = Math.min(Math.ceil(Math.sqrt(cat.steps.length || 1)), 4);
      subNodes = cat.steps.map((step, i) => ({
        id: nanoid(),
        type: 'journeyNode',
        position: { x: (i % columns) * 220, y: Math.floor(i / columns) * 120 },
        data: {
          label: step.label,
          description: step.description,
          nodeType: 'action',
          color: '#94a3b8',
        },
      }));
      subEdges = [];
    } else {
      const built = buildFlowMap(cat.steps);
      subNodes = built.nodes;
      subEdges = built.edges;
    }

    const description = isFactsCategory ? `${cat.steps.length} statements` : `${cat.steps.length} steps`;
    maps[subMapId] = {
      id: subMapId,
      name: cat.name,
      description,
      parentMapId,
      parentNodeId,
      nodes: subNodes,
      edges: subEdges,
    };

    return { subMapId, description, color };
  };

  if (options?.groupBySource) {
    type SourceGroup = {
      sourceId: string;
      sourceName: string;
      categories: AllocatedCategory[];
      graveyard: ParsedStep[];
    };
    const sourceGroups = new Map<string, SourceGroup>();

    const ensureGroup = (sourceId: string, sourceName: string): SourceGroup => {
      const existing = sourceGroups.get(sourceId);
      if (existing) return existing;
      const created: SourceGroup = { sourceId, sourceName, categories: [], graveyard: [] };
      sourceGroups.set(sourceId, created);
      return created;
    };

    for (const cat of categories) {
      if (cat.steps.length === 0) continue;
      const sourceId = cat.sourceId ?? '__unsourced';
      const sourceName = cat.sourceName?.trim() || 'Imported Source';
      ensureGroup(sourceId, sourceName).categories.push(cat);
    }
    for (const step of graveyardSteps) {
      const sourceId = step.sourceId ?? '__unsourced';
      const sourceName = step.sourceName?.trim() || 'Imported Source';
      ensureGroup(sourceId, sourceName).graveyard.push(step);
    }

    for (const group of sourceGroups.values()) {
      if (group.categories.length === 0 && group.graveyard.length === 0) continue;

      const sourceNodeId = nanoid();
      const sourceMapId = nanoid();
      const sourceOverviewNodes: Node<JourneyNodeData>[] = [];

      for (const cat of group.categories) {
        const catNodeId = nanoid();
        const built = createCategorySubMap(cat, sourceMapId, catNodeId);
        sourceOverviewNodes.push(buildOverviewNode(
          catNodeId,
          cat.name,
          built.description,
          built.color,
          built.subMapId,
        ));
      }

      if (group.graveyard.length > 0) {
        const gNodeId = nanoid();
        const gMapId = nanoid();
        const gNodes: Node<JourneyNodeData>[] = group.graveyard.map((s, i) => ({
          id: nanoid(), type: 'journeyNode' as const,
          position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 100 },
          data: { label: s.label, description: s.description, nodeType: 'action' as const, color: '#94a3b8' },
        }));
        maps[gMapId] = {
          id: gMapId,
          name: 'Unclassified',
          description: `${group.graveyard.length} items`,
          parentMapId: sourceMapId,
          parentNodeId: gNodeId,
          nodes: gNodes,
          edges: [],
        };
        sourceOverviewNodes.push(buildOverviewNode(
          gNodeId,
          'Unclassified',
          `${group.graveyard.length} items`,
          '#94a3b8',
          gMapId,
        ));
      }

      const cols = Math.min(Math.ceil(Math.sqrt(sourceOverviewNodes.length || 1)), 4);
      const positionedSourceNodes = sourceOverviewNodes.map((node, i) => ({
        ...node,
        position: { x: (i % cols) * 280, y: Math.floor(i / cols) * 160 },
      }));

      maps[sourceMapId] = {
        id: sourceMapId,
        name: group.sourceName,
        description: `${group.categories.length} categories`,
        parentMapId: rootMapId,
        parentNodeId: sourceNodeId,
        nodes: positionedSourceNodes,
        edges: [],
      };

      rawOverviewNodes.push(buildOverviewNode(
        sourceNodeId,
        group.sourceName,
        `${group.categories.length} categories`,
        '#334155',
        sourceMapId,
      ));
    }
  } else {
    for (const cat of categories) {
      if (cat.steps.length === 0) continue;
      const nodeId = nanoid();
      const built = createCategorySubMap(cat, rootMapId, nodeId);
      rawOverviewNodes.push({
        id: nodeId, type: 'journeyNode', position: { x: 0, y: 0 },
        data: {
          label: cat.name,
          description: built.description,
          nodeType: 'subprocess',
          color: built.color,
          subMapId: built.subMapId,
        },
      });
    }

    if (graveyardSteps.length > 0) {
      const gId = nanoid();
      const gMapId = nanoid();
      const gNodes: Node<JourneyNodeData>[] = graveyardSteps.map((s, i) => ({
        id: nanoid(), type: 'journeyNode' as const,
        position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 100 },
        data: { label: s.label, description: s.description, nodeType: 'action' as const, color: '#94a3b8' },
      }));
      maps[gMapId] = { id: gMapId, name: 'Unclassified', description: `${graveyardSteps.length} items`, parentMapId: rootMapId, parentNodeId: gId, nodes: gNodes, edges: [] };
      rawOverviewNodes.push({
        id: gId, type: 'journeyNode', position: { x: 0, y: 0 },
        data: { label: 'Unclassified', description: `${graveyardSteps.length} items`, nodeType: 'subprocess', color: '#94a3b8', subMapId: gMapId },
      });
    }
  }

  const columns = Math.min(Math.ceil(Math.sqrt(rawOverviewNodes.length)), 4);
  const overviewNodes = rawOverviewNodes.map((node, i) => ({
    ...node, position: { x: (i % columns) * 280, y: Math.floor(i / columns) * 160 },
  }));

  maps[rootMapId] = { id: rootMapId, name: 'Overview', description: 'Top-level categories', parentMapId: null, parentNodeId: null, nodes: overviewNodes, edges: [] };

  return {
    id: projectId, name: projectName,
    description: isDraft ? 'Draft — review and finalize' : 'Imported from text',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    rootMapId, maps, isDraft,
  };
}
