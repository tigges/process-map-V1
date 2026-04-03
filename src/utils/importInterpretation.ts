import { parseTextToSteps, type ParsedStep } from './textParser';

export type ImportCluster = 'context_process_category' | 'process' | 'subprocess' | 'fact' | 'unclassified';

export interface InterpretationBlock {
  id: string;
  label: string;
  excerpt: string;
  cluster: ImportCluster;
  confidence: number;
  signals: string[];
}

export interface PageInterpretation {
  page: number;
  dominantCluster: ImportCluster;
  blocks: InterpretationBlock[];
}

export interface ImportInterpretation {
  sourceName: string;
  pages: PageInterpretation[];
  countsByCluster: Record<ImportCluster, number>;
  reviewCountByCluster: Record<ImportCluster, number>;
  totalBlocks: number;
  reviewCount: number;
  overviewLabels: string[];
  factsBoardLabels: string[];
  unclassifiedLabels: string[];
}

export const CLUSTER_LABELS: Record<ImportCluster, string> = {
  context_process_category: 'Context',
  process: 'Process',
  subprocess: 'Subprocess',
  fact: 'Fact',
  unclassified: 'Unclassified',
};

const DECISION_STARTERS = /^(if |when |does |should |will |can |is |are |has |have |check |verify |confirm |validate |ensure )/i;
const ACTION_VERBS = /^(send |create |update |delete |add |remove |set |get |open |close |log |save |submit |upload |download |assign |escalate |notify |inform |redirect |advise |guide |process |handle |review |approve |reject |cancel |complete |reset |change |modify |request |contact |transfer |forward |post |click |select |enter |fill |search |navigate |enable |disable )/i;
const ACTION_WORD_PATTERN = /\b(send|create|update|delete|add|remove|set|get|open|close|log|save|submit|upload|download|assign|escalate|notify|inform|redirect|advise|guide|process|handle|review|approve|reject|cancel|complete|reset|change|modify|request|contact|transfer|forward|post|click|select|enter|fill|search|navigate|enable|disable)\b/i;
const FACT_CUE_STARTERS = /^(context|background|fact|statement|definition|policy|rule|constraint|assumption|premise|current state|concept)\b/i;
const FACT_DEFINITION_PATTERN = /\b(is|are|means|defined as|refers to|consists of)\b/i;
const FACT_MEASURE_PATTERN = /(%|\bas of\b|\bcurrently\b|\bbaseline\b|\btarget\b|\bthreshold\b|\bsla\b|\bkpi\b|\b\d+\s*(days?|hours?|minutes?)\b)/i;

