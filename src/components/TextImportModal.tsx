import { useState, useCallback, useMemo, useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { parseTextToSteps, stepsToProject, allocatedToProject, type ParsedStep } from '../utils/textParser';
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

type WizardStep = 'paste' | 'confirm-ai' | 'review' | 'categories' | 'allocate';

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
  const [categories, setCategories] = useState<Category[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aiAvailable = hasApiKey();
  const costEstimate = text ? estimateCost(text) : null;

  const suggestedCategories = useMemo(() => {
    return parsedSteps
      .filter((s) => s.nodeType === 'subprocess' || s.children.length > 0)
      .map((s) => s.label);
  }, [parsedSteps]);

  const flatSteps = useMemo(() => {
    const flat: ParsedStep[] = [];
    for (const step of parsedSteps) {
      if (step.children.length > 0) {
        flat.push(...step.children);
      } else {
        flat.push(step);
      }
    }
    return flat;
  }, [parsedSteps]);

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

  const handleImportAsDraft = useCallback(() => {
    if (parsedSteps.length === 0) return;
    const project = stepsToProject(parsedSteps, projectName || 'Imported Journey', true, wasAiParsed);
    importProject(JSON.stringify(project));
    onClose();
  }, [parsedSteps, projectName, importProject, onClose, wasAiParsed]);

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
    setCategories(cats);
    setWizardStep('allocate');
  }, []);

  const handleAllocateConfirm = useCallback(
    (cats: Category[], graveyard: ParsedStep[]) => {
      const allocatedCats = cats.map((c) => ({ name: c.name, steps: c.steps }));
      const project = allocatedToProject(allocatedCats, graveyard, projectName || 'Imported Journey', false);
      importProject(JSON.stringify(project));
      onClose();
    },
    [projectName, importProject, onClose],
  );

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
                Review the detected structure. Rename items, change types, or remove entries.
                You can import directly, or continue to manually define categories and allocate steps.
              </p>
              <ParsedTreeReview steps={parsedSteps} onUpdate={setParsedSteps} />
            </>
          )}

          {wizardStep === 'categories' && (
            <CategoryBuilder
              suggestedCategories={suggestedCategories}
              onConfirm={handleCategoriesConfirm}
              onBack={() => setWizardStep('review')}
            />
          )}

          {wizardStep === 'allocate' && (
            <StepAllocator
              categories={categories}
              steps={flatSteps}
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
              <button className="btn btn--secondary" onClick={handleImportAsDraft} disabled={parsedSteps.length === 0}>
                Import as Draft
              </button>
              <button className="btn btn--secondary" onClick={handleCustomImport} disabled={parsedSteps.length === 0}>
                Customize Categories →
              </button>
              <button className="btn btn--primary" onClick={handleImportFinal} disabled={parsedSteps.length === 0}>
                Import & Finalize
              </button>
            </>
          )}
          {/* categories and allocate steps have their own footers inline */}
        </div>
      </div>
    </div>
  );
}
