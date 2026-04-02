import { useEffect, useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import LoginGate from './components/LoginGate';
import ProjectSidebar from './components/ProjectSidebar';
import Toolbar from './components/Toolbar';
import FlowCanvas from './components/FlowCanvas';
import NodePalette from './components/NodePalette';
import NodeInspector from './components/NodeInspector';
import { useAppStore } from './store/useAppStore';
import { useAuthStore } from './store/useAuthStore';
import './App.css';

export default function App() {
  const initFromStorage = useAppStore((s) => s.initFromStorage);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const checkAuth = useAuthStore((s) => s.checkAuth);

  const [showSidebar, setShowSidebar] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showInspector, setShowInspector] = useState(false);

  const openInspector = useCallback(() => setShowInspector(true), []);

  useEffect(() => {
    checkAuth();
    initFromStorage();
  }, [checkAuth, initFromStorage]);

  return (
    <LoginGate>
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
            />
            <div className="app__workspace">
              {activeProjectId && showPalette && <NodePalette />}
              <FlowCanvas onNodeSelect={openInspector} />
              {showInspector && <NodeInspector />}
            </div>
          </div>
        </div>
      </ReactFlowProvider>
    </LoginGate>
  );
}
