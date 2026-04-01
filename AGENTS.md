# AGENTS.md

## Cursor Cloud specific instructions

This is a **React + TypeScript + Vite** single-page application — a visual user journey / process flow chart editor built with [React Flow](https://reactflow.dev/) and [Zustand](https://zustand-demo.pmnd.rs/).

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Vite dev server | `npm run dev` | 5173 | Only service; add `-- --host 0.0.0.0` for external access |

### Key commands

Standard npm scripts in `package.json`:

- **Dev**: `npm run dev`
- **Build**: `npm run build` (runs `tsc -b && vite build`)
- **Lint**: `npm run lint` (ESLint)
- **Preview prod build**: `npm run preview`

### Architecture notes

- **State**: Zustand store at `src/store/useAppStore.ts` — single source of truth for projects, maps, nodes, edges, and navigation.
- **Persistence**: `localStorage` via `src/utils/storage.ts`. Projects are auto-saved on mutations.
- **Sub-maps**: Any node can be converted to a "subprocess" which creates a child `ProcessMap`. Navigation uses a breadcrumb stack.
- **Drag-and-drop**: Node palette items set `application/processmap-nodetype` in dataTransfer; canvas `onDrop` reads it and calls `addNode`.

### Gotchas

- No backend or database — everything is client-side localStorage. Clearing browser data resets all projects.
- The React Flow `proOptions.hideAttribution` flag hides the watermark; this is fine for development but check the React Flow license for production use.
