import { useState, useCallback, useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { parseTextToProject } from '../utils/textParser';

interface TextImportModalProps {
  onClose: () => void;
}

const PLACEHOLDER = `Paste your user journey text here. The parser understands:

1. Awareness: User discovers the product
  - Sees ad on social media
  - [emotion] Curious about the product
  - [pain point] Too many ads, feels spammy
2. Consideration: User evaluates options
  - Compare pricing plans
  - Read reviews
  - [decision] Should I sign up?
3. Registration: User creates account
  - Fill in personal details
  - Email verification
  - [opportunity] Add social login
4. Onboarding: First-time experience
  - Welcome tutorial
  - Setup preferences

Supports:
• Numbered lists (1. 2. 3.) or bullet points (- • *)
• Indentation for sub-steps (2 spaces = 1 level)
• Type tags: [phase] [action] [touchpoint] [decision] [emotion] [pain point] [opportunity]
• Auto-detection from keywords (e.g. "?" → decision)
• "Label: description" or "Label - description" format`;

export default function TextImportModal({ onClose }: TextImportModalProps) {
  const importProject = useAppStore((s) => s.importProject);
  const [text, setText] = useState('');
  const [projectName, setProjectName] = useState('');
  const [preview, setPreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePreview = useCallback(() => {
    if (!text.trim()) return;
    const project = parseTextToProject(text, projectName || 'Imported Journey');
    const mapCount = Object.keys(project.maps).length;
    const rootMap = project.maps[project.rootMapId];
    const nodeCount = rootMap ? rootMap.nodes.length : 0;
    const totalNodes = Object.values(project.maps).reduce((sum, m) => sum + m.nodes.length, 0);
    setPreview(
      `Will create: ${mapCount} map(s), ${nodeCount} top-level nodes, ${totalNodes} total nodes`,
    );
  }, [text, projectName]);

  const handleImport = useCallback(() => {
    if (!text.trim()) return;
    const project = parseTextToProject(text, projectName || 'Imported Journey');
    importProject(JSON.stringify(project));
    onClose();
  }, [text, projectName, importProject, onClose]);

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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">Import from Text</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          <p className="modal__hint">
            Paste your user journey description, process steps, or any structured text.
            The parser will auto-detect phases, actions, decisions, pain points, and more.
          </p>
          <div className="modal__field">
            <label className="modal__label">Project Name</label>
            <input
              className="modal__input"
              placeholder="e.g. SquadForce iGaming Journey"
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
              onChange={(e) => { setText(e.target.value); setPreview(''); }}
              rows={14}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.text"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
          {preview && <p className="modal__preview">{preview}</p>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={handlePreview} disabled={!text.trim()}>
            Preview
          </button>
          <button className="btn btn--primary" onClick={handleImport} disabled={!text.trim()}>
            Import & Create Project
          </button>
        </div>
      </div>
    </div>
  );
}
