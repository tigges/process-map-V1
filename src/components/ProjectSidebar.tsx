import { useState, useCallback, useRef, type ChangeEvent, type DragEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import PasswordSettings from './PasswordSettings';
import ApiKeySettings from './ApiKeySettings';
import TextImportModal from './TextImportModal';

export default function ProjectSidebar() {
  const projects = useAppStore((s) => s.projects);
  const folders = useAppStore((s) => s.folders);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  const createProject = useAppStore((s) => s.createProject);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const createSampleProject = useAppStore((s) => s.createSampleProject);
  const exportActiveProject = useAppStore((s) => s.exportActiveProject);
  const importProject = useAppStore((s) => s.importProject);
  const finalizeProject = useAppStore((s) => s.finalizeProject);
  const discardDraft = useAppStore((s) => s.discardDraft);
  const createFolder = useAppStore((s) => s.createFolder);
  const deleteFolder = useAppStore((s) => s.deleteFolder);
  const moveProjectToFolder = useAppStore((s) => s.moveProjectToFolder);
  const persist = useAppStore((s) => s.persist);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showTextImport, setShowTextImport] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [dragProjectId, setDragProjectId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedProjects = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const filteredProjects = search.trim()
    ? sortedProjects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : sortedProjects;

  const unfolderedProjects = filteredProjects.filter((p) => !p.folderId);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  }, []);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createProject(newName.trim(), newDesc.trim());
    setNewName('');
    setNewDesc('');
    setShowNewForm(false);
  }, [newName, newDesc, createProject]);

  const handleCreateFolder = useCallback(() => {
    if (!newFolderName.trim()) return;
    createFolder(newFolderName.trim());
    setNewFolderName('');
    setShowNewFolder(false);
  }, [newFolderName, createFolder]);

  const handleRename = useCallback((projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    setRenamingId(projectId);
    setRenameValue(project.name);
  }, [projects]);

  const handleSaveRename = useCallback(() => {
    if (!renamingId || !renameValue.trim()) return;
    const updated = projects.map((p) =>
      p.id === renamingId ? { ...p, name: renameValue.trim(), updatedAt: new Date().toISOString() } : p,
    );
    useAppStore.setState({ projects: updated });
    persist();
    setRenamingId(null);
  }, [renamingId, renameValue, projects, persist]);

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
      reader.onload = (ev) => importProject(ev.target?.result as string);
      reader.readAsText(file);
      e.target.value = '';
    },
    [importProject],
  );

  const handleDragStart = useCallback((e: DragEvent, projectId: string) => {
    setDragProjectId(projectId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDropOnFolder = useCallback((e: DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragProjectId) {
      moveProjectToFolder(dragProjectId, folderId);
      setDragProjectId(null);
      setDragOverFolderId(null);
      setExpandedFolders((prev) => new Set([...prev, folderId]));
    }
  }, [dragProjectId, moveProjectToFolder]);

  const handleDropOnRoot = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (dragProjectId) {
      moveProjectToFolder(dragProjectId, undefined);
      setDragProjectId(null);
      setDragOverFolderId(null);
    }
  }, [dragProjectId, moveProjectToFolder]);

  const renderProject = (p: typeof projects[0]) => (
    <div
      key={p.id}
      className={`sidebar__project ${p.id === activeProjectId ? 'sidebar__project--active' : ''}`}
      onClick={() => setActiveProject(p.id)}
      draggable
      onDragStart={(e) => handleDragStart(e, p.id)}
    >
      {renamingId === p.id ? (
        <input
          className="sidebar__rename-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleSaveRename}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(); if (e.key === 'Escape') setRenamingId(null); }}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="sidebar__project-name" onDoubleClick={(e) => { e.stopPropagation(); handleRename(p.id); }}>
          {p.name}
          {p.isDraft && <span className="sidebar__draft-badge">Draft</span>}
        </div>
      )}
      <div className="sidebar__project-desc">{p.description}</div>
      {p.isDraft && p.id === activeProjectId && (
        <div className="sidebar__draft-actions">
          <button className="btn btn--primary btn--sm" onClick={(e) => { e.stopPropagation(); finalizeProject(p.id); }}>Finalize</button>
          <button className="btn btn--danger btn--sm" onClick={(e) => { e.stopPropagation(); if (confirm('Discard?')) discardDraft(p.id); }}>Discard</button>
        </div>
      )}
      <button className="sidebar__project-delete" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${p.name}"?`)) deleteProject(p.id); }} title="Delete">✕</button>
    </div>
  );

  return (
    <div className="sidebar">
      <div className="sidebar__header">
        <h2 className="sidebar__title">
          <span className="sidebar__logo">◈</span> ProcessMap
        </h2>
        <input
          className="sidebar__search"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="sidebar__section" onDragOver={(e) => e.preventDefault()} onDrop={handleDropOnRoot}>
        <h3 className="sidebar__section-title">Projects</h3>

        {folders.map((folder) => {
          const folderProjects = filteredProjects.filter((p) => p.folderId === folder.id);
          const isExpanded = expandedFolders.has(folder.id);
          const isDragOver = dragOverFolderId === folder.id;
          return (
            <div
              key={folder.id}
              className={`sidebar__folder ${isDragOver ? 'sidebar__folder--dragover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverFolderId(folder.id); }}
              onDragLeave={() => setDragOverFolderId(null)}
              onDrop={(e) => handleDropOnFolder(e, folder.id)}
            >
              <div className="sidebar__folder-header" onClick={() => toggleFolder(folder.id)}>
                <span className="sidebar__folder-icon">{isExpanded ? '▾' : '▸'}</span>
                <span className="sidebar__folder-name">{folder.name}</span>
                <span className="sidebar__folder-count">{folderProjects.length}</span>
                <button className="sidebar__folder-delete" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete folder "${folder.name}"?`)) deleteFolder(folder.id); }}>✕</button>
              </div>
              {isExpanded && (
                <div className="sidebar__folder-content">
                  {folderProjects.map(renderProject)}
                  {folderProjects.length === 0 && <p className="sidebar__folder-empty">Drop projects here</p>}
                </div>
              )}
            </div>
          );
        })}

        <div className="sidebar__project-list">
          {unfolderedProjects.map(renderProject)}
          {unfolderedProjects.length === 0 && folders.length === 0 && (
            <p className="sidebar__empty">No projects yet.</p>
          )}
        </div>
      </div>

      <div className="sidebar__section">
        {showNewForm ? (
          <div className="sidebar__new-form">
            <input className="sidebar__input" placeholder="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <input className="sidebar__input" placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <div className="sidebar__form-actions">
              <button className="btn btn--primary btn--sm" onClick={handleCreate}>Create</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowNewForm(false)}>Cancel</button>
            </div>
          </div>
        ) : showNewFolder ? (
          <div className="sidebar__new-form">
            <input className="sidebar__input" placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} autoFocus />
            <div className="sidebar__form-actions">
              <button className="btn btn--primary btn--sm" onClick={handleCreateFolder}>Create Folder</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowNewFolder(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="sidebar__actions">
            <button className="btn btn--primary btn--full" onClick={() => setShowNewForm(true)}>+ New Project</button>
            <button className="btn btn--secondary btn--full" onClick={() => setShowNewFolder(true)}>+ New Folder</button>
            <button className="btn btn--secondary btn--full" onClick={() => setShowTextImport(true)}>Import from Text</button>
            <button className="btn btn--secondary btn--full" onClick={createSampleProject}>Load Sample</button>
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
        <button className="btn btn--ghost btn--full" onClick={handleExport} disabled={!activeProjectId}>Export JSON</button>
        <button className="btn btn--ghost btn--full" onClick={handleImport}>Import JSON</button>
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {showTextImport && <TextImportModal onClose={() => setShowTextImport(false)} />}
    </div>
  );
}
