import { useState, useCallback, useMemo, useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  parseTextToSteps,
  stepsToProject,
  allocatedToProject,
  FACTS_CATEGORY_NAME,
  FACTS_CATEGORY_DESCRIPTION,
  ensureFactsCategory,
  countFactCandidates,
  summarizeHierarchy,
  type ParsedStep,
} from '../utils/textParser';
import { hasApiKey, smartParse, estimateCost, getManualPrompt } from '../utils/claudeApi';
import {
  buildImportInterpretation,
  buildContentMapHtml,
  buildDeepVisualPrompt,
  CLUSTER_LABELS,
  type ImportInterpretation,
  type ImportCluster,
} from '../utils/importInterpretation';
import ParsedTreeReview from './ParsedTreeReview';
import CategoryBuilder, { type Category } from './CategoryBuilder';
import StepAllocator from './StepAllocator';

interface TextImportModalProps {
  onClose: () => void;
}

const PLACEHOLDER = `Paste your process text here, or upload a file (.txt, .md, .pdf).

The parser detects:
• Numbered lines (1. 2. 3.) → categories
• Dashed lines (- [action] ...) → steps
• [decision] tags → decision nodes
• ALL CAPS headers → section breaks

For best results with complex documents, enable "Smart Parse (AI)"
which uses Claude to intelligently structure your content.`;

type WizardStep = 'paste' | 'confirm-ai' | 'review' | 'categories' | 'allocate';
type GroupingMode = 'per_file' | 'shared_categories';
type DedupePolicy = 'within_file' | 'cross_file_safe';
type OverviewFilter = 'all' | 'needs_review' | 'unclassified' | 'fact';

function attachSourceMeta(steps: ParsedStep[], sourceName: string): ParsedStep[] {
  return steps.map((step) => ({
    ...step,
    sourceId: sourceName,
    sourceName,
    children: attachSourceMeta(step.children, sourceName),
  }));
}

interface ParsedSourceFile {
  id: string;
  name: string;
  steps: ParsedStep[];
}

interface ParseSingleFileResult {
  name: string;
  text: string;
  pages?: string[];
}

type UploadedSourceType = 'none' | 'pdf' | 'docx' | 'text';

