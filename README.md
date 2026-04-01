# ProcessMap — User Journey Flow Chart Editor

A visual editor for mapping, navigating, and managing user journey process flow charts. Built with React, TypeScript, React Flow, and Zustand.

## Features

- **Visual flow chart editor** — drag-and-drop canvas with pan, zoom, snap-to-grid, and minimap
- **8 node types** — Phase, Touchpoint, Action, Decision, Emotion, Pain Point, Opportunity, Sub-process
- **Hierarchical sub-maps** — double-click any subprocess node to deep-dive; breadcrumb navigation to go back
- **Node inspector** — select any node to view/edit its label, description, and type
- **Multi-project support** — create, switch, and delete independent journey map projects
- **JSON export/import** — backup and share projects as JSON files
- **Auto-save** — all changes persist in localStorage automatically

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and click **★ Load Sample** to explore a pre-built user journey.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (HMR) |
| `npm run build` | Type-check + production build |
| `npm run lint` | ESLint check |
| `npm run preview` | Preview production build |

## Tech Stack

- [React 19](https://react.dev/) + [TypeScript 5.9](https://www.typescriptlang.org/)
- [Vite 8](https://vite.dev/) — build tooling
- [@xyflow/react](https://reactflow.dev/) — flow chart canvas
- [Zustand](https://zustand-demo.pmnd.rs/) — state management
- [nanoid](https://github.com/ai/nanoid) — ID generation
