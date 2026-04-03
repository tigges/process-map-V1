import { useState, useCallback, useMemo } from 'react';
import type { ParsedStep } from '../utils/textParser';
import type { Category } from './CategoryBuilder';
import { hasApiKey, smartAllocateSteps } from '../utils/claudeApi';

interface StepAllocatorProps {
  categories: Category[];
  steps: ParsedStep[];
  onConfirm: (categories: Category[], graveyard: ParsedStep[], unallocated: ParsedStep[]) => void;
  onBack: () => void;
}

interface ReviewItem {
  step: ParsedStep;
  targetCategoryId: string;
  confidence: number;
  reason: string;
  level: 'parent' | 'leaf';
}

const HIGH_CONFIDENCE = 0.8;
const REVIEW_CONFIDENCE = 0.5;
const PARENT_HIGH_CONFIDENCE = 0.75;
const PARENT_REVIEW_CONFIDENCE = 0.5;

interface StepAllocationPartition {
  parents: ParsedStep[];
  leaves: ParsedStep[];
  parentByChildId: Map<string, string>;
}

function partitionStepsForAllocation(steps: ParsedStep[]): StepAllocationPartition {
  const parents: ParsedStep[] = [];
  const leaves: ParsedStep[] = [];
  const parentByChildId = new Map<string, string>();

  const visit = (nodes: ParsedStep[], parentId?: string) => {
    for (const node of nodes) {
      if (parentId) {
        parentByChildId.set(node.id, parentId);
      }

      const isParent = node.children.length > 0 || node.nodeType === 'subprocess';
      if (isParent) {
        parents.push(node);
      }

      if (node.children.length > 0) {
        visit(node.children, node.id);
      } else if (node.nodeType !== 'subprocess') {
        leaves.push(node);
      }
    }
  };

  visit(steps);
  return { parents, leaves, parentByChildId };
}

