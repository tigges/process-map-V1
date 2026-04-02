import { useCallback, useRef, useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { exportCanvasPng, exportCanvasSvg, exportMermaid, downloadText } from '../utils/exportImport';
import type { JourneyNodeData } from '../types';
import Breadcrumb from './Breadcrumb';

interface ToolbarProps {
  showSidebar: boolean;
  onToggleSidebar: () => void;
  showPalette: boolean;
  onTogglePalette: () => void;
  showInspector: boolean;
  onToggleInspector: () => void;
}

interface SearchResult {
  mapId: string;
  mapName: string;
  nodeId: string;
  label: string;
  description: string;
  path: string;
}

export default function Toolbar({ showSidebar, onToggleSidebar, showPalette, onTogglePalette, showInspector, onToggleInspector }: ToolbarProps) {
  const project = useAppStore((s) => s.getActiveProject());
  const activeMap = useAppStore((s) => s.getActiveMap());
  const canvasRef = useRef<HTMLElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

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

  const searchResults = useMemo((): SearchResult[] => {
    if (!project || searchQuery.trim().length < 2) return [];
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    for (const [mapId, map] of Object.entries(project.maps)) {
      const parentMap = map.parentMapId ? project.maps[map.parentMapId] : null;
      const path = parentMap ? `${parentMap.name} › ${map.name}` : map.name;

      for (const node of map.nodes) {
        const d = node.data as JourneyNodeData;
        const matchLabel = d.label.toLowerCase().includes(q);
        const matchDesc = d.description.toLowerCase().includes(q);
        if (matchLabel || matchDesc) {
          results.push({
            mapId, mapName: map.name, nodeId: node.id,
            label: d.label, description: d.description, path,
          });
        }
      }
    }

    return results.slice(0, 20);
  }, [project, searchQuery]);

  const handleResultClick = useCallback((result: SearchResult) => {
    const proj = project;
    if (!proj) return;

    const map = proj.maps[result.mapId];
    if (!map) return;

    const breadcrumb: string[] = [];
    let current: string | null = result.mapId;
    while (current) {
      breadcrumb.unshift(current);
      current = proj.maps[current]?.parentMapId ?? null;
    }

    useAppStore.setState({
      activeMapId: result.mapId,
      breadcrumb,
      selectedNodeId: result.nodeId,
    });

    setSearchQuery('');
    setShowSearch(false);
  }, [project]);

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
        <div className="toolbar__search-wrap">
          <button className="toolbar__toggle" onClick={() => setShowSearch((v) => !v)} title="Search nodes">
            🔍
          </button>
          {showSearch && (
            <div className="toolbar__search-dropdown">
              <input
                className="toolbar__search-input"
                placeholder="Search all nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchResults.length > 0 && (
                <div className="toolbar__search-results">
                  {searchResults.map((r, i) => (
                    <button key={`${r.mapId}-${r.nodeId}-${i}`} className="toolbar__search-result" onClick={() => handleResultClick(r)}>
                      <span className="toolbar__search-result-label">{r.label}</span>
                      <span className="toolbar__search-result-path">{r.path}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="toolbar__search-empty">No results found</div>
              )}
            </div>
          )}
        </div>
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
