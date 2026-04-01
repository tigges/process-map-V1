import { useAppStore } from '../store/useAppStore';
import Breadcrumb from './Breadcrumb';

export default function Toolbar() {
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
        {project && (
          <span className="toolbar__project-badge">{project.name}</span>
        )}
      </div>
    </div>
  );
}
