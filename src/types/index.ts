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
  | 'phase'
  | 'touchpoint'
  | 'action'
  | 'decision'
  | 'emotion'
  | 'painPoint'
  | 'opportunity'
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
  { label: string; color: string; icon: string }
> = {
  phase: { label: 'Phase', color: '#6366f1', icon: '📦' },
  touchpoint: { label: 'Touchpoint', color: '#0ea5e9', icon: '👆' },
  action: { label: 'Action', color: '#10b981', icon: '⚡' },
  decision: { label: 'Decision', color: '#f59e0b', icon: '🔀' },
  emotion: { label: 'Emotion', color: '#ec4899', icon: '💭' },
  painPoint: { label: 'Pain Point', color: '#ef4444', icon: '🔥' },
  opportunity: { label: 'Opportunity', color: '#8b5cf6', icon: '💡' },
  subprocess: { label: 'Sub-process', color: '#64748b', icon: '🔗' },
};
