import { useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { exportCanvasPng, exportCanvasSvg, exportMermaid, downloadText } from '../utils/exportImport';
import Breadcrumb from './Breadcrumb';

interface ToolbarProps {
  showSidebar: boolean;
  onToggleSidebar: () => void;
  showPalette: boolean;
  onTogglePalette: () => void;
  showInspector: boolean;
  onToggleInspector: () => void;
}

export default function Toolbar({ showSidebar, onToggleSidebar, showPalette, onTogglePalette, showInspector, onToggleInspector }: ToolbarProps) {
  const project = useAppStore((s) => s.getActiveProject());
  const activeMap = useAppStore((s) => s.getActiveMap());
  const canvasRef = useRef<HTMLElement | null>(null);

  const getCanvas = useCallback(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.querySelector('.react-flow__viewport') as HTMLElement;
    }
    return canvasRef.current;
  }, []);

  const handleExportPng = useCallback(async () => {
    const el = getCanvas();
    if (el) await exportCanvasPng(el);
  }, [getCanvas]);

  const handleExportSvg = useCallback(async () => {
    const el = getCanvas();
    if (el) await exportCanvasSvg(el);
  }, [getCanvas]);

  const handleExportMermaid = useCallback(() => {
    if (!activeMap) return;
    const mmd = exportMermaid(activeMap);
    downloadText(mmd, `${activeMap.name || 'flowchart'}.mmd`);
  }, [activeMap]);

  return (
    <div className="toolbar">
      <div className="toolbar__left">
        <button
          className={`toolbar__toggle ${showSidebar ? 'toolbar__toggle--active' : ''}`}
          onClick={onToggleSidebar}
          title="Toggle projects sidebar"
        >
          Projects
        </button>
        <Breadcrumb />
      </div>
      <div className="toolbar__center">
        {activeMap && (
          <span className="toolbar__map-name">{activeMap.name}</span>
        )}
      </div>
      <div className="toolbar__right">
        <div className="toolbar__export-group">
          <button className="toolbar__toggle" onClick={handleExportPng} title="Export as PNG">PNG</button>
          <button className="toolbar__toggle" onClick={handleExportSvg} title="Export as SVG">SVG</button>
          <button className="toolbar__toggle" onClick={handleExportMermaid} title="Export as Mermaid">Mermaid</button>
        </div>
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
