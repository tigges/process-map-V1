import { useEffect } from 'react';
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

  useEffect(() => {
    checkAuth();
    initFromStorage();
  }, [checkAuth, initFromStorage]);

  return (
    <LoginGate>
      <ReactFlowProvider>
        <div className="app">
          <ProjectSidebar />
          <div className="app__main">
            <Toolbar />
            <div className="app__workspace">
              {activeProjectId && <NodePalette />}
              <FlowCanvas />
              <NodeInspector />
            </div>
          </div>
        </div>
      </ReactFlowProvider>
    </LoginGate>
  );
}
