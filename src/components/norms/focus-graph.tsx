'use client';

import { useLayoutEffect, useRef } from 'react';
import { ArrowUpRight, Focus, SlidersHorizontal } from 'lucide-react';

export interface FocusNode { id: string; label: string; detail?: string; kind: 'topic' | 'facet' }
interface Props {
  center: FocusNode; neighbors: FocusNode[]; onSelect: (node: FocusNode) => void;
  onCenter: () => void; busy: boolean;
}
const positions = [[22, 17], [78, 17], [17, 50], [83, 50], [22, 83], [78, 83]];

export function FocusGraph({ center, neighbors, onSelect, onCenter, busy }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const previous = useRef(new Map<string, { left: number; top: number }>());
  const nodes = [{ node: center, x: 50, y: 50, central: true }, ...neighbors.slice(0, 6).map((node, i) => ({ node, x: positions[i][0], y: positions[i][1], central: false }))];
  // FLIP animates the actual clicked node into the center. Positions and edges
  // settle once per interaction; nothing keeps moving while a source is read.
  useLayoutEffect(() => {
    const elements = wrap.current?.querySelectorAll<HTMLElement>('[data-focus-node]');
    const current = new Map<string, { left: number; top: number }>();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animations: Animation[] = [];
    elements?.forEach((el) => {
      const point = { left: el.offsetLeft, top: el.offsetTop };
      const old = previous.current.get(el.dataset.focusNode!);
      current.set(el.dataset.focusNode!, point);
      if (!reduced && previous.current.size) {
        const dx = (old?.left ?? point.left) - point.left, dy = (old?.top ?? point.top) - point.top;
        animations.push(el.animate([
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`, opacity: old ? 1 : 0 },
          { transform: 'translate(-50%, -50%)', opacity: 1 },
        ], { duration: 300, easing: 'cubic-bezier(.2,.7,.2,1)' }));
      }
    });
    previous.current = current;
    return () => animations.forEach((animation) => animation.cancel());
  }, [center, neighbors]);

  return <div ref={wrap} className="norm-focus-graph" aria-label="Ближайшие связи темы" aria-busy={busy}>
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {nodes.filter((n) => !n.central).map(({ node, x, y }) => <line key={node.id} x1="50%" y1="50%" x2={`${x}%`} y2={`${y}%`} stroke="var(--app-line)" strokeWidth="1" />)}
    </svg>
    {nodes.map(({ node, x, y, central }) => <div key={node.id} data-focus-node={node.id} className={`norm-focus-position ${central ? 'norm-focus-center' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}>
      <button type="button" className={`norm-focus-node ${central ? 'is-center' : ''}`} onClick={() => central ? onCenter() : onSelect(node)} aria-label={central && node.id !== 'home' ? `${node.label}: показать пункты` : node.label}>
        {central ? <Focus size={18} aria-hidden="true" /> : node.kind === 'facet' ? <SlidersHorizontal size={14} aria-hidden="true" /> : <ArrowUpRight size={14} aria-hidden="true" />}
        <span>{node.label}</span>
        {node.detail && <span className="norm-focus-detail">{node.detail}</span>}
      </button>
    </div>)}
  </div>;
}
