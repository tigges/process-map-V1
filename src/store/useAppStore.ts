import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Node,
} from '@xyflow/react';
import type {
  ProcessMapProject,
  ProcessMap,
  ProjectFolder,
  JourneyNodeData,
  JourneyNodeType,
} from '../types';
import { NODE_TYPE_CONFIG } from '../types';
import { createSampleProject } from '../data/sampleProject';
import { saveProjects, loadProjects, saveFolders, loadFolders } from '../utils/storage';
import type { ConnectionSuggestion } from '../utils/connectionSuggestions';

interface AppState {
  projects: ProcessMapProject[];
  folders: ProjectFolder[];
  activeProjectId: string | null;
  activeMapId: string | null;
  breadcrumb: string[];
  selectedNodeId: string | null;
  focusNodeId: string | null;

  // Derived helpers
  getActiveProject: () => ProcessMapProject | null;
  getActiveMap: () => ProcessMap | null;

  // Project CRUD
  initFromStorage: () => void;
  createProject: (name: string, description: string) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string) => void;
  createSampleProject: () => void;

  // Map navigation
  navigateToMap: (mapId: string) => void;
  navigateUp: () => void;
  navigateToBreadcrumb: (index: number) => void;

  // Node / Edge mutations (React Flow callbacks)
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Node CRUD
  addNode: (nodeType: JourneyNodeType, position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, data: Partial<JourneyNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  setSelectedNode: (nodeId: string | null) => void;

  // Navigate to a node anywhere in the active project
  navigateToNode: (nodeId: string) => void;

  // Sub-map creation
  convertToSubprocess: (nodeId: string) => void;

  // Export / Import
  exportActiveProject: () => string;
  importProject: (json: string) => void;
  applyConnectionSuggestions: (suggestions: ConnectionSuggestion[]) => void;

  // Draft management
  finalizeProject: (id: string) => void;
  discardDraft: (id: string) => void;

  // Folder management
  createFolder: (name: string) => void;
  deleteFolder: (id: string) => void;
  moveProjectToFolder: (projectId: string, folderId: string | undefined) => void;

  // Persist
  persist: () => void;
}

