import { useState, useCallback, useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { parseTextToSteps, stepsToProject, type ParsedStep } from '../utils/textParser';
import ParsedTreeReview from './ParsedTreeReview';

interface TextImportModalProps {
  onClose: () => void;
}

const PLACEHOLDER = `Paste your process or journey text here. The parser understands:

1. Discovery: Users find the product through various channels
  - [touchpoint] Website landing page
  - [touchpoint] Social media presence
  - [emotion] Curious about the offering
  - [pain point] Hard to find clear information
2. Evaluation: Users compare and assess options
  - Review features and pricing
  - [action] Sign up for free trial
  - [decision] Does it meet my needs?
3. Onboarding: New user setup and first experience
  - [action] Create account
  - [action] Complete profile setup
  - [opportunity] Streamline with social login
4. Active Usage: Regular engagement with the product
  - [action] Use core features daily
  - [decision] Upgrade to premium?
  - [pain point] Feature limitations on free tier
5. Retention: Long-term loyalty and advocacy
  - [touchpoint] Email updates and newsletters
  - [action] Join referral program
  - [opportunity] Personalized recommendations

Supports:
• Numbered lists (1. 2. 3.) or bullet points (- • *)
• Indentation for sub-steps (2 spaces = 1 level)
• Type tags: [phase] [action] [touchpoint] [decision] [emotion] [pain point] [opportunity]
• Auto-detection from keywords (e.g. "?" → decision)
• "Label: description" or "Label - description" format`;

type Step = 'paste' | 'review';

export default function TextImportModal({ onClose }: TextImportModalProps) {
  const importProject = useAppStore((s) => s.importProject);

  const [wizardStep, setWizardStep] = useState<Step>('paste');
  const [text, setText] = useState('');
  const [projectName, setProjectName] = useState('');
  const [parsedSteps, setParsedSteps] = useState<ParsedStep[]>([]);
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

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setText(ev.target?.result as string);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">
            {wizardStep === 'paste' ? 'Step 1: Paste Your Text' : 'Step 2: Review & Edit Structure'}
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
                Paste your journey description, process steps, or upload a text file.
                The parser will auto-detect phases, actions, decisions, pain points, and more.
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
                  Journey Text
                  <button className="btn btn--ghost btn--sm" onClick={handleFileUpload} style={{ marginLeft: 8 }}>
                    Upload .txt file
                  </button>
                </label>
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
                  accept=".txt,.md,.text"
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
              <button className="btn btn--primary" onClick={handleParse} disabled={!text.trim()}>
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
