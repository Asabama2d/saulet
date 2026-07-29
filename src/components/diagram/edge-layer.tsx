'use client';

import { ViewportPortal } from '@xyflow/react';
import type { DiagramEdge } from '@/lib/diagram/build-graph';
import { EDGE_STYLE, TONE_VAR } from '@/lib/diagram/style';

/**
 * Собственный слой связей поверх координат React Flow.
 *
 * Штатный рендер рёбер требует внутреннего замера узлов и привязки к ручкам —
 * для пузырьковой диаграммы это лишнее звено: линии идут между центрами
 * кругов и подрезаются по радиусам, которые нам уже известны. Слой живёт
 * внутри `ViewportPortal`, поэтому едет и масштабируется вместе с холстом.
 */

export interface EdgeGeometry {
  edge: DiagramEdge;
  from: { x: number; y: number };
  to: { x: number; y: number };
  radiusFrom: number;
  radiusTo: number;
  dimmed: boolean;
}

/** Разрыв в середине линии для разнесённых помещений, px. */
const GAP_HALF = 18;
/** Ширина невидимой полосы попадания курсора, px. */
const HIT_WIDTH = 14;

function EdgeShape({
  edge,
  from,
  to,
  radiusFrom,
  radiusTo,
  dimmed,
  selected,
  onSelect,
}: EdgeGeometry & { selected: boolean; onSelect: (edge: DiagramEdge) => void }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;

  // Линия не заходит внутрь кругов
  const start = { x: from.x + ux * radiusFrom, y: from.y + uy * radiusFrom };
  const end = { x: to.x - ux * radiusTo, y: to.y - uy * radiusTo };
  if (length <= radiusFrom + radiusTo) return null;

  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const style = EDGE_STYLE[edge.type];
  const color = selected
    ? 'var(--app-accent)'
    : edge.edited || edge.deviation
      ? 'var(--app-warn)'
      : TONE_VAR[style.tone];
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const straight = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const gapped =
    `M ${start.x} ${start.y} L ${mid.x - ux * GAP_HALF} ${mid.y - uy * GAP_HALF} ` +
    `M ${mid.x + ux * GAP_HALF} ${mid.y + uy * GAP_HALF} L ${end.x} ${end.y}`;

  return (
    <g opacity={dimmed ? 0.07 : 1}>
      {selected ? (
        <path d={straight} fill="none" stroke="var(--app-accent)" strokeWidth={style.width + 7} opacity={0.22} />
      ) : null}
      <path
        d={style.gap ? gapped : straight}
        fill="none"
        stroke={color}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
        strokeLinecap="round"
      />
      {style.double ? (
        <path
          d={straight}
          fill="none"
          stroke="var(--app-bg)"
          strokeWidth={style.width - 2}
          strokeLinecap="round"
        />
      ) : null}
      {style.square ? (
        <rect
          x={mid.x - 5}
          y={mid.y - 5}
          width={10}
          height={10}
          fill="var(--app-bg)"
          stroke={color}
          strokeWidth={1.4}
          transform={`rotate(${angle} ${mid.x} ${mid.y})`}
        />
      ) : null}
      {style.cross ? (
        <g stroke={color} strokeWidth={2} strokeLinecap="round">
          <line x1={mid.x - 6} y1={mid.y - 6} x2={mid.x + 6} y2={mid.y + 6} />
          <line x1={mid.x - 6} y1={mid.y + 6} x2={mid.x + 6} y2={mid.y - 6} />
        </g>
      ) : null}

      {/* Полоса попадания: линии тонкие, кликнуть по ним иначе невозможно */}
      <path
        d={straight}
        fill="none"
        stroke="transparent"
        strokeWidth={HIT_WIDTH}
        strokeLinecap="round"
        style={{ pointerEvents: dimmed ? 'none' : 'stroke', cursor: 'pointer' }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(edge);
        }}
        // Клик гасится отдельно: иначе он всплывает до холста React Flow,
        // тот считает его кликом по пустому месту и снимает выделение.
        onClick={(event) => event.stopPropagation()}
      >
        <title>{`${style.label}: ${edge.reason}${edge.normLabel ? ` · ${edge.normLabel}` : ''}`}</title>
      </path>
    </g>
  );
}

export function EdgeLayer({
  items,
  selectedId,
  onSelect,
}: {
  items: EdgeGeometry[];
  selectedId: string | null;
  onSelect: (edge: DiagramEdge) => void;
}) {
  return (
    <ViewportPortal>
      <svg
        width={1}
        height={1}
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        {items.map((item) => (
          <EdgeShape
            key={item.edge.id}
            {...item}
            selected={item.edge.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </svg>
    </ViewportPortal>
  );
}
