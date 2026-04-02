import { useContext, useMemo, useCallback } from 'react';
import { NumbersContext, SearchTermContext } from '../contexts';
import { useAppStore } from '../store/useAppStore';

function highlightSearch(text: string, term: string): React.ReactNode {
  if (!term || term.length < 2) return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="jnode__highlight">{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </>
  );
}

const XREF_PATTERN = /(\b\d+\.\d+(?:\.\d+)?\b)/g;

export default function CrossRefText({ text }: { text: string }) {
  const nodeNumbers = useContext(NumbersContext);
  const searchTerm = useContext(SearchTermContext);
  const navigateToNode = useAppStore((s) => s.navigateToNode);

  const reverseMap = useMemo(() => {
    const map = new Map<string, string>();
    nodeNumbers.forEach((num, id) => map.set(num, id));
    return map;
  }, [nodeNumbers]);

  const handleClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      e.preventDefault();
      navigateToNode(nodeId);
    },
    [navigateToNode],
  );

  const parts = text.split(XREF_PATTERN);

  return (
    <>
      {parts.map((part, i) => {
        const nodeId = reverseMap.get(part);
        if (nodeId) {
          return (
            <button
              key={i}
              className="jnode__xref"
              onClick={(e) => handleClick(e, nodeId)}
              title={`Go to ${part}`}
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{highlightSearch(part, searchTerm)}</span>;
      })}
    </>
  );
}
