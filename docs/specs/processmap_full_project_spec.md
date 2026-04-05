# ProcessMap Full Project Specification

## 1. Document Control
- Product: ProcessMap
- Repository: `tigges/process-map-V1`
- Architecture style: Single-page web application (SPA)
- Runtime stack: React + TypeScript + Vite
- Visualization engine: React Flow (`@xyflow/react`)
- State management: Zustand
- Persistence: Browser `localStorage`

## 2. Product Scope
ProcessMap is an interactive process and journey mapping editor with:
- Multi-project map authoring
- Nested subprocess drill-down maps
- Import pipelines from text / PDF / DOCX into map structures
- Assisted AI parsing and categorization (Claude API)
- Export to PNG, SVG, Mermaid, and JSON
- Search and cross-reference navigation through numbering

The product targets process design, operations mapping, and service journey documentation workflows.

## 3. Top-Level Functional Modules

### 3.1 Workspace Shell
- `App` composes the authenticated app shell and contexts.
- Includes:
  - Project sidebar
  - Toolbar
  - Flow canvas
  - Optional node palette
  - Optional node inspector
- Context providers:
  - `NumbersContext`
  - `ShowNumbersContext`
  - `SearchTermContext`

### 3.2 Project and Map Management
- Create/delete/select projects
- Create/delete folders, drag/drop project assignment
- Map breadcrumb navigation
- Subprocess conversion creates child maps
- Sample project bootstrap

### 3.3 Graph Editing
- Node CRUD (5 node types):
  - `start`
  - `action`
  - `decision`
  - `end`
  - `subprocess`
- Edge CRUD with styled smooth-step links
- Drag-and-drop node placement from palette
- Node inspector editing and subprocess conversion

### 3.4 Import System
- Text import wizard (4-step flow plus AI confirm step):
  1. Paste/upload and parse controls
  2. Review/edit structure and interpretation
  3. Define categories
  4. Allocate steps
- Supported sources:
  - Raw text / markdown
  - PDF via `pdfjs-dist`
  - DOCX via `mammoth`

### 3.5 Export System
- Canvas rendering export:
  - PNG
  - SVG
- Model export:
  - Mermaid (`flowchart LR`)
  - JSON import/export

### 3.6 Security and Access
- App-level password mechanism exists.
- Current dev behavior skips auth (`DEV_SKIP_AUTH = true`).
- Claude API key is stored client-side in `localStorage`.

## 4. Core Data Model

### 4.1 ProcessMapProject
- Identity and metadata
- Root map pointer (`rootMapId`)
- `maps: Record<string, ProcessMap>`
- Optional `isDraft`, `folderId`

### 4.2 ProcessMap
- Hierarchical map structure:
  - `parentMapId`
  - `parentNodeId`
- Graph payload:
  - `nodes: Node<JourneyNodeData>[]`
  - `edges: Edge[]`

### 4.3 JourneyNodeData
- `label`
- `description`
- `nodeType`
- `color`
- Optional `subMapId`

### 4.4 Import Domain Types
- `ParsedStep` (parser intermediate tree)
- `AllocatedCategory` (allocator output payload)
- `ImportInterpretation` (review intelligence summary)
- `HierarchySummary` (step-2 hierarchy panel)

## 5. State Management Contract (Zustand)
The app store encapsulates:
- Active selection:
  - `activeProjectId`
  - `activeMapId`
  - `breadcrumb`
  - `selectedNodeId`
  - `focusNodeId`
- Project lifecycle:
  - `createProject`
  - `deleteProject`
  - `setActiveProject`
  - `createSampleProject`
- Graph mutation:
  - `onNodesChange`
  - `onEdgesChange`
  - `onConnect`
  - `addNode`
  - `updateNodeData`
  - `deleteNode`
- Navigation:
  - `navigateToMap`
  - `navigateUp`
  - `navigateToBreadcrumb`
  - `navigateToNode`
- Subprocess modeling:
  - `convertToSubprocess`
- Persistence:
  - `persist`
  - `initFromStorage`

## 6. Graph Layout and Visual Composition

### 6.1 Layout Engine
`layoutEngine.ts` uses Dagre for baseline directed layout (`LR` direction), then applies subprocess-specific post-processing:
- Sibling subprocess stacking
- Chain subprocess stacking
- Vertical gap controls for readability

### 6.2 Group Frame Overlays
`FlowCanvas` generates background frame nodes (`groupFrame`) that:
- Group related nodes by chapter numbering or subprocess fallback
- Render non-interactive visual containers
- Improve segmentation and readability on overview maps

### 6.3 Split Preview Mode
When a subprocess node is selected, canvas switches to split mode:
- Main map on left
- Child subprocess preview on right

## 7. Numbering, Cross-Reference, and Search

### 7.1 Numbering
`generateNodeNumbers` creates hierarchical chapter-like numbering (e.g., `1`, `1.2`, `1.2.3`) across nested maps.

### 7.2 Cross-References
`CrossRefText` detects numeric references (`X.Y`/`X.Y.Z`) and turns them into clickable links that call `navigateToNode`.

### 7.3 Search
Toolbar search performs project-wide node matching across labels and descriptions, then jumps to map + node context.

## 8. Import and Analysis Subsystem (Summary View)
The detailed import spec is provided in the companion document. At system level:
- Parser cleans noisy text and infers hierarchy/type
- Optional AI parse restructures source text
- Review stage provides interpretation analytics and hierarchy preview
- Categories can be customized before allocation
- Allocator supports AI-assisted dual-pass category assignment
- Builder converts allocated sets into maps with safe unclassified retention

## 9. Non-Functional Characteristics

### 9.1 Runtime and Deployment
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Deployment target: GitHub Pages (`/process-map-V1/`)

### 9.2 Performance Notes
- Client-side rendering and parsing
- Large JS bundle warning can appear in production build output
- Import workflows rely on browser memory and local compute

### 9.3 Data Storage and Privacy
- Projects and folders persisted in `localStorage`
- Claude key persisted in `localStorage`
- AI calls made directly from browser to Anthropic API endpoint

## 10. External Dependencies and Integrations
- `@xyflow/react` for interactive graph canvas
- `@dagrejs/dagre` for layout
- `pdfjs-dist` for PDF text extraction
- `mammoth` for DOCX text extraction
- `html-to-image` for image export
- Anthropic Messages API for AI parsing/allocation

## 11. Primary User Flows
1. Create/select project
2. Add/edit nodes and edges
3. Convert nodes to subprocesses and navigate nested maps
4. Import structured process content from documents/text
5. Refine through category allocation and review intelligence
6. Export resulting maps and models

## 12. Risks and Known Constraints
- Auth currently bypassed by dev flag; not production-hardened as configured.
- Browser-local persistence means no server sync or multi-user collaboration.
- AI import quality depends on source text quality and model behavior.
- PDF extraction is text-layer dependent; scan-only PDFs need OCR before import.

## 13. Suggested Future Enhancements
- Server-backed persistence and project sharing
- Version history with diff and rollback
- Collaboration and commenting
- Optional OCR preprocessing pipeline
- Import quality telemetry and benchmark harness
- Stronger auth and role-based access controls

