import { useState, useCallback, useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  parseTextToSteps,
  stepsToProject,
  allocatedToProject,
  type ParsedStep,
} from '../utils/textParser';
import { hasApiKey, smartParse, estimateCost, getManualPrompt } from '../utils/claudeApi';
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

type WizardStep = 'paste' | 'confirm-ai' | 'categories' | 'allocate' | 'review';

function normalizeCategoryKey(name: string): string {
  return name.trim().toLowerCase();
}

function createAllocationSeed(steps: ParsedStep[]): {
  suggestedCategories: string[];
  allocationSteps: ParsedStep[];
  preallocatedByCategory: Map<string, ParsedStep[]>;
} {
  const suggestedCategories: string[] = [];
  const allocationSteps: ParsedStep[] = [];
  const preallocatedByCategory = new Map<string, ParsedStep[]>();

  for (const step of steps) {
    const hasChildren = step.children.length > 0;

    if (hasChildren) {
      suggestedCategories.push(step.label);
      preallocatedByCategory.set(normalizeCategoryKey(step.label), [...step.children]);
      allocationSteps.push(...step.children);
      continue;
    }

    allocationSteps.push({ ...step, children: [] });
  }

  if (suggestedCategories.length === 0) {
    const fallback = steps.slice(0, Math.min(4, steps.length)).map((s) => s.label.trim()).filter(Boolean);
    suggestedCategories.push(...new Set(fallback.length > 0 ? fallback : ['Main Flow']));
  }

  return { suggestedCategories, allocationSteps, preallocatedByCategory };
}

function toAllocatedCategories(categories: Category[]): { name: string; steps: ParsedStep[] }[] {
  return categories.map((cat) => ({
    name: cat.name,
    steps: cat.steps,
  }));
}

