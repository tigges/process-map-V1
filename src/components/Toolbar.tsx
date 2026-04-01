import { useAppStore } from '../store/useAppStore';
import Breadcrumb from './Breadcrumb';

interface ToolbarProps {
  showPalette: boolean;
  onTogglePalette: () => void;
  showInspector: boolean;
  onToggleInspector: () => void;
}

export default function Toolbar({ showPalette, onTogglePalette, showInspector, onToggleInspector }: ToolbarProps) {
  const project = useAppStore((s) => s.getActiveProject());
  const activeMap = useAppStore((s) => s.getActiveMap());

  return (
    <div className="toolbar">
      <div className="toolbar__left">
        <Breadcrumb />
      </div>
      <div className="toolbar__center">
        {activeMap && (
          <span className="toolbar__map-name">{activeMap.name}</span>
        )}
      </div>
      <div className="toolbar__right">
        <button
          className={`toolbar__toggle ${showPalette ? 'toolbar__toggle--active' : ''}`}
          onClick={onTogglePalette}
          title="Toggle node palette"
        >
          Palette
        </button>
        <button
          className={`toolbar__toggle ${showInspector ? 'toolbar__toggle--active' : ''}`}
          onClick={onToggleInspector}
          title="Toggle inspector"
        >
          Inspector
        </button>
        {project && (
          <span className="toolbar__project-badge">{project.name}</span>
        )}
      </div>
    </div>
  );
}
