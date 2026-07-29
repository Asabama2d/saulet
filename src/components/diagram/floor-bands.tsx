'use client';

import { ViewportPortal } from '@xyflow/react';

export interface FloorBand {
  /** null — «не назначено» */
  floor: number | null;
  label: string;
  /** центр дорожки в координатах холста */
  y: number;
}

/** Подложка режима «по этажам»: горизонтальные дорожки-свимлейны. */
export function FloorBands({
  bands,
  height,
  width,
  left,
}: {
  bands: FloorBand[];
  height: number;
  width: number;
  left: number;
}) {
  return (
    <ViewportPortal>
      <svg
        width={1}
        height={1}
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        {bands.map((band, index) => (
          <g key={band.floor ?? 'none'}>
            <rect
              x={left}
              y={band.y - height / 2}
              width={width}
              height={height}
              fill={index % 2 === 0 ? 'var(--app-panel)' : 'transparent'}
              opacity={0.7}
            />
            <line
              x1={left}
              y1={band.y - height / 2}
              x2={left + width}
              y2={band.y - height / 2}
              stroke="var(--app-line)"
              strokeWidth={1}
            />
            <text
              x={left + 12}
              y={band.y - height / 2 + 22}
              fill="var(--app-muted)"
              fontSize={14}
              fontWeight={600}
              style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              {band.label}
            </text>
          </g>
        ))}
      </svg>
    </ViewportPortal>
  );
}
