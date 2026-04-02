import { toPng, toSvg } from 'html-to-image';
import type { ProcessMap, JourneyNodeData } from '../types';

export async function exportCanvasPng(element: HTMLElement): Promise<void> {
  const dataUrl = await toPng(element, {
    backgroundColor: '#f8fafc',
    pixelRatio: 2,
    filter: (node) => {
      if (node instanceof HTMLElement) {
        return !node.classList?.contains('react-flow__minimap') &&
               !node.classList?.contains('react-flow__controls');
      }
      return true;
    },
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'processmap-export.png';
  a.click();
}

export async function exportCanvasSvg(element: HTMLElement): Promise<void> {
  const dataUrl = await toSvg(element, {
    backgroundColor: '#f8fafc',
    filter: (node) => {
      if (node instanceof HTMLElement) {
        return !node.classList?.contains('react-flow__minimap') &&
               !node.classList?.contains('react-flow__controls');
      }
      return true;
    },
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'processmap-export.svg';
  a.click();
}

export function exportMermaid(map: ProcessMap): string {
  const lines: string[] = ['flowchart LR'];
  const nodeIds = new Map<string, string>();

  map.nodes.forEach((node, i) => {
    const d = node.data as JourneyNodeData;
    const safeId = `N${i}`;
    nodeIds.set(node.id, safeId);
    const label = d.label.replace(/"/g, "'");

    switch (d.nodeType) {
      case 'start':
        lines.push(`  ${safeId}(("${label}"))`);
        break;
      case 'end':
        lines.push(`  ${safeId}(("${label}"))`);
        break;
      case 'decision':
        lines.push(`  ${safeId}{"${label}"}`);
        break;
      case 'subprocess':
        lines.push(`  ${safeId}[["${label}"]]`);
        break;
      default:
        lines.push(`  ${safeId}["${label}"]`);
    }
  });

  for (const edge of map.edges) {
    const src = nodeIds.get(edge.source);
    const tgt = nodeIds.get(edge.target);
    if (!src || !tgt) continue;
    if (edge.label) {
      lines.push(`  ${src} -->|"${edge.label}"| ${tgt}`);
    } else {
      lines.push(`  ${src} --> ${tgt}`);
    }
  }

  return lines.join('\n');
}

export function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