function updateMapInProject(
  project: ProcessMapProject,
  mapId: string,
  updater: (map: ProcessMap) => ProcessMap,
): ProcessMapProject {
  const map = project.maps[mapId];
  if (!map) return project;
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    maps: { ...project.maps, [mapId]: updater(map) },
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  folders: [],
  activeProjectId: null,
  activeMapId: null,
  breadcrumb: [],
  selectedNodeId: null,
  focusNodeId: null,

  getActiveProject() {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId) ?? null;
  },

  getActiveMap() {
    const project = get().getActiveProject();
    const { activeMapId } = get();
    if (!project || !activeMapId) return null;
    return project.maps[activeMapId] ?? null;
  },

  initFromStorage() {
    const projects = loadProjects();
    const folders = loadFolders();
    if (projects.length > 0) {
      const sorted = [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      set({
        projects: sorted,
        folders,
        activeProjectId: sorted[0].id,
        activeMapId: sorted[0].rootMapId,
        breadcrumb: [sorted[0].rootMapId],
      });
    } else {
      set({ folders });
    }
  },

  createProject(name, description) {
    const id = nanoid();
    const rootMapId = nanoid();
    const rootMap: ProcessMap = {
      id: rootMapId,
      name: 'Overview',
      description: 'Top-level journey map',
      parentMapId: null,
      parentNodeId: null,
      nodes: [],
      edges: [],
    };
    const project: ProcessMapProject = {
      id,
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rootMapId,
      maps: { [rootMapId]: rootMap },
    };
    set((s) => ({
      projects: [...s.projects, project],
      activeProjectId: id,
      activeMapId: rootMapId,
      breadcrumb: [rootMapId],
      selectedNodeId: null,
    }));
    get().persist();
  },

  deleteProject(id) {
    set((s) => {
      const projects = s.projects.filter((p) => p.id !== id);
      const isActive = s.activeProjectId === id;
      return {
        projects,
        activeProjectId: isActive ? (projects[0]?.id ?? null) : s.activeProjectId,
        activeMapId: isActive ? (projects[0]?.rootMapId ?? null) : s.activeMapId,
        breadcrumb: isActive ? (projects[0] ? [projects[0].rootMapId] : []) : s.breadcrumb,
        selectedNodeId: null,
      };
    });
    get().persist();
  },

  setActiveProject(id) {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    set({
      activeProjectId: id,
      activeMapId: project.rootMapId,
      breadcrumb: [project.rootMapId],
      selectedNodeId: null,
    });
  },

  createSampleProject() {
    const sample = createSampleProject();
    set((s) => ({
      projects: [...s.projects, sample],
      activeProjectId: sample.id,
      activeMapId: sample.rootMapId,
      breadcrumb: [sample.rootMapId],
      selectedNodeId: null,
    }));
    get().persist();
  },

  navigateToMap(mapId) {
    set((s) => ({
      activeMapId: mapId,
      breadcrumb: [...s.breadcrumb, mapId],
      selectedNodeId: null,
    }));
  },

  navigateUp() {
    set((s) => {
      if (s.breadcrumb.length <= 1) return s;
      const newBreadcrumb = s.breadcrumb.slice(0, -1);
      return {
        activeMapId: newBreadcrumb[newBreadcrumb.length - 1],
        breadcrumb: newBreadcrumb,
        selectedNodeId: null,
      };
    });
  },

  navigateToBreadcrumb(index) {
    set((s) => {
      const newBreadcrumb = s.breadcrumb.slice(0, index + 1);
      return {
        activeMapId: newBreadcrumb[newBreadcrumb.length - 1],
        breadcrumb: newBreadcrumb,
        selectedNodeId: null,
      };
    });
  },

  onNodesChange(changes) {
    const { activeProjectId, activeMapId } = get();
    if (!activeProjectId || !activeMapId) return;
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === activeProjectId
          ? updateMapInProject(p, activeMapId, (m) => ({
              ...m,
              nodes: applyNodeChanges(changes, m.nodes) as Node<JourneyNodeData>[],
            }))
          : p,
      ),
    }));
  },

  onEdgesChange(changes) {
    const { activeProjectId, activeMapId } = get();
    if (!activeProjectId || !activeMapId) return;
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === activeProjectId
          ? updateMapInProject(p, activeMapId, (m) => ({
              ...m,
              edges: applyEdgeChanges(changes, m.edges),
            }))
          : p,
      ),
    }));
  },

  onConnect(connection) {
    const { activeProjectId, activeMapId } = get();
    if (!activeProjectId || !activeMapId) return;
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === activeProjectId
          ? updateMapInProject(p, activeMapId, (m) => ({
              ...m,
              edges: addEdge(
                { ...connection, type: 'smoothstep', animated: true, style: { stroke: '#94a3b8', strokeWidth: 2 } },
                m.edges,
              ),
            }))
          : p,
      ),
    }));
    get().persist();
  },

  addNode(nodeType, position) {
    const { activeProjectId, activeMapId } = get();
    if (!activeProjectId || !activeMapId) return;
    const config = NODE_TYPE_CONFIG[nodeType];
    const newNode: Node<JourneyNodeData> = {
      id: nanoid(),
      type: 'journeyNode',
      position,
      data: {
        label: config.label,
        description: '',
        nodeType,
        color: config.color,
      },
    };
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === activeProjectId
          ? updateMapInProject(p, activeMapId, (m) => ({
              ...m,
              nodes: [...m.nodes, newNode],
            }))
          : p,
      ),
    }));
    get().persist();
  },

  updateNodeData(nodeId, data) {
    const { activeProjectId, activeMapId } = get();
    if (!activeProjectId || !activeMapId) return;
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === activeProjectId
          ? updateMapInProject(p, activeMapId, (m) => ({
              ...m,
              nodes: m.nodes.map((n) =>
                n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
              ) as Node<JourneyNodeData>[],
            }))
          : p,
      ),
    }));
    get().persist();
  },

  deleteNode(nodeId) {
    const { activeProjectId, activeMapId } = get();
    if (!activeProjectId || !activeMapId) return;
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === activeProjectId
          ? updateMapInProject(p, activeMapId, (m) => ({
              ...m,
              nodes: m.nodes.filter((n) => n.id !== nodeId),
              edges: m.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
            }))
          : p,
      ),
      selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
    }));
    get().persist();
  },

  setSelectedNode(nodeId) {
    set({ selectedNodeId: nodeId });
  },

  navigateToNode(nodeId) {
    const project = get().getActiveProject();
    if (!project) return;
    for (const [mapId, map] of Object.entries(project.maps)) {
      const found = map.nodes.find((n) => n.id === nodeId);
      if (found) {
        const breadcrumb: string[] = [];
        let cur: string | null = mapId;
        while (cur) {
          breadcrumb.unshift(cur);
          cur = project.maps[cur]?.parentMapId ?? null;
        }
        set({
          activeMapId: mapId,
          breadcrumb,
          selectedNodeId: nodeId,
          focusNodeId: nodeId,
        });
        return;
      }
    }
  },

  convertToSubprocess(nodeId) {
    const { activeProjectId, activeMapId } = get();
    if (!activeProjectId || !activeMapId) return;
    const project = get().getActiveProject();
    if (!project) return;
    const map = project.maps[activeMapId];
    if (!map) return;
    const node = map.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const subMapId = nanoid();
    const subMap: ProcessMap = {
      id: subMapId,
      name: `${node.data.label} — Details`,
      description: `Sub-process for ${node.data.label}`,
      parentMapId: activeMapId,
      parentNodeId: nodeId,
      nodes: [],
      edges: [],
    };

    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const updated = updateMapInProject(p, activeMapId, (m) => ({
          ...m,
          nodes: m.nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, nodeType: 'subprocess' as const, subMapId, color: '#64748b' } }
              : n,
          ) as Node<JourneyNodeData>[],
        }));
        return { ...updated, maps: { ...updated.maps, [subMapId]: subMap } };
      }),
    }));
    get().persist();
  },

  exportActiveProject() {
    const project = get().getActiveProject();
    if (!project) return '{}';
    return JSON.stringify(project, null, 2);
  },

  importProject(json) {
    try {
      const project = JSON.parse(json) as ProcessMapProject;
      set((s) => ({
        projects: [...s.projects, project],
        activeProjectId: project.id,
        activeMapId: project.rootMapId,
        breadcrumb: [project.rootMapId],
        selectedNodeId: null,
      }));
      get().persist();
    } catch (e) {
      console.error('Import failed:', e);
    }
  },

  applyConnectionSuggestions(suggestions) {
    if (!suggestions || suggestions.length === 0) return;
    set((state) => {
      const byProject = new Map<string, ConnectionSuggestion[]>();
      for (const suggestion of suggestions) {
        const existing = byProject.get(suggestion.projectId) ?? [];
        existing.push(suggestion);
        byProject.set(suggestion.projectId, existing);
      }

      const nextProjects = state.projects.map((project) => {
        const projectSuggestions = byProject.get(project.id);
        if (!projectSuggestions || projectSuggestions.length === 0) return project;

        const mapSuggestions = new Map<string, ConnectionSuggestion[]>();
        for (const suggestion of projectSuggestions) {
          const existing = mapSuggestions.get(suggestion.mapId) ?? [];
          existing.push(suggestion);
          mapSuggestions.set(suggestion.mapId, existing);
        }

        const nextMaps = { ...project.maps };
        let changed = false;
        for (const [mapId, list] of mapSuggestions.entries()) {
          const map = nextMaps[mapId];
          if (!map) continue;
          const existingEdgeKeys = new Set(map.edges.map((e) => `${e.source}->${e.target}`));
          const newEdges = [...map.edges];
          for (const suggestion of list) {
            const edgeKey = `${suggestion.sourceNodeId}->${suggestion.targetNodeId}`;
            if (existingEdgeKeys.has(edgeKey)) continue;
            existingEdgeKeys.add(edgeKey);
            newEdges.push({
              id: `e-${suggestion.sourceNodeId}-${suggestion.targetNodeId}-${newEdges.length + 1}`,
              source: suggestion.sourceNodeId,
              target: suggestion.targetNodeId,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#94a3b8', strokeWidth: 2 },
              label: 'link',
              labelStyle: { fontSize: 11, fontWeight: 600 },
            });
          }
          if (newEdges.length !== map.edges.length) {
            changed = true;
            nextMaps[mapId] = { ...map, edges: newEdges };
          }
        }

        if (!changed) return project;
        return {
          ...project,
          updatedAt: new Date().toISOString(),
          maps: nextMaps,
        };
      });

      return { projects: nextProjects };
    });
    get().persist();
  },

  finalizeProject(id) {
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, isDraft: false, description: p.description.replace('Draft — review and finalize', 'Imported from text') } : p,
      ),
    }));
    get().persist();
  },

  discardDraft(id) {
    get().deleteProject(id);
  },

  createFolder(name) {
    const folder: ProjectFolder = { id: nanoid(), name, createdAt: new Date().toISOString() };
    set((s) => ({ folders: [...s.folders, folder].sort((a, b) => a.name.localeCompare(b.name)) }));
    saveFolders(get().folders);
  },

  deleteFolder(id) {
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      projects: s.projects.map((p) => p.folderId === id ? { ...p, folderId: undefined } : p),
    }));
    saveFolders(get().folders);
    get().persist();
  },

  moveProjectToFolder(projectId, folderId) {
    set((s) => ({
      projects: s.projects.map((p) => p.id === projectId ? { ...p, folderId } : p),
    }));
    get().persist();
  },

  persist() {
    saveProjects(get().projects);
  },
}));
