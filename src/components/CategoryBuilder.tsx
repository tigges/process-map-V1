import { useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import type { ParsedStep } from '../utils/textParser';

export interface Category {
  id: string;
  name: string;
  description: string;
  steps: ParsedStep[];
}

interface CategoryBuilderProps {
  suggestedCategories: string[];
  onConfirm: (categories: Category[]) => void;
  onBack: () => void;
}

export default function CategoryBuilder({ suggestedCategories, onConfirm, onBack }: CategoryBuilderProps) {
  const [categories, setCategories] = useState<Category[]>(
    suggestedCategories.map((name) => ({ id: nanoid(), name, description: '', steps: [] })),
  );
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = useCallback(() => {
    if (!newName.trim()) return;
    setCategories((prev) => [...prev, { id: nanoid(), name: newName.trim(), description: '', steps: [] }]);
    setNewName('');
  }, [newName]);

  const handleDelete = useCallback((id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleStartEdit = useCallback((cat: Category) => {
    setEditingId(cat.id);
    setEditValue(cat.name);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editValue.trim()) return;
    setCategories((prev) => prev.map((c) => c.id === editingId ? { ...c, name: editValue.trim() } : c));
    setEditingId(null);
  }, [editingId, editValue]);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setCategories((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setCategories((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  return (
    <div className="cat-builder">
      <p className="modal__hint">
        Define the top-level categories for your process map. These become the overview nodes.
        Reorder them to set chapter numbering (1, 2, 3...).
      </p>
      <div className="cat-builder__list">
        {categories.map((cat, i) => (
          <div key={cat.id} className="cat-builder__item">
            <span className="cat-builder__num">{i + 1}</span>
            {editingId === cat.id ? (
              <input
                className="cat-builder__edit"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                autoFocus
              />
            ) : (
              <span className="cat-builder__name" onClick={() => handleStartEdit(cat)}>
                {cat.name}
              </span>
            )}
            <div className="cat-builder__actions">
              <button className="cat-builder__btn" onClick={() => handleMoveUp(i)} disabled={i === 0} title="Move up">↑</button>
              <button className="cat-builder__btn" onClick={() => handleMoveDown(i)} disabled={i === categories.length - 1} title="Move down">↓</button>
              <button className="cat-builder__btn cat-builder__btn--delete" onClick={() => handleDelete(cat.id)} title="Remove">✕</button>
            </div>
          </div>
        ))}
      </div>
      <div className="cat-builder__add">
        <input
          className="cat-builder__add-input"
          placeholder="New category name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn btn--secondary btn--sm" onClick={handleAdd} disabled={!newName.trim()}>Add</button>
      </div>
      <div className="modal__footer" style={{ borderTop: 'none', padding: '12px 0 0' }}>
        <button className="btn btn--ghost" onClick={onBack}>← Back</button>
        <button className="btn btn--primary" onClick={() => onConfirm(categories)} disabled={categories.length === 0}>
          Allocate Steps ({categories.length} categories) →
        </button>
      </div>
    </div>
  );
}
