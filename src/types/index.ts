import type { Node, Edge } from '@xyflow/react';

export interface ProcessMapProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  rootMapId: string;
  maps: Record<string, ProcessMap>;
  isDraft?: boolean;
  folderId?: string;
}

export interface ProjectFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProcessMap {
  id: string;
  name: string;
  description: string;
  parentMapId: string | null;
  parentNodeId: string | null;
  nodes: Node<JourneyNodeData>[];
  edges: Edge[];
}

export type JourneyNodeType =
  | 'start'
  | 'action'
  | 'decision'
  | 'end'
  | 'subprocess';

export interface JourneyNodeData {
  label: string;
  description: string;
  nodeType: JourneyNodeType;
  color: string;
  subMapId?: string;
  [key: string]: unknown;
}

export const NODE_TYPE_CONFIG: Record<
  JourneyNodeType,
  { label: string; color: string; icon: string; shape: string }
> = {
  start: { label: 'Start', color: '#22c55e', icon: '▶', shape: 'circle' },
  action: { label: 'Action', color: '#3b82f6', icon: '■', shape: 'rectangle' },
  decision: { label: 'Decision', color: '#eab308', icon: '◆', shape: 'diamond' },
  end: { label: 'End', color: '#ef4444', icon: '●', shape: 'circle' },
  subprocess: { label: 'Sub-process', color: '#64748b', icon: '▭', shape: 'rectangle' },
};
