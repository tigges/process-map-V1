import { nanoid } from 'nanoid';
import type { ProcessMapProject, ProcessMap, JourneyNodeData } from '../types';
import type { Node, Edge } from '@xyflow/react';

function makeNode(
  id: string,
  x: number,
  y: number,
  data: JourneyNodeData,
): Node<JourneyNodeData> {
  return { id, type: 'journeyNode', position: { x, y }, data };
}

function makeEdge(
  source: string,
  target: string,
  label?: string,
): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    label,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#94a3b8', strokeWidth: 2 },
  };
}

export function createSampleProject(): ProcessMapProject {
  const projectId = nanoid();
  const rootMapId = nanoid();
  const regSubMapId = nanoid();
  const onboardSubMapId = nanoid();

  const rootNodes: Node<JourneyNodeData>[] = [
    makeNode('awareness', 0, 0, {
      label: 'Awareness',
      description: 'User discovers the product through marketing, ads, or word-of-mouth',
      nodeType: 'phase',
      color: '#6366f1',
    }),
    makeNode('consideration', 300, 0, {
      label: 'Consideration',
      description: 'User evaluates the product, compares alternatives',
      nodeType: 'phase',
      color: '#6366f1',
    }),
    makeNode('registration', 600, 0, {
      label: 'Registration',
      description: 'User creates an account (click to deep-dive)',
      nodeType: 'subprocess',
      color: '#64748b',
      subMapId: regSubMapId,
    }),
    makeNode('onboarding', 900, 0, {
      label: 'Onboarding',
      description: 'First-time user experience and setup (click to deep-dive)',
      nodeType: 'subprocess',
      color: '#64748b',
      subMapId: onboardSubMapId,
    }),
    makeNode('engagement', 1200, 0, {
      label: 'Engagement',
      description: 'Active usage of the product',
      nodeType: 'phase',
      color: '#6366f1',
    }),
    makeNode('retention', 1500, 0, {
      label: 'Retention',
      description: 'Continued loyalty and repeat usage',
      nodeType: 'phase',
      color: '#6366f1',
    }),
    makeNode('ad-touchpoint', 100, 150, {
      label: 'Sees Ad',
      description: 'User sees an advertisement on social media',
      nodeType: 'touchpoint',
      color: '#0ea5e9',
    }),
    makeNode('curiosity', 100, 300, {
      label: 'Curious',
      description: 'User feels intrigued',
      nodeType: 'emotion',
      color: '#ec4899',
    }),
    makeNode('compare', 400, 150, {
      label: 'Compare Options',
      description: 'User researches and compares competitor products',
      nodeType: 'action',
      color: '#10b981',
    }),
    makeNode('pricing-pain', 400, 300, {
      label: 'Pricing Confusion',
      description: 'Unclear pricing tiers frustrate the user',
      nodeType: 'painPoint',
      color: '#ef4444',
    }),
    makeNode('simplify-pricing', 500, 450, {
      label: 'Simplify Pricing Page',
      description: 'Opportunity to improve pricing clarity',
      nodeType: 'opportunity',
      color: '#8b5cf6',
    }),
    makeNode('decide-signup', 600, 150, {
      label: 'Decide to Sign Up?',
      description: 'Does the user proceed with registration?',
      nodeType: 'decision',
      color: '#f59e0b',
    }),
    makeNode('active-use', 1300, 150, {
      label: 'Daily Active Use',
      description: 'User engages with core features daily',
      nodeType: 'action',
      color: '#10b981',
    }),
    makeNode('loyalty', 1600, 150, {
      label: 'Loyalty Program',
      description: 'User participates in rewards and referrals',
      nodeType: 'touchpoint',
      color: '#0ea5e9',
    }),
  ];

  const rootEdges: Edge[] = [
    makeEdge('awareness', 'consideration'),
    makeEdge('consideration', 'registration'),
    makeEdge('registration', 'onboarding'),
    makeEdge('onboarding', 'engagement'),
    makeEdge('engagement', 'retention'),
    makeEdge('awareness', 'ad-touchpoint'),
    makeEdge('ad-touchpoint', 'curiosity'),
    makeEdge('consideration', 'compare'),
    makeEdge('compare', 'pricing-pain'),
    makeEdge('pricing-pain', 'simplify-pricing'),
    makeEdge('compare', 'decide-signup'),
    makeEdge('decide-signup', 'registration', 'Yes'),
    makeEdge('engagement', 'active-use'),
    makeEdge('retention', 'loyalty'),
  ];

  const regNodes: Node<JourneyNodeData>[] = [
    makeNode('reg-start', 0, 0, {
      label: 'Start Registration',
      description: 'User clicks Sign Up button',
      nodeType: 'action',
      color: '#10b981',
    }),
    makeNode('reg-form', 300, 0, {
      label: 'Fill Form',
      description: 'User enters email, password, personal details',
      nodeType: 'action',
      color: '#10b981',
    }),
    makeNode('reg-verify', 600, 0, {
      label: 'Email Verification',
      description: 'User verifies their email address',
      nodeType: 'touchpoint',
      color: '#0ea5e9',
    }),
    makeNode('reg-complete', 900, 0, {
      label: 'Account Created',
      description: 'Registration successful',
      nodeType: 'phase',
      color: '#6366f1',
    }),
    makeNode('reg-frustration', 350, 150, {
      label: 'Too Many Fields',
      description: 'Long form causes drop-off',
      nodeType: 'painPoint',
      color: '#ef4444',
    }),
    makeNode('reg-social', 350, 300, {
      label: 'Add Social Login',
      description: 'Opportunity: reduce friction with OAuth',
      nodeType: 'opportunity',
      color: '#8b5cf6',
    }),
  ];

  const regEdges: Edge[] = [
    makeEdge('reg-start', 'reg-form'),
    makeEdge('reg-form', 'reg-verify'),
    makeEdge('reg-verify', 'reg-complete'),
    makeEdge('reg-form', 'reg-frustration'),
    makeEdge('reg-frustration', 'reg-social'),
  ];

  const onboardNodes: Node<JourneyNodeData>[] = [
    makeNode('ob-welcome', 0, 0, {
      label: 'Welcome Screen',
      description: 'User sees welcome message and tutorial prompt',
      nodeType: 'touchpoint',
      color: '#0ea5e9',
    }),
    makeNode('ob-tutorial', 300, 0, {
      label: 'Interactive Tutorial',
      description: 'Guided walkthrough of key features',
      nodeType: 'action',
      color: '#10b981',
    }),
    makeNode('ob-decide', 600, 0, {
      label: 'Skip Tutorial?',
      description: 'User decides whether to skip the tutorial',
      nodeType: 'decision',
      color: '#f59e0b',
    }),
    makeNode('ob-profile', 900, -80, {
      label: 'Setup Profile',
      description: 'User configures preferences and profile',
      nodeType: 'action',
      color: '#10b981',
    }),
    makeNode('ob-explore', 900, 80, {
      label: 'Free Explore',
      description: 'User explores on their own',
      nodeType: 'action',
      color: '#10b981',
    }),
    makeNode('ob-complete', 1200, 0, {
      label: 'Onboarding Complete',
      description: 'User is ready to use the product',
      nodeType: 'phase',
      color: '#6366f1',
    }),
    makeNode('ob-delight', 150, 150, {
      label: 'Excited!',
      description: 'User feels positive about the product',
      nodeType: 'emotion',
      color: '#ec4899',
    }),
  ];

  const onboardEdges: Edge[] = [
    makeEdge('ob-welcome', 'ob-tutorial'),
    makeEdge('ob-tutorial', 'ob-decide'),
    makeEdge('ob-decide', 'ob-profile', 'No'),
    makeEdge('ob-decide', 'ob-explore', 'Skip'),
    makeEdge('ob-profile', 'ob-complete'),
    makeEdge('ob-explore', 'ob-complete'),
    makeEdge('ob-welcome', 'ob-delight'),
  ];

  const rootMap: ProcessMap = {
    id: rootMapId,
    name: 'User Journey Overview',
    description: 'High-level user journey from awareness to retention',
    parentMapId: null,
    parentNodeId: null,
    nodes: rootNodes,
    edges: rootEdges,
  };

  const regMap: ProcessMap = {
    id: regSubMapId,
    name: 'Registration Flow',
    description: 'Detailed registration subprocess',
    parentMapId: rootMapId,
    parentNodeId: 'registration',
    nodes: regNodes,
    edges: regEdges,
  };

  const onboardMap: ProcessMap = {
    id: onboardSubMapId,
    name: 'Onboarding Flow',
    description: 'Detailed onboarding subprocess',
    parentMapId: rootMapId,
    parentNodeId: 'onboarding',
    nodes: onboardNodes,
    edges: onboardEdges,
  };

  return {
    id: projectId,
    name: 'Sample User Journey',
    description: 'A sample project demonstrating the process map editor with sub-processes',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rootMapId,
    maps: {
      [rootMapId]: rootMap,
      [regSubMapId]: regMap,
      [onboardSubMapId]: onboardMap,
    },
  };
}
