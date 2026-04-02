import { useState, useCallback, useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import PasswordSettings from './PasswordSettings';
import ApiKeySettings from './ApiKeySettings';
import TextImportModal from './TextImportModal';

export default function ProjectSidebar() {
  const projects = useAppStore((s) => s.projects);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  const createProject = useAppStore((s) => s.createProject);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const createSampleProject = useAppStore((s) => s.createSampleProject);
  const exportActiveProject = useAppStore((s) => s.exportActiveProject);
  const importProject = useAppStore((s) => s.importProject);
  const finalizeProject = useAppStore((s) => s.finalizeProject);
  const discardDraft = useAppStore((s) => s.discardDraft);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showTextImport, setShowTextImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createProject(newName.trim(), newDesc.trim());
    setNewName('');
    setNewDesc('');
    setShowNewForm(false);
  }, [newName, newDesc, createProject]);

  const handleExport = useCallback(() => {
    const json = exportActiveProject();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'processmap-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [exportActiveProject]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        importProject(text);
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [importProject],
  );

  return (
    <div className="sidebar">
      <div className="sidebar__header">
        <h2 className="sidebar__title">
          <span className="sidebar__logo">◈</span> ProcessMap
        </h2>
      </div>

      <div className="sidebar__section">
        <h3 className="sidebar__section-title">Projects</h3>
        <div className="sidebar__project-list">
          {projects.map((p) => (
            <div
              key={p.id}
              className={`sidebar__project ${p.id === activeProjectId ? 'sidebar__project--active' : ''}`}
              onClick={() => setActiveProject(p.id)}
            >
              <div className="sidebar__project-name">
                {p.name}
                {p.isDraft && <span className="sidebar__draft-badge">Draft</span>}
              </div>
              <div className="sidebar__project-desc">{p.description}</div>
              {p.isDraft && p.id === activeProjectId && (
                <div className="sidebar__draft-actions">
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={(e) => { e.stopPropagation(); finalizeProject(p.id); }}
                  >
                    Finalize
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
                    onClick={(e) => { e.stopPropagation(); if (confirm('Discard this draft?')) discardDraft(p.id); }}
                  >
                    Discard
                  </button>
                </div>
              )}
              <button
                className="sidebar__project-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${p.name}"?`)) deleteProject(p.id);
                }}
                title="Delete project"
              >
                ✕
              </button>
            </div>
          ))}
          {projects.length === 0 && (
            <p className="sidebar__empty">No projects yet.</p>
          )}
        </div>
      </div>

      <div className="sidebar__section">
        {showNewForm ? (
          <div className="sidebar__new-form">
            <input
              className="sidebar__input"
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <input
              className="sidebar__input"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div className="sidebar__form-actions">
              <button className="btn btn--primary btn--sm" onClick={handleCreate}>Create</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowNewForm(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="sidebar__actions">
            <button className="btn btn--primary btn--full" onClick={() => setShowNewForm(true)}>
              + New Project
            </button>
            <button className="btn btn--secondary btn--full" onClick={() => setShowTextImport(true)}>
              📝 Import from Text
            </button>
            <button className="btn btn--secondary btn--full" onClick={createSampleProject}>
              ★ Load Sample
            </button>
          </div>
        )}
      </div>

      <div className="sidebar__section">
        <ApiKeySettings />
      </div>

      <div className="sidebar__section">
        <PasswordSettings />
      </div>

      <div className="sidebar__section sidebar__section--bottom">
        <button className="btn btn--ghost btn--full" onClick={handleExport} disabled={!activeProjectId}>
          ↓ Export JSON
        </button>
        <button className="btn btn--ghost btn--full" onClick={handleImport}>
          ↑ Import JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {showTextImport && <TextImportModal onClose={() => setShowTextImport(false)} />}
    </div>
  );
}