export default function TextImportModal({ onClose }: TextImportModalProps) {
  const importProject = useAppStore((s) => s.importProject);

  const [wizardStep, setWizardStep] = useState<WizardStep>('paste');
  const [text, setText] = useState('');
  const [projectName, setProjectName] = useState('');
  const [parsedSteps, setParsedSteps] = useState<ParsedStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [wasAiParsed, setWasAiParsed] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [allocationCategories, setAllocationCategories] = useState<Category[]>([]);
  const [graveyardSteps, setGraveyardSteps] = useState<ParsedStep[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aiAvailable = hasApiKey();
  const costEstimate = text ? estimateCost(text) : null;

  const { suggestedCategories, allocationSteps, preallocatedByCategory } = createAllocationSeed(parsedSteps);
  const hasAllocation = allocationCategories.length > 0;
  const allocatedCount = allocationCategories.reduce((sum, cat) => sum + cat.steps.length, 0);
  const activeStepNumber =
    wizardStep === 'paste' || wizardStep === 'confirm-ai'
      ? 1
      : wizardStep === 'categories'
        ? 2
        : wizardStep === 'allocate'
          ? 3
          : 4;

  const handleBasicParse = useCallback(() => {
    if (!text.trim()) return;
    const steps = parseTextToSteps(text);
    setParsedSteps(steps);
    setWasAiParsed(false);
    setAllocationCategories([]);
    setGraveyardSteps([]);
    setWizardStep('categories');
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
      setWasAiParsed(true);
      setAllocationCategories([]);
      setGraveyardSteps([]);
      setWizardStep('categories');
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

  const handleImportAsDraft = useCallback(() => {
    if (parsedSteps.length === 0 && !hasAllocation) return;
    const project = hasAllocation
      ? allocatedToProject(
          toAllocatedCategories(allocationCategories),
          graveyardSteps,
          projectName || 'Imported Journey',
          true,
        )
      : stepsToProject(parsedSteps, projectName || 'Imported Journey', true, wasAiParsed);
    importProject(JSON.stringify(project));
    onClose();
  }, [parsedSteps, hasAllocation, allocationCategories, graveyardSteps, projectName, importProject, onClose, wasAiParsed]);

  const handleImportFinal = useCallback(() => {
    if (parsedSteps.length === 0 && !hasAllocation) return;
    const project = hasAllocation
      ? allocatedToProject(
          toAllocatedCategories(allocationCategories),
          graveyardSteps,
          projectName || 'Imported Journey',
          false,
        )
      : stepsToProject(parsedSteps, projectName || 'Imported Journey', false, wasAiParsed);
    importProject(JSON.stringify(project));
    onClose();
  }, [parsedSteps, hasAllocation, allocationCategories, graveyardSteps, projectName, importProject, onClose, wasAiParsed]);

  const handleCategoriesConfirm = useCallback((categories: Category[]) => {
    const merged = categories.map((cat) => ({
      ...cat,
      steps: [...(preallocatedByCategory.get(normalizeCategoryKey(cat.name)) ?? [])],
    }));
    setAllocationCategories(merged);
    setGraveyardSteps([]);
    setWizardStep('allocate');
  }, [preallocatedByCategory]);

  const handleAllocateConfirm = useCallback((categories: Category[], graveyard: ParsedStep[]) => {
    setAllocationCategories(categories);
    setGraveyardSteps(graveyard);
    setWizardStep('review');
  }, []);

  const handleFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const name = file.name.toLowerCase();

    setLoading(true);
    try {
      let fileText = '';
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
      } else if (name.endsWith('.docx')) {
        const { extractDocxText } = await import('../utils/exportImport');
        fileText = await extractDocxText(file);
      } else {
        fileText = await file.text();
      }
      setText(fileText);
      if (!projectName) setProjectName(file.name.replace(/\.\w+$/, ''));
    } catch (err) {
      console.error('File import failed:', err);
      setText('Error: Could not extract text from file.');
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(getManualPrompt()).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    });
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">
            {wizardStep === 'paste' && 'Step 1: Paste or Upload'}
            {wizardStep === 'confirm-ai' && 'Confirm AI Processing'}
            {wizardStep === 'categories' && 'Step 2: Define Categories'}
            {wizardStep === 'allocate' && 'Step 3: Allocate Steps'}
            {wizardStep === 'review' && 'Step 4: Review & Import'}
          </h2>
          <div className="modal__steps">
            <span className={`modal__step-dot ${activeStepNumber === 1 ? 'modal__step-dot--active' : activeStepNumber > 1 ? 'modal__step-dot--done' : ''}`}>1</span>
            <span className="modal__step-line" />
            <span className={`modal__step-dot ${activeStepNumber === 2 ? 'modal__step-dot--active' : activeStepNumber > 2 ? 'modal__step-dot--done' : ''}`}>2</span>
            <span className="modal__step-line" />
            <span className={`modal__step-dot ${activeStepNumber === 3 ? 'modal__step-dot--active' : activeStepNumber > 3 ? 'modal__step-dot--done' : ''}`}>3</span>
            <span className="modal__step-line" />
            <span className={`modal__step-dot ${activeStepNumber === 4 ? 'modal__step-dot--active' : ''}`}>4</span>
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
                    Upload file (.txt, .pdf, .docx)
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
                  onChange={(e) => { setText(e.target.value); setError(''); }}
                  rows={14}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.text,.pdf,.docx"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
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
                Review your import allocation before creating the project.
              </p>
              {hasAllocation ? (
                <div className="allocation-review">
                  <div className="tree-review__stats">
                    <span className="tree-review__stat">
                  {allocationCategories.filter((cat) => cat.steps.length > 0).length} categories
                    </span>
                    <span className="tree-review__stat">
                      {allocatedCount} allocated
                    </span>
                    <span className="tree-review__stat">{graveyardSteps.length} discarded</span>
                  </div>
                  <div className="allocation-review__list">
                    {allocationCategories.filter((cat) => cat.steps.length > 0).map((cat) => (
                      <div key={cat.id} className="allocation-review__item">
                        <span className="allocation-review__name">{cat.name}</span>
                        <span className="allocation-review__count">{cat.steps.length} steps</span>
                      </div>
                    ))}
                    {allocationCategories.every((cat) => cat.steps.length === 0) && (
                      <p className="tree-review__empty">No steps allocated. Go back and assign at least one step.</p>
                    )}
                  </div>
                </div>
              ) : (
                <ParsedTreeReview steps={parsedSteps} onUpdate={setParsedSteps} />
              )}
            </>
          )}

          {wizardStep === 'categories' && (
            <CategoryBuilder
              suggestedCategories={suggestedCategories}
              onConfirm={handleCategoriesConfirm}
              onBack={() => setWizardStep('paste')}
            />
          )}

          {wizardStep === 'allocate' && (
            <StepAllocator
              categories={allocationCategories}
              steps={allocationSteps}
              onConfirm={handleAllocateConfirm}
              onBack={() => setWizardStep('categories')}
            />
          )}
        </div>

        <div className={`modal__footer ${wizardStep === 'categories' || wizardStep === 'allocate' ? 'modal__footer--hidden' : ''}`}>
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
              <button className="btn btn--ghost" onClick={() => setWizardStep(hasAllocation ? 'allocate' : 'paste')}>← Back</button>
                      <button className="btn btn--secondary" onClick={handleImportAsDraft} disabled={hasAllocation ? allocatedCount === 0 : parsedSteps.length === 0}>
                Import as Draft
              </button>
                      <button className="btn btn--primary" onClick={handleImportFinal} disabled={hasAllocation ? allocatedCount === 0 : parsedSteps.length === 0}>
                Import & Finalize
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
