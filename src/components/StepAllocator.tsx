import { useState, useCallback } from 'react';
import type { ParsedStep } from '../utils/textParser';
import type { Category } from './CategoryBuilder';
import { hasApiKey, smartParse } from '../utils/claudeApi';
import { parseTextToSteps } from '../utils/textParser';

interface StepAllocatorProps {
  categories: Category[];
  steps: ParsedStep[];
  onConfirm: (categories: Category[], graveyard: ParsedStep[]) => void;
  onBack: () => void;
}

export default function StepAllocator({ categories: initialCats, steps, onConfirm, onBack }: StepAllocatorProps) {
  const [cats, setCats] = useState<Category[]>(initialCats);
  const [unallocated, setUnallocated] = useState<ParsedStep[]>(() => {
    const allocatedIds = new Set(initialCats.flatMap((c) => c.steps.map((s) => s.id)));
    return steps.filter((s) => !allocatedIds.has(s.id));
  });
  const [graveyard, setGraveyard] = useState<ParsedStep[]>([]);
  const [dragStep, setDragStep] = useState<ParsedStep | null>(null);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleDragStart = useCallback((step: ParsedStep) => {
    setDragStep(step);
  }, []);

  const handleDropOnCategory = useCallback((catId: string) => {
    if (!dragStep) return;
    setUnallocated((prev) => prev.filter((s) => s.id !== dragStep.id));
    setCats((prev) => prev.map((c) => {
      if (c.id === catId) return { ...c, steps: [...c.steps.filter((s) => s.id !== dragStep.id), dragStep] };
      return { ...c, steps: c.steps.filter((s) => s.id !== dragStep.id) };
    }));
    setGraveyard((prev) => prev.filter((s) => s.id !== dragStep.id));
    setDragStep(null);
    setDragOverCat(null);
  }, [dragStep]);

  const handleDropOnUnallocated = useCallback(() => {
    if (!dragStep) return;
    setCats((prev) => prev.map((c) => ({ ...c, steps: c.steps.filter((s) => s.id !== dragStep.id) })));
    setGraveyard((prev) => prev.filter((s) => s.id !== dragStep.id));
    setUnallocated((prev) => prev.some((s) => s.id === dragStep.id) ? prev : [...prev, dragStep]);
    setDragStep(null);
  }, [dragStep]);

  const handleDropOnGraveyard = useCallback(() => {
    if (!dragStep) return;
    setUnallocated((prev) => prev.filter((s) => s.id !== dragStep.id));
    setCats((prev) => prev.map((c) => ({ ...c, steps: c.steps.filter((s) => s.id !== dragStep.id) })));
    setGraveyard((prev) => prev.some((s) => s.id === dragStep.id) ? prev : [...prev, dragStep]);
    setDragStep(null);
  }, [dragStep]);

  const handleAutoAllocate = useCallback(async () => {
    if (!hasApiKey()) return;
    setAiLoading(true);
    try {
      const catNames = cats.map((c) => c.name).join(', ');
      const stepLabels = unallocated.map((s) => s.label).join('\n');
      const prompt = `Given these categories: ${catNames}\n\nAllocate each step to the best matching category. Output ONLY numbered lines matching the category names, with steps as sub-items:\n\n${stepLabels}\n\nOutput format:\n1. CategoryName\n- step label\n- step label\n2. CategoryName\n- step label`;
      const result = await smartParse(prompt);
      const parsed = parseTextToSteps(result);
      const newCats = [...cats];
      const remaining = [...unallocated];

      for (const parsedCat of parsed) {
        const matchingCat = newCats.find((c) => c.name.toLowerCase().includes(parsedCat.label.toLowerCase()) || parsedCat.label.toLowerCase().includes(c.name.toLowerCase()));
        if (!matchingCat) continue;
        for (const child of parsedCat.children) {
          const matchStep = remaining.find((s) => s.label.toLowerCase().includes(child.label.toLowerCase()) || child.label.toLowerCase().includes(s.label.toLowerCase()));
          if (matchStep) {
            matchingCat.steps.push(matchStep);
            remaining.splice(remaining.indexOf(matchStep), 1);
          }
        }
      }

      setCats(newCats);
      setUnallocated(remaining);
    } catch (err) {
      console.error('Auto-allocate failed:', err);
    } finally {
      setAiLoading(false);
    }
  }, [cats, unallocated]);

  const totalAllocated = cats.reduce((sum, c) => sum + c.steps.length, 0);

  return (
    <div className="allocator">
      <p className="modal__hint">
        Drag steps from the left into categories on the right. Order within a category sets the flow sequence.
      </p>
      <div className="allocator__stats">
        <span className="tree-review__stat">{unallocated.length} unallocated</span>
        <span className="tree-review__stat">{totalAllocated} allocated</span>
        <span className="tree-review__stat">{graveyard.length} discarded</span>
        {hasApiKey() && (
          <button className="btn btn--secondary btn--sm" onClick={handleAutoAllocate} disabled={aiLoading || unallocated.length === 0}>
            {aiLoading ? 'Allocating...' : 'AI Auto-allocate'}
          </button>
        )}
      </div>
      <div className="allocator__columns">
        <div
          className="allocator__left"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOnUnallocated}
        >
          <h4 className="allocator__col-title">Unallocated Steps ({unallocated.length})</h4>
          <div className="allocator__step-list">
            {unallocated.map((step) => (
              <div
                key={step.id}
                className="allocator__step"
                draggable
                onDragStart={() => handleDragStart(step)}
              >
                <span className="allocator__step-label">{step.label}</span>
                <span className="allocator__step-type">{step.nodeType}</span>
              </div>
            ))}
            {unallocated.length === 0 && <p className="allocator__empty">All steps allocated!</p>}
          </div>
          <div
            className="allocator__graveyard"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOnGraveyard}
          >
            <h4 className="allocator__col-title">Discard ({graveyard.length})</h4>
            {graveyard.length > 0 && (
              <div className="allocator__step-list allocator__step-list--small">
                {graveyard.map((step) => (
                  <div key={step.id} className="allocator__step allocator__step--grey" draggable onDragStart={() => handleDragStart(step)}>
                    <span className="allocator__step-label">{step.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="allocator__right">
          <h4 className="allocator__col-title">Categories</h4>
          {cats.map((cat, ci) => (
            <div
              key={cat.id}
              className={`allocator__category ${dragOverCat === cat.id ? 'allocator__category--dragover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCat(cat.id); }}
              onDragLeave={() => setDragOverCat(null)}
              onDrop={() => handleDropOnCategory(cat.id)}
            >
              <div className="allocator__cat-header">
                <span className="allocator__cat-num">{ci + 1}</span>
                <span className="allocator__cat-name">{cat.name}</span>
                <span className="allocator__cat-count">{cat.steps.length}</span>
              </div>
              <div className="allocator__cat-steps">
                {cat.steps.map((step, si) => (
                  <div key={step.id} className="allocator__step allocator__step--allocated" draggable onDragStart={() => handleDragStart(step)}>
                    <span className="allocator__step-num">{ci + 1}.{si + 1}</span>
                    <span className="allocator__step-label">{step.label}</span>
                  </div>
                ))}
                {cat.steps.length === 0 && <p className="allocator__drop-hint">Drop steps here</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="modal__footer" style={{ borderTop: 'none', padding: '12px 0 0' }}>
        <button className="btn btn--ghost" onClick={onBack}>← Back</button>
        <button className="btn btn--primary" onClick={() => onConfirm(cats, graveyard)} disabled={totalAllocated === 0}>
          Import ({totalAllocated} steps in {cats.filter((c) => c.steps.length > 0).length} categories) →
        </button>
      </div>
    </div>
  );
}
