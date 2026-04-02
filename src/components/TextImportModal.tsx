import { useState, useCallback, useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { parseTextToSteps, stepsToProject, type ParsedStep } from '../utils/textParser';
import ParsedTreeReview from './ParsedTreeReview';

interface TextImportModalProps {
  onClose: () => void;
}

const PLACEHOLDER = `Paste your process or journey text here. The parser understands:

1. Discovery: Users find the product through various channels
  - [action] Website landing page visit
  - [decision] Does the product look relevant?
  - [action] Sign up for free trial
2. Onboarding: New user setup and first experience
  - [action] Create account
  - [action] Complete profile setup
  - [decision] Take the tutorial?
3. Active Usage: Regular engagement with the product
  - [action] Use core features daily
  - [decision] Upgrade to premium?

Supports: numbered lists, bullet points, [type] tags, PDF upload
• Headers (1. 2. 3. or ALL CAPS) become categories
• Everything else becomes steps within the current category`;

type WizardStep = 'paste' | 'review';

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString();

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
      if (lastY !== null && Math.abs(y - lastY) > 5) {
        lines.push('\n');
      }
      lines.push(textItem.str);
      lastY = y;
    }
    pages.push(lines.join(''));
  }

  return pages.join('\n\n');
}

export default function TextImportModal({ onClose }: TextImportModalProps) {
  const importProject = useAppStore((s) => s.importProject);

  const [wizardStep, setWizardStep] = useState<WizardStep>('paste');
  const [text, setText] = useState('');
  const [projectName, setProjectName] = useState('');
  const [parsedSteps, setParsedSteps] = useState<ParsedStep[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParse = useCallback(() => {
    if (!text.trim()) return;
    const steps = parseTextToSteps(text);
    setParsedSteps(steps);
    setWizardStep('review');
  }, [text]);

  const handleImportAsDraft = useCallback(() => {
    if (parsedSteps.length === 0) return;
    const project = stepsToProject(parsedSteps, projectName || 'Imported Journey', true);
    importProject(JSON.stringify(project));
    onClose();
  }, [parsedSteps, projectName, importProject, onClose]);

  const handleImportFinal = useCallback(() => {
    if (parsedSteps.length === 0) return;
    const project = stepsToProject(parsedSteps, projectName || 'Imported Journey', false);
    importProject(JSON.stringify(project));
    onClose();
  }, [parsedSteps, projectName, importProject, onClose]);

  const handleFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.name.toLowerCase().endsWith('.pdf')) {
      setLoading(true);
      try {
        const pdfText = await extractPdfText(file);
        setText(pdfText);
        if (!projectName) {
          setProjectName(file.name.replace(/\.pdf$/i, ''));
        }
      } catch (err) {
        console.error('PDF extraction failed:', err);
        setText('Error: Could not extract text from PDF. Try copy-pasting the content instead.');
      } finally {
        setLoading(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setText(ev.target?.result as string);
        if (!projectName) {
          setProjectName(file.name.replace(/\.\w+$/, ''));
        }
      };
      reader.readAsText(file);
    }
  }, [projectName]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">
            {wizardStep === 'paste' ? 'Step 1: Paste or Upload' : 'Step 2: Review & Edit Structure'}
          </h2>
          <div className="modal__steps">
            <span className={`modal__step-dot ${wizardStep === 'paste' ? 'modal__step-dot--active' : 'modal__step-dot--done'}`}>1</span>
            <span className="modal__step-line" />
            <span className={`modal__step-dot ${wizardStep === 'review' ? 'modal__step-dot--active' : ''}`}>2</span>
          </div>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="modal__body">
          {wizardStep === 'paste' && (
            <>
              <p className="modal__hint">
                Paste text, upload a .txt file, or upload a PDF document.
                The parser auto-detects categories, actions, decisions, and more.
              </p>
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
                    Upload file (.txt, .md, .pdf)
                  </button>
                </label>
                {loading && <p className="modal__loading">Extracting text from PDF...</p>}
                <textarea
                  className="modal__textarea"
                  placeholder={PLACEHOLDER}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={16}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.text,.pdf"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>
            </>
          )}

          {wizardStep === 'review' && (
            <>
              <p className="modal__hint">
                Review the detected structure below. Rename items, change their types, or remove misdetected entries.
                The overview map will show only the top-level phases — sub-steps live in drill-down sub-maps.
              </p>
              <ParsedTreeReview steps={parsedSteps} onUpdate={setParsedSteps} />
            </>
          )}
        </div>

        <div className="modal__footer">
          {wizardStep === 'paste' && (
            <>
              <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn--primary" onClick={handleParse} disabled={!text.trim() || loading}>
                Parse & Review →
              </button>
            </>
          )}
          {wizardStep === 'review' && (
            <>
              <button className="btn btn--ghost" onClick={() => setWizardStep('paste')}>← Back</button>
              <button className="btn btn--secondary" onClick={handleImportAsDraft} disabled={parsedSteps.length === 0}>
                Import as Draft
              </button>
              <button className="btn btn--primary" onClick={handleImportFinal} disabled={parsedSteps.length === 0}>
                Import & Finalize
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
