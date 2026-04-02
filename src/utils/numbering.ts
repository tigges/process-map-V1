import type { ProcessMapProject, JourneyNodeData } from '../types';

export interface NodeNumber {
  nodeId: string;
  mapId: string;
  number: string;
}

export function generateNodeNumbers(project: ProcessMapProject): Map<string, string> {
  const numberMap = new Map<string, string>();

  const rootMap = project.maps[project.rootMapId];
  if (!rootMap) return numberMap;

  rootMap.nodes.forEach((node, i) => {
    const d = node.data as JourneyNodeData;
    const catNum = `${i + 1}`;
    numberMap.set(node.id, catNum);

    if (d.nodeType === 'subprocess' && d.subMapId) {
      const subMap = project.maps[d.subMapId];
      if (!subMap) return;

      subMap.nodes.forEach((subNode, j) => {
        const sd = subNode.data as JourneyNodeData;
        if (sd.nodeType === 'start' || sd.nodeType === 'end') return;
        const stepNum = `${catNum}.${j + 1}`;
        numberMap.set(subNode.id, stepNum);

        if (sd.nodeType === 'subprocess' && sd.subMapId) {
          const deepMap = project.maps[sd.subMapId];
          if (!deepMap) return;

          deepMap.nodes.forEach((deepNode, k) => {
            const dd = deepNode.data as JourneyNodeData;
            if (dd.nodeType === 'start' || dd.nodeType === 'end') return;
            numberMap.set(deepNode.id, `${stepNum}.${k + 1}`);
          });
        }
      });
    }
  });

  return numberMap;
}