function clip(text: string, max = 160): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}...`;
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function uniqueLimit(items: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = normalizeKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function isUnclassifiedCandidate(label: string, description: string): { value: boolean; signals: string[] } {
  const trimmed = label.trim();
  const lower = trimmed.toLowerCase();
  const signals: string[] = [];

  if (trimmed.length <= 3) signals.push('very-short-label');
  if (/^\d+$/.test(trimmed)) signals.push('numeric-only');
  if (/^[.\-_=*#]+$/.test(trimmed)) signals.push('symbol-noise');
  if (lower === 'undefined' || lower === 'null') signals.push('undefined-token');
  if (!description.trim() && trimmed.length < 5 && !/[a-zA-Z]{3,}/.test(trimmed)) {
    signals.push('low-text-signal');
  }
  if (/^(note|disclaimer|warning|version|revision|by |prepared|training)/.test(lower)) {
    signals.push('meta-line');
  }

  return { value: signals.length > 0, signals };
}

function scoreFact(label: string, description: string, nodeType: ParsedStep['nodeType']): { score: number; signals: string[] } {
  const descRaw = description.replace(/^\[[^\]]+\]\s*/, '').trim();
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
  if (nodeType === 'decision' || hasQuestion) {
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

  return { score: Math.max(0, Math.min(1, score)), signals };
}

function classifyStep(step: ParsedStep, parentLevel = false): { cluster: ImportCluster; confidence: number; signals: string[] } {
  const unclassified = isUnclassifiedCandidate(step.label, step.description);
  if (unclassified.value) {
    return { cluster: 'unclassified', confidence: 0.76, signals: unclassified.signals.slice(0, 3) };
  }

  const fact = scoreFact(step.label, step.description, step.nodeType);
  if (fact.score >= 0.6) {
    return { cluster: 'fact', confidence: Number(Math.max(0.66, fact.score).toFixed(2)), signals: fact.signals.slice(0, 4) };
  }

  if (parentLevel) {
    return {
      cluster: 'context_process_category',
      confidence: step.children.length > 0 ? 0.9 : 0.82,
      signals: step.children.length > 0 ? ['parent-group', 'header-like'] : ['header-like'],
    };
  }

  if (step.nodeType === 'subprocess') {
    return { cluster: 'subprocess', confidence: 0.88, signals: ['nested-flow', 'grouped-steps'] };
  }

  const actionLike = ACTION_VERBS.test(step.label.toLowerCase()) || ACTION_VERBS.test(step.description.toLowerCase());
  const decisionLike = step.nodeType === 'decision' || DECISION_STARTERS.test(step.label.toLowerCase()) || step.label.includes('?');
  const signals = [
    ...(actionLike ? ['action-verb'] : []),
    ...(decisionLike ? ['decision-like'] : []),
    'operational-step',
  ];

  return { cluster: 'process', confidence: actionLike ? 0.92 : 0.84, signals: signals.slice(0, 3) };
}

function classifyLine(line: string): { cluster: ImportCluster; confidence: number; signals: string[] } {
  const trimmed = line.trim();
  if (!trimmed) return { cluster: 'unclassified', confidence: 0.7, signals: ['empty-line'] };
  if (/^\d+[.)]\s/.test(trimmed) || /^#{1,3}\s/.test(trimmed) || trimmed === trimmed.toUpperCase()) {
    return { cluster: 'context_process_category', confidence: 0.82, signals: ['header-like'] };
  }
  const unclassified = isUnclassifiedCandidate(trimmed, '');
  if (unclassified.value) return { cluster: 'unclassified', confidence: 0.75, signals: unclassified.signals.slice(0, 3) };
  const fact = scoreFact(trimmed, '', 'action');
  if (fact.score >= 0.6) {
    return { cluster: 'fact', confidence: Number(Math.max(0.66, fact.score).toFixed(2)), signals: fact.signals.slice(0, 3) };
  }
  if (/^[\s]*[-*•]\s/.test(trimmed) || ACTION_VERBS.test(trimmed.toLowerCase())) {
    return { cluster: 'process', confidence: 0.84, signals: ['bullet-step', 'action-verb'] };
  }
  return { cluster: 'unclassified', confidence: 0.72, signals: ['low-structure'] };
}

export function buildImportInterpretation(sourceName: string, pageTexts: string[]): ImportInterpretation {
  const pages: PageInterpretation[] = [];
  const countsByCluster: Record<ImportCluster, number> = {
    context_process_category: 0,
    process: 0,
    subprocess: 0,
    fact: 0,
    unclassified: 0,
  };
  const reviewCountByCluster: Record<ImportCluster, number> = {
    context_process_category: 0,
    process: 0,
    subprocess: 0,
    fact: 0,
    unclassified: 0,
  };
  let totalBlocks = 0;
  let reviewCount = 0;
  const overviewLabels: string[] = [];
  const factsBoardLabels: string[] = [];
  const unclassifiedLabels: string[] = [];

  pageTexts.forEach((pageText, pageIdx) => {
    const steps = parseTextToSteps(pageText);
    const blocks: InterpretationBlock[] = [];
    let blockIndex = 0;

    const pushBlock = (
      label: string,
      excerpt: string,
      classified: { cluster: ImportCluster; confidence: number; signals: string[] },
    ) => {
      const next: InterpretationBlock = {
        id: `p${pageIdx + 1}-b${blockIndex + 1}`,
        label: clip(label, 72),
        excerpt: clip(excerpt || label, 160),
        cluster: classified.cluster,
        confidence: Number(Math.max(0.5, Math.min(0.98, classified.confidence)).toFixed(2)),
        signals: classified.signals.slice(0, 4),
      };
      blockIndex++;
      blocks.push(next);
      totalBlocks++;
      countsByCluster[next.cluster]++;
      const isNeedsReview = next.confidence < 0.75 || next.cluster === 'unclassified';
      if (isNeedsReview) {
        reviewCount++;
        reviewCountByCluster[next.cluster]++;
      }
      if (next.cluster === 'context_process_category') overviewLabels.push(next.label);
      if (next.cluster === 'fact') factsBoardLabels.push(next.label);
      if (next.cluster === 'unclassified') unclassifiedLabels.push(next.label);
    };

    if (steps.length > 0) {
      const visitStep = (step: ParsedStep, depth: number) => {
        const classified = classifyStep(step, depth === 0);
        pushBlock(step.label, `${step.label}: ${step.description}`.trim(), classified);
        for (const child of step.children) visitStep(child, depth + 1);
      };
      for (const step of steps) {
        visitStep(step, 0);
      }
    } else {
      const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 10);
      lines.forEach((line) => {
        const classified = classifyLine(line);
        pushBlock(line, line, classified);
      });
    }

    const pageClusterCounts: Record<ImportCluster, number> = {
      context_process_category: 0,
      process: 0,
      subprocess: 0,
      fact: 0,
      unclassified: 0,
    };
    for (const block of blocks) pageClusterCounts[block.cluster]++;
    const dominantCluster = (Object.keys(pageClusterCounts) as ImportCluster[]).reduce((best, key) => (
      pageClusterCounts[key] > pageClusterCounts[best] ? key : best
    ), 'context_process_category');

    pages.push({ page: pageIdx + 1, dominantCluster, blocks });
  });

  return {
    sourceName,
    pages,
    countsByCluster,
    reviewCountByCluster,
    totalBlocks,
    reviewCount,
    overviewLabels: uniqueLimit(overviewLabels, 8),
    factsBoardLabels: uniqueLimit(factsBoardLabels, 8),
    unclassifiedLabels: uniqueLimit(unclassifiedLabels, 8),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildContentMapHtml(interpretation: ImportInterpretation): string {
  const pagesHtml = interpretation.pages.map((page) => {
    const blocks = page.blocks.map((block) => `
      <div class="map-block map-block--${block.cluster}">
        <div class="map-block__head">
          <span class="map-badge">${CLUSTER_LABELS[block.cluster]}</span>
          <span class="map-confidence">${block.confidence.toFixed(2)}</span>
        </div>
        <div class="map-label">${escapeHtml(block.label)}</div>
        <div class="map-excerpt">${escapeHtml(block.excerpt)}</div>
        <div class="map-signals">${block.signals.map((s) => `<span>${escapeHtml(s)}</span>`).join('')}</div>
      </div>
    `).join('');
    return `
      <section class="map-page">
        <h3>Page ${page.page} · ${CLUSTER_LABELS[page.dominantCluster]}</h3>
        ${blocks}
      </section>
    `;
  }).join('');

  const summaryItems = (Object.keys(interpretation.countsByCluster) as ImportCluster[]).map((key) => `
    <div class="map-count map-count--${key}">
      <div class="num">${interpretation.countsByCluster[key]}</div>
      <div class="label">${CLUSTER_LABELS[key]}</div>
    </div>
  `).join('');

  const previewList = (items: string[]) => (
    items.length > 0 ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') : '<li>None detected</li>'
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PDF Import Cluster Map — ${escapeHtml(interpretation.sourceName)}</title>
  <style>
    body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px}
    h1{font-size:24px;margin-bottom:6px}
    .meta{font-size:12px;color:#475569;margin-bottom:14px}
    .counts{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:16px}
    .map-count{background:#fff;border:1px solid #dbe2ea;border-radius:8px;padding:8px 10px;text-align:center}
    .map-count .num{font-size:24px;font-weight:700;line-height:1.1}
    .map-count .label{font-size:11px;color:#64748b}
    .map-pages{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .map-page{background:#fff;border:1px solid #dbe2ea;border-radius:10px;padding:12px}
    .map-page h3{margin:0 0 10px 0;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
    .map-block{border-radius:8px;border-left:3px solid #64748b;padding:8px 10px;margin-bottom:8px}
    .map-block__head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .map-badge{font-size:10px;text-transform:uppercase;letter-spacing:.04em;background:#e2e8f0;border-radius:999px;padding:2px 7px}
    .map-confidence{font-size:11px;color:#475569}
    .map-label{font-size:13px;font-weight:700;margin-bottom:3px}
    .map-excerpt{font-size:12px;color:#334155;margin-bottom:6px}
    .map-signals{display:flex;gap:4px;flex-wrap:wrap}
    .map-signals span{font-size:10px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:999px;padding:1px 6px;color:#475569}
    .map-block--context_process_category{background:#f0eeff;border-left-color:#6d5fd4}
    .map-block--process{background:#edf8f2;border-left-color:#2e8a5a}
    .map-block--subprocess{background:#edf4fd;border-left-color:#2a6ab8}
    .map-block--fact{background:#fdf8ed;border-left-color:#b8820a}
    .map-block--unclassified{background:#f4f4f5;border-left-color:#a1a1aa}
    .preview{margin-top:16px;background:#fff;border:1px solid #dbe2ea;border-radius:10px;padding:12px}
    .preview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .preview h4{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#475569;margin:0 0 8px 0}
    .preview ul{margin:0;padding-left:16px}
    .preview li{font-size:12px;line-height:1.45;margin-bottom:4px}
    @media (max-width:1024px){.map-pages{grid-template-columns:repeat(2,minmax(0,1fr))}.counts{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media (max-width:720px){.map-pages,.preview-grid{grid-template-columns:1fr}.counts{grid-template-columns:repeat(2,minmax(0,1fr))}}
  </style>
</head>
<body>
  <h1>PDF Import Cluster Map</h1>
  <div class="meta">${escapeHtml(interpretation.sourceName)} · ${interpretation.pages.length} pages · ProcessMap import clustering</div>
  <div class="counts">${summaryItems}</div>
  <div class="map-pages">${pagesHtml}</div>
  <section class="preview">
    <div class="preview-grid">
      <div><h4>Likely overview/category nodes</h4><ul>${previewList(interpretation.overviewLabels)}</ul></div>
      <div><h4>Likely facts board items</h4><ul>${previewList(interpretation.factsBoardLabels)}</ul></div>
      <div><h4>Likely unclassified bucket items</h4><ul>${previewList(interpretation.unclassifiedLabels)}</ul></div>
    </div>
  </section>
</body>
</html>`;
}

export function buildDeepVisualPrompt(sourceName: string, pageCount: number): string {
  return `You are a ProcessMap Import Visualizer.

Analyze the attached PDF "${sourceName}" (${pageCount} pages) and return one complete HTML file that maps the document by page into these clusters:
- context_process_category
- process
- subprocess
- fact
- unclassified

Requirements:
- Output ONLY HTML (<!DOCTYPE html> ...).
- Include a legend and one page card per PDF page.
- In each card, show ordered blocks with:
  - cluster badge
  - interpreted label
  - excerpt (<=160 chars)
  - confidence (0.00-1.00)
  - 2-4 signals
- Add summary counts and import preview:
  - likely overview/category nodes
  - likely facts board items
  - likely unclassified items

Classification policy:
- context_process_category: section/chapter headers and parent grouping blocks.
- process: imperative operational steps and actor-action instructions.
- subprocess: grouped/nested mini-flows and staged branch structures.
- fact: definitions, constraints, baselines, SLA/KPI/time policy statements.
- unclassified: noise/meta lines and screenshot-only/UI-only content with low procedural signal.

Be strict, concise, and deterministic.`;
}