export default function StepAllocator({ categories: initialCats, steps, onConfirm, onBack }: StepAllocatorProps) {
  const [cats, setCats] = useState<Category[]>(initialCats.map((c) => ({ ...c, steps: [...c.steps] })));
  const factsCategoryId = initialCats.find((c) => c.kind === 'facts')?.id ?? null;

  const [graveyard, setGraveyard] = useState<ParsedStep[]>([]);
  const [dragStep, setDragStep] = useState<ParsedStep | null>(null);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [parentReviewQueue, setParentReviewQueue] = useState<ReviewItem[]>([]);
  const [leafReviewQueue, setLeafReviewQueue] = useState<ReviewItem[]>([]);
  const [autoAccepted, setAutoAccepted] = useState<ParsedStep[]>([]);

  const split = useMemo(() => partitionStepsForAllocation(steps), [steps]);
  const allocatableSteps = useMemo(() => {
    const byId = new Map<string, ParsedStep>();
    for (const step of split.parents) {
      byId.set(step.id, step);
    }
    for (const step of split.leaves) {
      byId.set(step.id, step);
    }
    return Array.from(byId.values());
  }, [split.leaves, split.parents]);

  const [unallocated, setUnallocated] = useState<ParsedStep[]>(() => {
    const allocatedIds = new Set(initialCats.flatMap((c) => c.steps.map((s) => s.id)));
    return allocatableSteps.filter((s) => !allocatedIds.has(s.id));
  });

  const allCategoryIds = useMemo(() => new Set(cats.map((c) => c.id)), [cats]);

  const removeStepFromAllBuckets = useCallback((stepId: string) => {
    setCats((prev) => prev.map((c) => ({ ...c, steps: c.steps.filter((s) => s.id !== stepId) })));
    setUnallocated((prev) => prev.filter((s) => s.id !== stepId));
    setGraveyard((prev) => prev.filter((s) => s.id !== stepId));
    setParentReviewQueue((prev) => prev.filter((r) => r.step.id !== stepId));
    setLeafReviewQueue((prev) => prev.filter((r) => r.step.id !== stepId));
    setAutoAccepted((prev) => prev.filter((s) => s.id !== stepId));
  }, []);

  const placeStepInCategory = useCallback((step: ParsedStep, catId: string) => {
    removeStepFromAllBuckets(step.id);
    setCats((prev) => prev.map((c) => (
      c.id === catId ? { ...c, steps: [...c.steps, step] } : c
    )));
  }, [removeStepFromAllBuckets]);

  const handleDragStart = useCallback((step: ParsedStep) => {
    setDragStep(step);
  }, []);

  const handleDropOnCategory = useCallback((catId: string) => {
    if (!dragStep) return;
    placeStepInCategory(dragStep, catId);
    setDragStep(null);
    setDragOverCat(null);
  }, [dragStep, placeStepInCategory]);

  const handleDropOnUnallocated = useCallback(() => {
    if (!dragStep) return;
    removeStepFromAllBuckets(dragStep.id);
    setUnallocated((prev) => [...prev, dragStep]);
    setDragStep(null);
  }, [dragStep, removeStepFromAllBuckets]);

  const handleDropOnGraveyard = useCallback(() => {
    if (!dragStep) return;
    removeStepFromAllBuckets(dragStep.id);
    setGraveyard((prev) => [...prev, dragStep]);
    setDragStep(null);
  }, [dragStep, removeStepFromAllBuckets]);

  const getTargetCategory = useCallback((itemCategory: string) => {
    const byCategoryName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
    const direct = byCategoryName.get(itemCategory.toLowerCase());
    const fallback = cats.find((c) => (
      c.name.toLowerCase().includes(itemCategory.toLowerCase()) ||
      itemCategory.toLowerCase().includes(c.name.toLowerCase())
    ));
    return direct ?? fallback;
  }, [cats]);

  const resolveReviewQueueItem = useCallback((stepId: string) => {
    const parentItem = parentReviewQueue.find((r) => r.step.id === stepId);
    if (parentItem) return parentItem;
    return leafReviewQueue.find((r) => r.step.id === stepId) ?? null;
  }, [parentReviewQueue, leafReviewQueue]);

  const handleAutoAllocate = useCallback(async () => {
    if (!hasApiKey() || unallocated.length === 0) return;
    setAiLoading(true);
    try {
      const unresolved = [...unallocated];
      const accepted: ParsedStep[] = [];
      const nextParentReview: ReviewItem[] = [];
      const nextLeafReview: ReviewItem[] = [];
      const parentAssignedCategory = new Map<string, string>();

      // Pass A: parent/subprocess containers.
      const parentPool = split.parents.filter((p) => unresolved.some((u) => u.id === p.id));
      if (parentPool.length > 0) {
        const parentAlloc = await smartAllocateSteps(
          cats.map((c) => c.name),
          parentPool.map((s) => ({ id: s.id, label: s.label, description: s.description })),
        );
        for (const item of parentAlloc) {
          const step = parentPool.find((p) => p.id === item.id);
          if (!step) continue;
          const target = getTargetCategory(item.category);
          if (!target) continue;
          if (item.confidence >= PARENT_HIGH_CONFIDENCE) {
            placeStepInCategory(step, target.id);
            accepted.push(step);
            parentAssignedCategory.set(step.id, target.id);
            continue;
          }
          if (item.confidence >= PARENT_REVIEW_CONFIDENCE) {
            nextParentReview.push({
              step,
              targetCategoryId: target.id,
              confidence: item.confidence,
              reason: item.reason || 'Parent allocation needs review',
              level: 'parent',
            });
            parentAssignedCategory.set(step.id, target.id);
          }
        }
      }

      // Pass B: leaf steps.
      const leafPool = split.leaves.filter((s) => unresolved.some((u) => u.id === s.id));
      if (leafPool.length > 0) {
        const leafAlloc = await smartAllocateSteps(
          cats.map((c) => c.name),
          leafPool.map((s) => ({ id: s.id, label: s.label, description: s.description })),
        );
        for (const item of leafAlloc) {
          const step = leafPool.find((p) => p.id === item.id);
          if (!step) continue;
          const target = getTargetCategory(item.category);
          const inheritedCategory = step.indent > 0
            ? (split.parents.find((p) => p.children.some((c) => c.id === step.id))?.id ?? null)
            : null;
          const inheritedTargetId = inheritedCategory ? parentAssignedCategory.get(inheritedCategory) : undefined;

          if (target && item.confidence >= HIGH_CONFIDENCE) {
            placeStepInCategory(step, target.id);
            accepted.push(step);
            continue;
          }
          if (target && item.confidence >= REVIEW_CONFIDENCE) {
            nextLeafReview.push({
              step,
              targetCategoryId: target.id,
              confidence: item.confidence,
              reason: item.reason || 'Low confidence allocation',
              level: 'leaf',
            });
            continue;
          }
          if (inheritedTargetId) {
            placeStepInCategory(step, inheritedTargetId);
            accepted.push(step);
            continue;
          }
        }
      }

      const assignedIds = new Set([
        ...accepted.map((s) => s.id),
        ...nextParentReview.map((r) => r.step.id),
        ...nextLeafReview.map((r) => r.step.id),
      ]);
      const combinedUnallocated = unresolved.filter((s) => !assignedIds.has(s.id));

      setAutoAccepted(accepted);
      setParentReviewQueue(nextParentReview);
      setLeafReviewQueue(nextLeafReview);
      setUnallocated(combinedUnallocated);
    } catch (err) {
      console.error('Auto-allocate failed:', err);
    } finally {
      setAiLoading(false);
    }
  }, [cats, getTargetCategory, placeStepInCategory, split.leaves, split.parents, unallocated]);

  const resolveReviewItem = useCallback((stepId: string, targetCategoryId: string) => {
    const item = resolveReviewQueueItem(stepId);
    if (!item) return;
    if (!allCategoryIds.has(targetCategoryId)) return;
    placeStepInCategory(item.step, targetCategoryId);
    setParentReviewQueue((prev) => prev.filter((r) => r.step.id !== stepId));
    setLeafReviewQueue((prev) => prev.filter((r) => r.step.id !== stepId));
  }, [allCategoryIds, placeStepInCategory, resolveReviewQueueItem]);

  const sendReviewToUnallocated = useCallback((stepId: string) => {
    const item = resolveReviewQueueItem(stepId);
    if (!item) return;
    removeStepFromAllBuckets(stepId);
    setUnallocated((prev) => [...prev, item.step]);
  }, [removeStepFromAllBuckets, resolveReviewQueueItem]);

  const totalAllocated = cats.reduce((sum, c) => sum + c.steps.length, 0);
  const factAllocated = factsCategoryId
    ? (cats.find((c) => c.id === factsCategoryId)?.steps.length ?? 0)
    : 0;
  const totalReview = parentReviewQueue.length + leafReviewQueue.length;

  return (
    <div className="allocator">
      <p className="modal__hint">
        AI first allocates subprocess containers, then leaf steps. You review only uncertain items.
      </p>
      <div className="allocator__stats">
        <span className="tree-review__stat">{unallocated.length} unallocated</span>
        <span className="tree-review__stat">{parentReviewQueue.length} parent review</span>
        <span className="tree-review__stat">{leafReviewQueue.length} step review</span>
        <span className="tree-review__stat">{autoAccepted.length} auto-accepted</span>
        <span className="tree-review__stat">{totalAllocated} allocated</span>
        <span className="tree-review__stat">{factAllocated} facts allocated</span>
        <span className="tree-review__stat">{graveyard.length} discarded</span>
        {hasApiKey() && (
          <button className="btn btn--secondary btn--sm" onClick={handleAutoAllocate} disabled={aiLoading || unallocated.length === 0}>
            {aiLoading ? 'Allocating...' : 'AI Auto-allocate (Subprocess + Steps)'}
          </button>
        )}
      </div>

      {parentReviewQueue.length > 0 && (
        <div className="allocator__review-queue">
          <h4 className="allocator__col-title">Subprocesses Need Review ({parentReviewQueue.length})</h4>
          <div className="allocator__review-list">
            {parentReviewQueue.map((item) => (
              <div key={item.step.id} className="allocator__review-item">
                <div className="allocator__review-main">
                  <span className="allocator__step-label">{item.step.label}</span>
                  <span className="allocator__review-reason">{item.reason}</span>
                </div>
                <div className="allocator__review-actions">
                  <span className="allocator__review-confidence">{Math.round(item.confidence * 100)}%</span>
                  <select
                    className="allocator__review-select"
                    value={item.targetCategoryId}
                    onChange={(e) => resolveReviewItem(item.step.id, e.target.value)}
                  >
                    <option value="">Move to...</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button className="btn btn--ghost btn--sm" onClick={() => sendReviewToUnallocated(item.step.id)}>
                    Keep Unallocated
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {leafReviewQueue.length > 0 && (
        <div className="allocator__review-queue">
          <h4 className="allocator__col-title">Steps Need Review ({leafReviewQueue.length})</h4>
          <div className="allocator__review-list">
            {leafReviewQueue.map((item) => (
              <div key={item.step.id} className="allocator__review-item">
                <div className="allocator__review-main">
                  <span className="allocator__step-label">{item.step.label}</span>
                  <span className="allocator__review-reason">{item.reason}</span>
                </div>
                <div className="allocator__review-actions">
                  <span className="allocator__review-confidence">{Math.round(item.confidence * 100)}%</span>
                  <select
                    className="allocator__review-select"
                    value={item.targetCategoryId}
                    onChange={(e) => resolveReviewItem(item.step.id, e.target.value)}
                  >
                    <option value="">Move to...</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button className="btn btn--ghost btn--sm" onClick={() => sendReviewToUnallocated(item.step.id)}>
                    Keep Unallocated
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                {step.semanticKind === 'fact' && <span className="allocator__fact-badge">Fact candidate</span>}
                {step.semanticKind !== 'fact' && (step.semanticScore ?? 0) >= 0.45 && (
                  <span className="allocator__fact-badge allocator__fact-badge--soft">Maybe fact</span>
                )}
                <span className={`allocator__step-type ${step.semanticKind === 'fact' ? 'allocator__step-type--fact' : ''}`}>{step.nodeType}</span>
              </div>
            ))}
            {unallocated.length === 0 && <p className="allocator__empty">All steps resolved!</p>}
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
                {cat.kind === 'facts' && <span className="allocator__fact-category">Facts</span>}
                <span className="allocator__cat-count">{cat.steps.length}</span>
              </div>
              <div className="allocator__cat-steps">
                {cat.steps.map((step, si) => (
                  <div key={step.id} className="allocator__step allocator__step--allocated" draggable onDragStart={() => handleDragStart(step)}>
                    <span className="allocator__step-num">{ci + 1}.{si + 1}</span>
                    <span className="allocator__step-label">{step.label}</span>
                  </div>
                ))}
                {cat.steps.length === 0 && (
                  <p className="allocator__drop-hint">
                    {cat.kind === 'facts' ? 'Drop statements, definitions, and context items here' : 'Drop steps here'}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="modal__footer" style={{ borderTop: 'none', padding: '12px 0 0' }}>
        <button className="btn btn--ghost" onClick={onBack}>← Back</button>
        <button className="btn btn--primary" onClick={() => onConfirm(cats, graveyard, unallocated)} disabled={totalAllocated === 0 && unallocated.length === 0 && graveyard.length === 0}>
          Import ({totalAllocated} allocated, {totalReview} review, {unallocated.length} unallocated) →
        </button>
      </div>
    </div>
  );
}
