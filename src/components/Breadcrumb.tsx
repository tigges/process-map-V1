import { useAppStore } from '../store/useAppStore';

export default function Breadcrumb() {
  const breadcrumb = useAppStore((s) => s.breadcrumb);
  const project = useAppStore((s) => s.getActiveProject());
  const navigateToBreadcrumb = useAppStore((s) => s.navigateToBreadcrumb);
  const navigateUp = useAppStore((s) => s.navigateUp);

  if (!project || breadcrumb.length === 0) return null;

  const depth = breadcrumb.length - 1;

  return (
    <div className="context-bar">
      {breadcrumb.length > 1 && (
        <button className="context-bar__back" onClick={navigateUp} title="Go back">
          ←
        </button>
      )}
      <div className="context-bar__path">
        {breadcrumb.map((mapId, index) => {
          const map = project.maps[mapId];
          const isLast = index === breadcrumb.length - 1;
          const nodeCount = map?.nodes.length ?? 0;
          return (
            <span key={mapId} className="context-bar__segment">
              {index > 0 && <span className="context-bar__sep">›</span>}
              <button
                className={`context-bar__link ${isLast ? 'context-bar__link--active' : ''}`}
                onClick={() => navigateToBreadcrumb(index)}
                disabled={isLast}
              >
                {map?.name ?? 'Unknown'}
                {isLast && nodeCount > 0 && (
                  <span className="context-bar__count">{nodeCount}</span>
                )}
              </button>
            </span>
          );
        })}
      </div>
      {depth > 0 && (
        <span className="context-bar__depth">Level {depth + 1}</span>
      )}
    </div>
  );
}
