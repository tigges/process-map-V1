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
  JourneyNodeData,
  JourneyNodeType,
} from '../types';
import { NODE_TYPE_CONFIG } from '../types';
import { createSampleProject } from '../data/sampleProject';
import { saveProjects, loadProjects } from '../utils/storage';

interface AppState {
  projects: ProcessMapProject[];
  activeProjectId: string | null;
  activeMapId: string | null;
  breadcrumb: string[];
  selectedNodeId: string | null;

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

  // Sub-map creation
  convertToSubprocess: (nodeId: string) => void;

  // Export / Import
  exportActiveProject: () => string;
  importProject: (json: string) => void;

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
  activeProjectId: null,
  activeMapId: null,
  breadcrumb: [],
  selectedNodeId: null,

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
    if (projects.length > 0) {
      set({
        projects,
        activeProjectId: projects[0].id,
        activeMapId: projects[0].rootMapId,
        breadcrumb: [projects[0].rootMapId],
      });
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

  persist() {
    saveProjects(get().projects);
  },
}));
