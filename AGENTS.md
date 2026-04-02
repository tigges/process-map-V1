# AGENTS.md

## Cursor Cloud specific instructions

This is a **React + TypeScript + Vite** SPA — a visual user journey / process flow chart editor built with [React Flow](https://reactflow.dev/) and [Zustand](https://zustand-demo.pmnd.rs/).

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Vite dev server | `npm run dev` | 5173 | Only service; base path `/process-map-V1/` for GitHub Pages |

### Key commands

- **Dev**: `npm run dev`
- **Build**: `npm run build` (runs `tsc -b && vite build`)
- **Lint**: `npm run lint` (ESLint)
- **Deploy**: Push to `main` → GitHub Actions auto-deploys to https://tigges.github.io/process-map-V1/

### Architecture

- **State**: Zustand store at `src/store/useAppStore.ts`
- **Persistence**: localStorage via `src/utils/storage.ts`
- **Types**: `src/types/index.ts` — 5 node types: start, action, decision, end, subprocess
- **Layout engine**: `src/utils/layoutEngine.ts` — dagre-based auto-layout (LR for flows, grid for overviews)
- **Text parser**: `src/utils/textParser.ts` — shared cleanup pipeline, header/content detection, keyword clustering, graveyard filtering, normalization
- **Claude API**: `src/utils/claudeApi.ts` — Haiku 4.5 for smart import parsing
- **Contexts**: `src/contexts.ts` — NumbersContext, ShowNumbersContext, SearchTermContext
- **Numbering**: `src/utils/numbering.ts` — auto-generates chapter numbers (1, 1.1, 1.1.1) from project hierarchy

### Key features implemented

- Flow chart editor with 5 shape types (circle, rectangle, diamond)
- PDF, Word (.docx), text import with AI (Claude) or rule-based parsing
- Smart keyword clustering for overview categories
- Graveyard for unclassified/junk items
- Project folders with drag-and-drop
- Search/find with zoom-to-node and text highlighting
- Chapter numbering toggle (#)
- Split pane subprocess preview
- PNG/SVG/Mermaid export
- Password protection (disabled via DEV_SKIP_AUTH flag)
- GitHub Pages auto-deploy

### What needs building next (in priority order)

1. **Two-step import wizard** (PARTIALLY BUILT — components exist but not wired into modal):
   - `src/components/CategoryBuilder.tsx` — Step 1: define/reorder categories
   - `src/components/StepAllocator.tsx` — Step 2: drag steps into categories
   - `src/utils/textParser.ts` has `allocatedToProject()` ready
   - Need to wire these into `TextImportModal.tsx` as wizard steps 'categories' and 'allocate'

2. **Within-project cross-references** — detect `X.Y` patterns in descriptions, make clickable links that jump to referenced node

3. **Layout improvements** — visual group frames, subprocess stacking intelligence

4. **Password re-enable** — set `DEV_SKIP_AUTH = false` in `src/store/useAuthStore.ts`

### Gotchas

- Base path is `/process-map-V1/` — dev server redirects `localhost:5173` to `localhost:5173/process-map-V1/`
- Password disabled for testing — flip `DEV_SKIP_AUTH` in `src/store/useAuthStore.ts`
- Claude API key stored in localStorage (key: `processmap-claude-api-key`)
- The `--no-verify` flag is needed for git commits (pre-commit hook has a bug with project names containing spaces)
