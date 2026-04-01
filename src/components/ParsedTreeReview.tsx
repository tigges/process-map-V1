import { useState, useCallback } from 'react';
import { NODE_TYPE_CONFIG, type JourneyNodeType } from '../types';
import type { ParsedStep } from '../utils/textParser';

interface ParsedTreeReviewProps {
  steps: ParsedStep[];
  onUpdate: (steps: ParsedStep[]) => void;
}

const nodeTypeOptions = Object.entries(NODE_TYPE_CONFIG) as [JourneyNodeType, (typeof NODE_TYPE_CONFIG)[JourneyNodeType]][];

function StepRow({
  step,
  depth,
  onUpdate,
  onDelete,
}: {
  step: ParsedStep;
  depth: number;
  onUpdate: (updated: ParsedStep) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(step.label);
  const config = NODE_TYPE_CONFIG[step.nodeType];

  const handleSave = useCallback(() => {
    onUpdate({ ...step, label: editLabel });
    setEditing(false);
  }, [step, editLabel, onUpdate]);

  const handleTypeChange = useCallback(
    (newType: JourneyNodeType) => {
      onUpdate({ ...step, nodeType: newType });
    },
    [step, onUpdate],
  );

  return (
    <>
      <div className="tree-row" style={{ paddingLeft: 12 + depth * 20 }}>
        <span className="tree-row__icon">{config.icon}</span>
        {editing ? (
          <input
            className="tree-row__edit"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
        ) : (
          <span className="tree-row__label" onClick={() => { setEditLabel(step.label); setEditing(true); }}>
            {step.label}
          </span>
        )}
        <select
          className="tree-row__type"
          value={step.nodeType}
          onChange={(e) => handleTypeChange(e.target.value as JourneyNodeType)}
        >
          {nodeTypeOptions.map(([type, cfg]) => (
            <option key={type} value={type}>{cfg.icon} {cfg.label}</option>
          ))}
        </select>
        <button className="tree-row__delete" onClick={onDelete} title="Remove">✕</button>
      </div>
      {step.children.map((child, ci) => (
        <StepRow
          key={child.id}
          step={child}
          depth={depth + 1}
          onUpdate={(updated) => {
            const newChildren = [...step.children];
            newChildren[ci] = updated;
            onUpdate({ ...step, children: newChildren });
          }}
          onDelete={() => {
            onUpdate({ ...step, children: step.children.filter((_, i) => i !== ci) });
          }}
        />
      ))}
    </>
  );
}

export default function ParsedTreeReview({ steps, onUpdate }: ParsedTreeReviewProps) {
  const totalChildren = steps.reduce((sum, s) => sum + s.children.length, 0);
  const totalMaps = steps.filter((s) => s.children.length > 0).length + 1;

  return (
    <div className="tree-review">
      <div className="tree-review__stats">
        <span className="tree-review__stat">{steps.length} phases</span>
        <span className="tree-review__stat">{totalChildren} sub-steps</span>
        <span className="tree-review__stat">{totalMaps} map(s)</span>
      </div>
      <p className="tree-review__hint">
        Click a label to rename. Change node types via dropdown. Remove items with ✕.
      </p>
      <div className="tree-review__list">
        {steps.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            depth={0}
            onUpdate={(updated) => {
              const newSteps = [...steps];
              newSteps[i] = updated;
              onUpdate(newSteps);
            }}
            onDelete={() => onUpdate(steps.filter((_, idx) => idx !== i))}
          />
        ))}
      </div>
      {steps.length === 0 && (
        <p className="tree-review__empty">No steps detected. Go back and adjust your text.</p>
      )}
    </div>
  );
}
