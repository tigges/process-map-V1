import { useEffect, useState, useCallback, useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import LoginGate from './components/LoginGate';
import ProjectSidebar from './components/ProjectSidebar';
import Toolbar from './components/Toolbar';
import FlowCanvas from './components/FlowCanvas';
import NodePalette from './components/NodePalette';
import NodeInspector from './components/NodeInspector';
import { useAppStore } from './store/useAppStore';
import { useAuthStore } from './store/useAuthStore';
import { generateNodeNumbers } from './utils/numbering';
import { NumbersContext, NumberToNodeContext, ShowNumbersContext, SearchTermContext } from './contexts';
import './App.css';

export default function App() {
  const initFromStorage = useAppStore((s) => s.initFromStorage);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const project = useAppStore((s) => s.getActiveProject());

  const [showSidebar, setShowSidebar] = useState(true);
  const [showPalette, setShowPalette] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const openInspector = useCallback(() => setShowInspector(true), []);

  const nodeNumbers = useMemo(() => {
    if (!project) return new Map<string, string>();
    return generateNodeNumbers(project);
  }, [project]);
  const numberToNode = useMemo(() => {
    if (!project) return new Map<string, { mapId: string; nodeId: string }>();
    const lookup = new Map<string, { mapId: string; nodeId: string }>();
    for (const [mapId, map] of Object.entries(project.maps)) {
      for (const node of map.nodes) {
        const number = nodeNumbers.get(node.id);
        if (number) lookup.set(number, { mapId, nodeId: node.id });
      }
    }
    return lookup;
  }, [project, nodeNumbers]);

  useEffect(() => {
    checkAuth();
    initFromStorage();
  }, [checkAuth, initFromStorage]);

  return (
    <LoginGate>
      <NumbersContext.Provider value={nodeNumbers}>
        <NumberToNodeContext.Provider value={numberToNode}>
          <ShowNumbersContext.Provider value={showNumbers}>
            <SearchTermContext.Provider value={searchTerm}>
              <ReactFlowProvider>
                <div className="app">
                  {showSidebar && <ProjectSidebar />}
                  <div className="app__main">
                    <Toolbar
                      showSidebar={showSidebar}
                      onToggleSidebar={() => setShowSidebar((v) => !v)}
                      showPalette={showPalette}
                      onTogglePalette={() => setShowPalette((v) => !v)}
                      showInspector={showInspector}
                      onToggleInspector={() => setShowInspector((v) => !v)}
                      showNumbers={showNumbers}
                      onToggleNumbers={() => setShowNumbers((v) => !v)}
                      searchTerm={searchTerm}
                      onSearchTermChange={setSearchTerm}
                    />
                  <div className="app__workspace">
                    {activeProjectId && showPalette && <NodePalette />}
                    <FlowCanvas onNodeSelect={openInspector} />
                    {showInspector && <NodeInspector />}
                  </div>
                </div>
              </div>
              </ReactFlowProvider>
            </SearchTermContext.Provider>
          </ShowNumbersContext.Provider>
        </NumberToNodeContext.Provider>
      </NumbersContext.Provider>
    </LoginGate>
  );
}
