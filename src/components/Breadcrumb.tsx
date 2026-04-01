import { useAppStore } from '../store/useAppStore';

export default function Breadcrumb() {
  const breadcrumb = useAppStore((s) => s.breadcrumb);
  const project = useAppStore((s) => s.getActiveProject());
  const navigateToBreadcrumb = useAppStore((s) => s.navigateToBreadcrumb);
  const navigateUp = useAppStore((s) => s.navigateUp);

  if (!project || breadcrumb.length === 0) return null;

  return (
    <div className="breadcrumb">
      {breadcrumb.length > 1 && (
        <button className="breadcrumb__back" onClick={navigateUp} title="Go back">
          ← Back
        </button>
      )}
      {breadcrumb.map((mapId, index) => {
        const map = project.maps[mapId];
        const isLast = index === breadcrumb.length - 1;
        return (
          <span key={mapId} className="breadcrumb__segment">
            {index > 0 && <span className="breadcrumb__sep">/</span>}
            <button
              className={`breadcrumb__link ${isLast ? 'breadcrumb__link--active' : ''}`}
              onClick={() => navigateToBreadcrumb(index)}
              disabled={isLast}
            >
              {map?.name ?? 'Unknown'}
            </button>
          </span>
        );
      })}
    </div>
  );
}