export default function TextImportModal({ onClose }: TextImportModalProps) {
  const importProject = useAppStore((s) => s.importProject);

  const [wizardStep, setWizardStep] = useState<WizardStep>('paste');
  const [text, setText] = useState('');
  const [projectName, setProjectName] = useState('');
  const [parsedSteps, setParsedSteps] = useState<ParsedStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useAi, setUseAi] = useState(true);
  const [wasAiParsed, setWasAiParsed] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allowAiCategoryExpansion, setAllowAiCategoryExpansion] = useState(false);
  const [alwaysIncludeFacts, setAlwaysIncludeFacts] = useState(true);
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('per_file');
  const [dedupePolicy, setDedupePolicy] = useState<DedupePolicy>('within_file');
  const [parsedFiles, setParsedFiles] = useState<ParsedSourceFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<UploadedSourceType>('none');
  const [sourceFileName, setSourceFileName] = useState('');
  const [sourcePageTexts, setSourcePageTexts] = useState<string[]>([]);
  const [importInterpretation, setImportInterpretation] = useState<ImportInterpretation | null>(null);
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [deepPromptCopied, setDeepPromptCopied] = useState(false);
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aiAvailable = hasApiKey();
  const costEstimate = text ? estimateCost(text) : null;
  const displayedSteps = useMemo(() => {
    if (!activeFileId) return parsedSteps;
    const selected = parsedFiles.find((f) => f.id === activeFileId);
    return selected ? selected.steps : parsedSteps;
  }, [activeFileId, parsedFiles, parsedSteps]);

  const factCount = useMemo(() => countFactCandidates(displayedSteps), [displayedSteps]);

  const suggestedCategories = useMemo(() => {
    const base = displayedSteps
      .filter((s) => s.nodeType === 'subprocess' || s.children.length > 0)
      .map((s) => s.label);
    if (alwaysIncludeFacts || factCount > 0) return ensureFactsCategory(base);
    return base;
  }, [displayedSteps, factCount, alwaysIncludeFacts]);

  const hierarchySummary = useMemo(() => summarizeHierarchy(displayedSteps), [displayedSteps]);

  const filteredInterpretationPages = useMemo(() => {
    if (!importInterpretation) return [];
    if (overviewFilter === 'all') return importInterpretation.pages;
    return importInterpretation.pages
      .map((page) => ({
        ...page,
        blocks: page.blocks.filter((block) => {
          if (overviewFilter === 'needs_review') {
            return block.cluster === 'unclassified' || block.confidence < 0.75;
          }
          return block.cluster === overviewFilter;
        }),
      }))
      .filter((page) => page.blocks.length > 0);
  }, [importInterpretation, overviewFilter]);

  const handleBasicParse = useCallback(() => {
    if (!text.trim()) return;
    const steps = parseTextToSteps(text);
    setParsedSteps(steps);
    setWizardStep('review');
  }, [text]);

  const handleRequestAiParse = useCallback(() => {
    if (!text.trim()) return;
    setWizardStep('confirm-ai');
  }, [text]);

  const handleAiParse = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const structured = await smartParse(text);
      setText(structured);
      const steps = parseTextToSteps(structured);
      setParsedSteps(steps);
      setParsedFiles([]);
      setActiveFileId(null);
      setWasAiParsed(true);
      setWizardStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI parse failed');
      setWizardStep('paste');
    } finally {
      setLoading(false);
    }
  }, [text]);

  const handleParse = useCallback(() => {
    if (useAi && aiAvailable) {
      handleRequestAiParse();
    } else {
      handleBasicParse();
    }
  }, [useAi, aiAvailable, handleRequestAiParse, handleBasicParse]);

  const handleImportFinal = useCallback(() => {
    if (parsedSteps.length === 0) return;
    const project = stepsToProject(parsedSteps, projectName || 'Imported Journey', false, wasAiParsed);
    importProject(JSON.stringify(project));
    onClose();
  }, [parsedSteps, projectName, importProject, onClose, wasAiParsed]);

  const handleCustomImport = useCallback(() => {
    setWizardStep('categories');
  }, []);

  const handleCategoriesConfirm = useCallback((cats: Category[]) => {
    const names = cats.map((c) => c.name);
    const shouldInjectFacts = (alwaysIncludeFacts || factCount > 0) && !names.includes(FACTS_CATEGORY_NAME);
    const withFacts = shouldInjectFacts
      ? [...cats, {
          id: crypto.randomUUID(),
          name: FACTS_CATEGORY_NAME,
          description: FACTS_CATEGORY_DESCRIPTION,
          steps: [],
          kind: 'facts' as const,
          origin: 'auto' as const,
        }]
      : cats;
    setCategories(withFacts);
    setWizardStep('allocate');
  }, [alwaysIncludeFacts, factCount]);

  const handleAllocateConfirm = useCallback(
    (cats: Category[], graveyard: ParsedStep[], unallocated: ParsedStep[]) => {
      // Safety-first: unresolved items are never silently dropped.
      const allGraveyard = [...graveyard, ...unallocated];
      const allocatedCats = cats.map((c) => ({
        name: c.name,
        kind: c.kind,
        steps: c.steps,
        sourceId: activeFileId ?? undefined,
        sourceName: activeFileId ? (parsedFiles.find((f) => f.id === activeFileId)?.name ?? 'Imported Source') : undefined,
      }));
      const project = allocatedToProject(
        allocatedCats,
        allGraveyard,
        projectName || 'Imported Journey',
        false,
        {
          groupBySource: groupingMode === 'per_file',
          dedupePolicy,
        },
      );
      importProject(JSON.stringify(project));
      if (unallocated.length > 0) {
        console.info(`Moved ${unallocated.length} unallocated steps to Unclassified during import.`);
      }
      onClose();
    },
    [projectName, importProject, onClose, groupingMode, dedupePolicy, activeFileId, parsedFiles],
  );

  const handleFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const parseSingleFile = useCallback(async (file: File): Promise<ParseSingleFileResult> => {
    const name = file.name.toLowerCase();
    let fileText = '';
    let pageTexts: string[] | undefined;
    if (name.endsWith('.pdf')) {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const lines: string[] = [];
        let lastY: number | null = null;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const textItem = item as { str: string; transform: number[] };
          const y = Math.round(textItem.transform[5]);
          if (lastY !== null && Math.abs(y - lastY) > 5) lines.push('\n');
          lines.push(textItem.str);
          lastY = y;
        }
        pages.push(lines.join(''));
      }
      fileText = pages.join('\n\n');
      pageTexts = pages.map((p) => p.trim()).filter((p) => p.length > 0);
    } else if (name.endsWith('.docx')) {
      const { extractDocxText } = await import('../utils/exportImport');
      fileText = await extractDocxText(file);
    } else {
      fileText = await file.text();
    }
    return { name: file.name, text: fileText, pages: pageTexts };
  }, []);

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = '';

    setLoading(true);
    try {
      if (files.length === 1) {
        const parsed = await parseSingleFile(files[0]);
        const lowerName = files[0].name.toLowerCase();
        setText(parsed.text);
        setParsedFiles([]);
        setActiveFileId(null);
        if (lowerName.endsWith('.pdf')) {
          const pages = parsed.pages ?? [];
          setSourceType('pdf');
          setSourceFileName(files[0].name);
          setSourcePageTexts(pages);
          setImportInterpretation(buildImportInterpretation(files[0].name, pages));
        } else {
          setSourceType(lowerName.endsWith('.docx') ? 'docx' : 'text');
          setSourceFileName(files[0].name);
          setSourcePageTexts([]);
          setImportInterpretation(null);
        }
        setShowInterpretation(false);
        setOverviewFilter('all');
        setDeepPromptCopied(false);
        if (!projectName) setProjectName(parsed.name.replace(/\.\w+$/, ''));
      } else {
        const results: ParsedSourceFile[] = [];
        const mergedTextParts: string[] = [];
        for (const file of files) {
          const parsed = await parseSingleFile(file);
          const steps = attachSourceMeta(parseTextToSteps(parsed.text), file.name);
          results.push({ id: file.name, name: file.name, steps });
          mergedTextParts.push(`## ${file.name}\n${parsed.text}`);
        }
        setParsedFiles(results);
        setActiveFileId(results[0]?.id ?? null);
        setParsedSteps(results.flatMap((r) => r.steps));
        setText(mergedTextParts.join('\n\n'));
        setSourceType('none');
        setSourceFileName('Multiple files');
        setSourcePageTexts([]);
        setImportInterpretation(null);
        setShowInterpretation(false);
        setOverviewFilter('all');
        setDeepPromptCopied(false);
        if (!projectName) setProjectName('Multi-file import');
      }
    } catch (err) {
      console.error('File import failed:', err);
      setText('Error: Could not extract text from file.');
    } finally {
      setLoading(false);
    }
  }, [parseSingleFile, projectName]);

  const handleSourceTextChange = useCallback((value: string) => {
    setText(value);
    setError('');
    if (sourceType !== 'none') {
      setSourceType('none');
      setSourceFileName('');
      setSourcePageTexts([]);
      setImportInterpretation(null);
      setShowInterpretation(false);
      setOverviewFilter('all');
      setDeepPromptCopied(false);
    }
  }, [sourceType]);

  const notify = useCallback((message: string) => {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message);
    }
  }, []);

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(getManualPrompt()).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    });
  }, []);

  const handleExportContentMap = useCallback(() => {
    if (!importInterpretation) return;
    const html = buildContentMapHtml(importInterpretation);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const baseName = (sourceFileName || importInterpretation.sourceName || 'import-content-map').replace(/\.[^/.]+$/, '');
    link.href = url;
    link.download = `${baseName}-content-map.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify(`Downloaded ${baseName}-content-map.html`);
  }, [importInterpretation, sourceFileName, notify]);

  const handleCopyDeepVisualPrompt = useCallback(() => {
    if (!sourceFileName || sourceType !== 'pdf') return;
    navigator.clipboard.writeText(buildDeepVisualPrompt(sourceFileName, sourcePageTexts.length)).then(() => {
      setDeepPromptCopied(true);
      setTimeout(() => setDeepPromptCopied(false), 2000);
      notify('Copied deep visual prompt to clipboard.');
    });
  }, [sourceFileName, sourceType, sourcePageTexts.length, notify]);

  const activeStepNum =
    wizardStep === 'paste' || wizardStep === 'confirm-ai'
      ? 1
      : wizardStep === 'review'
        ? 2
        : wizardStep === 'categories'
          ? 3
          : 4;

  const stepTitle =
    wizardStep === 'paste'
      ? 'Step 1: Paste or Upload'
      : wizardStep === 'confirm-ai'
        ? 'Confirm AI Processing'
        : wizardStep === 'review'
          ? 'Step 2: Review & Edit Structure'
          : wizardStep === 'categories'
            ? 'Step 3: Define Categories'
            : 'Step 4: Allocate Steps';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${wizardStep === 'allocate' ? 'modal--extra-wide' : 'modal--wide'}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">{stepTitle}</h2>
          <div className="modal__steps">
            {[1, 2, 3, 4].map((n) => (
              <span key={n}>
                {n > 1 && <span className="modal__step-line" />}
                <span
                  className={`modal__step-dot ${
                    activeStepNum === n
                      ? 'modal__step-dot--active'
                      : activeStepNum > n
                        ? 'modal__step-dot--done'
                        : ''
                  }`}
                >
                  {n}
                </span>
              </span>
            ))}
          </div>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="modal__body">
          {wizardStep === 'paste' && (
            <>
              {error && <p className="modal__error">{error}</p>}
              <div className="modal__field">
                <label className="modal__label">Project Name</label>
                <input
                  className="modal__input"
                  placeholder="e.g. Customer Onboarding Flow"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>
              <div className="modal__field">
                <label className="modal__label">
                  Source
                  <button className="btn btn--ghost btn--sm" onClick={handleFileUpload} style={{ marginLeft: 8 }}>
                    Upload file(s) (.txt, .pdf, .docx)
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={handleCopyPrompt} style={{ marginLeft: 4 }}>
                    {promptCopied ? 'Copied!' : 'Copy Claude Prompt'}
                  </button>
                </label>
                {loading && <p className="modal__loading">Processing file...</p>}
                <textarea
                  className="modal__textarea"
                  placeholder={PLACEHOLDER}
                  value={text}
                  onChange={(e) => handleSourceTextChange(e.target.value)}
                  rows={14}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.text,.pdf,.docx"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>
              <div className="modal__parse-mode">
                <label className="modal__toggle-label">
                  <span>Grouping mode:</span>
                  <select
                    className="allocator__review-select"
                    value={groupingMode}
                    onChange={(e) => setGroupingMode(e.target.value as GroupingMode)}
                  >
                    <option value="per_file">Per-file categories (recommended)</option>
                    <option value="shared_categories">Shared categories across files</option>
                  </select>
                </label>
                <label className="modal__toggle-label">
                  <span>Dedupe policy:</span>
                  <select
                    className="allocator__review-select"
                    value={dedupePolicy}
                    onChange={(e) => setDedupePolicy(e.target.value as DedupePolicy)}
                  >
                    <option value="within_file">Within file only</option>
                    <option value="cross_file_safe">Cross-file safe</option>
                  </select>
                </label>
              </div>
              <div className="modal__parse-mode">
                <label className="modal__toggle-label">
                  <input
                    type="checkbox"
                    checked={useAi}
                    onChange={(e) => setUseAi(e.target.checked)}
                    disabled={!aiAvailable}
                  />
                  <span>Smart Parse (AI)</span>
                  {!aiAvailable && <span className="modal__toggle-hint">Set API key in Projects sidebar</span>}
                  {aiAvailable && <span className="modal__toggle-hint">Uses Claude to intelligently structure content</span>}
                </label>
              </div>
            </>
          )}

          {wizardStep === 'confirm-ai' && (
            <div className="modal__confirm">
              <div className="modal__confirm-icon">🤖</div>
              <h3>Send to Claude for AI Processing?</h3>
              <p>Your text ({costEstimate?.tokens.toLocaleString()} tokens) will be sent to Anthropic's Claude API for intelligent structuring.</p>
              <div className="modal__confirm-details">
                <div className="modal__confirm-row">
                  <span>Estimated cost:</span>
                  <strong>{costEstimate?.cost}</strong>
                </div>
                <div className="modal__confirm-row">
                  <span>Processing time:</span>
                  <strong>5-15 seconds</strong>
                </div>
                <div className="modal__confirm-row">
                  <span>Model:</span>
                  <strong>Claude Haiku 4</strong>
                </div>
              </div>
              <p className="modal__confirm-note">The text is sent directly to Anthropic's API. It is not stored by this app.</p>
            </div>
          )}

          {wizardStep === 'review' && (
            <>
              <p className="modal__hint">
                Review the detected structure. Rename items, change types, or remove entries.
                Recommended: continue to customize categories and allocate steps before importing.
                {factCount > 0 ? ` Detected ${factCount} fact/context statements. They will be pre-allocated to '${FACTS_CATEGORY_NAME}' in Step 4.` : ''}
              </p>
              <div className="import-hierarchy">
                <div className="import-hierarchy__stats">
                  <span className="tree-review__stat">{hierarchySummary.categories} categories</span>
                  <span className="tree-review__stat">{hierarchySummary.sections} sections</span>
                  <span className="tree-review__stat">{hierarchySummary.processSteps} process steps</span>
                  <span className="tree-review__stat">{hierarchySummary.estimatedMaps} map(s)</span>
                </div>
                <p className="import-hierarchy__hint">
                  Planned hierarchy: Overview → Category → Section → Flow steps.
                </p>
                {hierarchySummary.preview.length > 0 && (
                  <div className="import-hierarchy__preview">
                    {hierarchySummary.preview.map((item) => (
                      <div key={item.category} className="import-hierarchy__card">
                        <div className="import-hierarchy__title">{item.category}</div>
                        <div className="import-hierarchy__meta">
                          Sections: {item.sections.length > 0 ? item.sections.join(', ') : 'None'}
                        </div>
                        {item.directSteps > 0 && (
                          <div className="import-hierarchy__meta">
                            Direct process steps: {item.directSteps}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {importInterpretation && (
                <div className="import-map-overview">
                  <div className="import-map-overview__head">
                    <div>
                      <h4>Import interpretation overview</h4>
                      <p>{importInterpretation.sourceName} · {importInterpretation.pages.length} pages</p>
                    </div>
                    <div className="import-map-overview__counts">
                      {(Object.keys(importInterpretation.countsByCluster) as ImportCluster[]).map((cluster) => (
                        <span
                          key={cluster}
                          className={`import-map-overview__chip import-map-overview__chip--${cluster}`}
                        >
                          {CLUSTER_LABELS[cluster]} {importInterpretation.countsByCluster[cluster]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="import-map-overview__actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => setShowInterpretation((v) => !v)}>
                      {showInterpretation ? 'Hide page overview' : 'Show page overview'}
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={handleExportContentMap}>
                      Export content map (.html)
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={handleCopyDeepVisualPrompt}
                      disabled={sourceType !== 'pdf'}
                    >
                      {deepPromptCopied ? 'Deep visual prompt copied!' : 'Copy Claude deep visual prompt'}
                    </button>
                  </div>
                  <div className="import-map-overview__filters">
                    <span>Filter:</span>
                    <button
                      className={`toolbar__toggle ${overviewFilter === 'all' ? 'toolbar__toggle--active' : ''}`}
                      onClick={() => setOverviewFilter('all')}
                    >
                      All
                    </button>
                    <button
                      className={`toolbar__toggle ${overviewFilter === 'needs_review' ? 'toolbar__toggle--active' : ''}`}
                      onClick={() => setOverviewFilter('needs_review')}
                    >
                      Needs review ({importInterpretation.reviewCount})
                    </button>
                    <button
                      className={`toolbar__toggle ${overviewFilter === 'unclassified' ? 'toolbar__toggle--active' : ''}`}
                      onClick={() => setOverviewFilter('unclassified')}
                    >
                      Unclassified ({importInterpretation.reviewCountByCluster.unclassified})
                    </button>
                    <button
                      className={`toolbar__toggle ${overviewFilter === 'fact' ? 'toolbar__toggle--active' : ''}`}
                      onClick={() => setOverviewFilter('fact')}
                    >
                      Facts ({importInterpretation.countsByCluster.fact})
                    </button>
                  </div>
                  <div className="import-map-overview__summary">
                    {importInterpretation.reviewCount}/{importInterpretation.totalBlocks} blocks need review
                    {overviewFilter !== 'all' ? ` · showing ${overviewFilter.replace('_', ' ')}` : ''}
                  </div>
                  {showInterpretation && (
                    <>
                      {filteredInterpretationPages.length === 0 && (
                        <div className="import-map-overview__empty">No blocks match this filter.</div>
                      )}
                      <div className="import-map-overview__pages">
                        {filteredInterpretationPages.map((page) => (
                          <div key={page.page} className="import-map-page">
                            <div className="import-map-page__title">
                              Page {page.page} · {CLUSTER_LABELS[page.dominantCluster]}
                            </div>
                            <div className="import-map-page__blocks">
                              {page.blocks.map((block) => (
                                <article
                                  key={block.id}
                                  className={`import-map-block import-map-block--${block.cluster}${block.cluster === 'unclassified' || block.confidence < 0.75 ? ' import-map-block--needs-review' : ''}`}
                                >
                                  <div className="import-map-block__top">
                                    <span className="import-map-block__badge">{CLUSTER_LABELS[block.cluster]}</span>
                                    <span className="import-map-block__confidence">{block.confidence.toFixed(2)}</span>
                                  </div>
                                  <div className="import-map-block__label">{block.label}</div>
                                  <div className="import-map-block__excerpt">{block.excerpt}</div>
                                  <div className="import-map-block__signals">
                                    {block.signals.map((signal) => (
                                      <span key={`${block.id}-${signal}`}>{signal}</span>
                                    ))}
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="import-map-overview__preview">
                        <div className="import-map-preview-card">
                          <div className="import-map-preview-card__title">Likely overview/category nodes</div>
                          <ul>
                            {importInterpretation.overviewLabels.length > 0
                              ? importInterpretation.overviewLabels.map((label) => <li key={label}>{label}</li>)
                              : <li>None detected</li>}
                          </ul>
                        </div>
                        <div className="import-map-preview-card">
                          <div className="import-map-preview-card__title">Likely facts board items</div>
                          <ul>
                            {importInterpretation.factsBoardLabels.length > 0
                              ? importInterpretation.factsBoardLabels.map((label) => <li key={label}>{label}</li>)
                              : <li>None detected</li>}
                          </ul>
                        </div>
                        <div className="import-map-preview-card">
                          <div className="import-map-preview-card__title">Likely unclassified items</div>
                          <ul>
                            {importInterpretation.unclassifiedLabels.length > 0
                              ? importInterpretation.unclassifiedLabels.map((label) => <li key={label}>{label}</li>)
                              : <li>None detected</li>}
                          </ul>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {parsedFiles.length > 0 && (
                <div className="allocator__stats" style={{ marginBottom: 8 }}>
                  {parsedFiles.map((f) => (
                    <button
                      key={f.id}
                      className={`toolbar__toggle ${activeFileId === f.id ? 'toolbar__toggle--active' : ''}`}
                      onClick={() => setActiveFileId(f.id)}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
              <ParsedTreeReview
                steps={displayedSteps}
                onUpdate={(updated) => {
                  if (!activeFileId) {
                    setParsedSteps(updated);
                    return;
                  }
                  setParsedFiles((prev) => prev.map((f) => f.id === activeFileId ? { ...f, steps: updated } : f));
                  setParsedSteps(() => {
                    const others = parsedFiles
                      .filter((f) => f.id !== activeFileId)
                      .flatMap((f) => f.steps);
                    return [...others, ...updated];
                  });
                }}
              />
            </>
          )}

          {wizardStep === 'categories' && (
            <>
              <p className="modal__hint">
                Set category policy before allocation. AI pre-allocation will respect this setup and focus manual review on uncertain items.
              </p>
              <div className="cat-policy">
                <label className="modal__toggle-label">
                  <input
                    type="checkbox"
                    checked={alwaysIncludeFacts}
                    onChange={(e) => setAlwaysIncludeFacts(e.target.checked)}
                  />
                  <span>Always include "{FACTS_CATEGORY_NAME}"</span>
                </label>
                <label className="modal__toggle-label">
                  <input
                    type="checkbox"
                    checked={allowAiCategoryExpansion}
                    onChange={(e) => setAllowAiCategoryExpansion(e.target.checked)}
                  />
                  <span>Allow AI to suggest new categories (coming next)</span>
                </label>
              </div>
              <CategoryBuilder
                suggestedCategories={suggestedCategories}
                factsDetected={factCount > 0}
                includeFactsCategory={alwaysIncludeFacts}
                allowNewCategories={allowAiCategoryExpansion}
                onIncludeFactsChange={setAlwaysIncludeFacts}
                onAllowNewCategoriesChange={setAllowAiCategoryExpansion}
                onConfirm={handleCategoriesConfirm}
                onBack={() => setWizardStep('review')}
              />
            </>
          )}

          {wizardStep === 'allocate' && (
            <StepAllocator
              categories={categories}
              steps={displayedSteps}
              onConfirm={handleAllocateConfirm}
              onBack={() => setWizardStep('categories')}
            />
          )}
        </div>

        <div className="modal__footer">
          {wizardStep === 'paste' && (
            <>
              <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn--primary" onClick={handleParse} disabled={!text.trim() || loading}>
                {useAi && aiAvailable ? 'Smart Parse (AI) →' : 'Parse & Review →'}
              </button>
            </>
          )}
          {wizardStep === 'confirm-ai' && (
            <>
              <button className="btn btn--ghost" onClick={() => setWizardStep('paste')}>← Back</button>
              <button className="btn btn--secondary" onClick={handleBasicParse}>
                Use Basic Parse Instead
              </button>
              <button className="btn btn--primary" onClick={handleAiParse} disabled={loading}>
                {loading ? 'Processing...' : `Confirm — Send to Claude (${costEstimate?.cost})`}
              </button>
            </>
          )}
          {wizardStep === 'review' && (
            <>
              <button className="btn btn--ghost" onClick={() => setWizardStep('paste')}>← Back</button>
              <button className="btn btn--primary" onClick={handleCustomImport} disabled={parsedSteps.length === 0}>
                Continue to Customize Categories →
              </button>
              <button className="btn btn--secondary" onClick={handleImportFinal} disabled={parsedSteps.length === 0}>
                Quick Import
              </button>
            </>
          )}
          {/* categories and allocate steps have their own footers inline */}
        </div>
      </div>
    </div>
  );
}
