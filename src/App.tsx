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
import { NumbersContext, ShowNumbersContext, SearchTermContext } from './contexts';
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

  useEffect(() => {
    checkAuth();
    initFromStorage();
  }, [checkAuth, initFromStorage]);

  return (
    <LoginGate>
      <NumbersContext.Provider value={nodeNumbers}>
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
      </NumbersContext.Provider>
    </LoginGate>
  );
}
