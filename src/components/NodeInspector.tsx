import { useState, useCallback, type ChangeEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { JourneyNodeData } from '../types';
import { NODE_TYPE_CONFIG } from '../types';
import CrossRefText from './CrossRefText';

export default function NodeInspector() {
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const activeMap = useAppStore((s) => s.getActiveMap());
  const updateNodeData = useAppStore((s) => s.updateNodeData);
  const deleteNode = useAppStore((s) => s.deleteNode);
  const convertToSubprocess = useAppStore((s) => s.convertToSubprocess);
  const navigateToMap = useAppStore((s) => s.navigateToMap);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);

  const node = activeMap?.nodes.find((n) => n.id === selectedNodeId);
  const nodeData = node?.data as JourneyNodeData | undefined;

  const [editLabel, setEditLabel] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const startEdit = useCallback(() => {
    if (!nodeData) return;
    setEditLabel(nodeData.label);
    setEditDesc(nodeData.description);
    setIsEditing(true);
  }, [nodeData]);

  const saveEdit = useCallback(() => {
    if (!selectedNodeId) return;
    updateNodeData(selectedNodeId, { label: editLabel, description: editDesc });
    setIsEditing(false);
  }, [selectedNodeId, editLabel, editDesc, updateNodeData]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  if (!node || !nodeData) {
    return (
      <div className="inspector">
        <div className="inspector__empty">
          <p>Select a node to inspect its properties.</p>
        </div>
      </div>
    );
  }

  const config = NODE_TYPE_CONFIG[nodeData.nodeType];

  return (
    <div className="inspector">
      <div className="inspector__header" style={{ background: nodeData.color || config.color }}>
        <span>{config.icon} {config.label}</span>
        <button className="inspector__close" onClick={() => setSelectedNode(null)}>✕</button>
      </div>
      <div className="inspector__body">
        {isEditing ? (
          <>
            <label className="inspector__label">Label</label>
            <input
              className="inspector__input"
              value={editLabel}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEditLabel(e.target.value)}
            />
            <label className="inspector__label">Description</label>
            <textarea
              className="inspector__textarea"
              value={editDesc}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEditDesc(e.target.value)}
              rows={3}
            />
            <div className="inspector__actions">
              <button className="btn btn--primary" onClick={saveEdit}>Save</button>
              <button className="btn btn--ghost" onClick={cancelEdit}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="inspector__title">{nodeData.label}</h3>
            <p className="inspector__desc">{nodeData.description ? <CrossRefText text={nodeData.description} /> : 'No description'}</p>
            <div className="inspector__actions">
              <button className="btn btn--primary" onClick={startEdit}>Edit</button>
              {nodeData.nodeType === 'subprocess' && nodeData.subMapId && (
                <button className="btn btn--secondary" onClick={() => navigateToMap(nodeData.subMapId!)}>
                  Open Sub-map →
                </button>
              )}
              {nodeData.nodeType !== 'subprocess' && (
                <button className="btn btn--secondary" onClick={() => convertToSubprocess(selectedNodeId!)}>
                  → Sub-process
                </button>
              )}
              <button className="btn btn--danger" onClick={() => deleteNode(selectedNodeId!)}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
