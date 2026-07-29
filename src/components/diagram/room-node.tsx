'use client';

import * as React from 'react';
import { useStore, type Node, type NodeProps } from '@xyflow/react';
import type { DiagramNode } from '@/lib/diagram/build-graph';
import { STATUS_STROKE, ZONE_STYLE, hexToRgba } from '@/lib/diagram/style';
import { formatArea } from '@/lib/format';
import { cn } from '@/lib/utils';

export type RoomNodeData = DiagramNode & {
  dimmed: boolean;
  pinned: boolean;
  /** попало в «Проверки»: площадь вне диапазона, негде разместить и т. п. */
  flagged: boolean;
  /** помещение добавлено вручную */
  custom: boolean;
  /** окраска: по функциональной группе или по санитарной зоне */
  colorMode: 'group' | 'zone';
  /** назначенный этаж или null */
  floor: number | null;
  [key: string]: unknown;
};

export type RoomNodeType = Node<RoomNodeData, 'room'>;

/**
 * Начало протяжки новой связи. Собственный механизм вместо штатного:
 * соединения React Flow работают только после его внутреннего замера узлов,
 * а размеры кругов заданы нами явно, чтобы диаграмма рисовалась сразу.
 */
export const ConnectStartContext = React.createContext<
  ((nodeId: string, event: React.PointerEvent) => void) | null
>(null);

/** Порог, ниже которого подпись не помещается внутри круга и остаётся только код. */
const LABEL_RADIUS = 42;

/**
 * Ниже этого масштаба выноски под мелкими узлами не рисуются: подписи
 * соседних кругов начинают перекрываться и мешают читать саму диаграмму.
 */
const CALLOUT_MIN_ZOOM = 0.45;

export function RoomNode({ id, data, selected }: NodeProps<RoomNodeType>) {
  const startConnect = React.useContext(ConnectStartContext);
  const size = data.radius * 2;
  // Ручка связи должна оставаться одного размера на экране: содержимое холста
  // масштабируется, и на отдалении фиксированные 14 px превращаются в 5.
  const zoom = useStore((s) => s.transform[2]);
  const handleSize = Math.round(14 / Math.max(zoom, 0.2));
  const stroke = STATUS_STROKE[data.status];
  const unresolved = data.areaEach === null;
  const showLabel = data.radius >= LABEL_RADIUS;
  const tint = data.colorMode === 'zone' ? ZONE_STYLE[data.zone].color : data.group.color;

  return (
    <div
      className={cn('group relative transition-opacity', data.dimmed && 'opacity-20')}
      style={{ width: size, height: size }}
      title={`${data.label}${data.areaEach !== null ? ` · ${formatArea(data.areaEach)} м²` : ' · площадь не определена'}${data.count > 1 ? ` · ${data.count} шт` : ''}`}
    >
      <svg width={size} height={size} className="absolute inset-0 overflow-visible">
        <circle
          cx={data.radius}
          cy={data.radius}
          r={data.radius - stroke.width}
          fill={unresolved ? 'var(--app-raised)' : hexToRgba(tint, data.isGroupBubble ? 0.14 : 0.22)}
          stroke={unresolved ? 'var(--app-line-strong)' : tint}
          strokeWidth={stroke.width}
          strokeDasharray={unresolved ? '4 4' : stroke.dash || undefined}
        />
        {data.status === 'conditional' && !data.isGroupBubble ? (
          /* угловой маркер условности */
          <path
            d={`M ${data.radius * 1.55} ${data.radius * 0.34} l 10 0 l 0 10`}
            fill="none"
            stroke={tint}
            strokeWidth={2}
            strokeLinecap="square"
          />
        ) : null}
        {data.isGroupBubble ? (
          /* второй контур — признак свёрнутого блока */
          <circle
            cx={data.radius}
            cy={data.radius}
            r={data.radius - stroke.width - 5}
            fill="none"
            stroke={tint}
            strokeWidth={1}
            opacity={0.6}
          />
        ) : null}
        {data.flagged ? (
          <circle
            cx={data.radius}
            cy={data.radius}
            r={data.radius + 5}
            fill="none"
            stroke="var(--app-err)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        ) : null}
        {selected ? (
          <circle
            cx={data.radius}
            cy={data.radius}
            r={data.radius + 3}
            fill="none"
            stroke="var(--app-accent)"
            strokeWidth={1.5}
          />
        ) : null}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-1.5 text-center leading-tight">
        {showLabel ? (
          <>
            <span className="line-clamp-3 text-[11px] font-medium text-fg">{data.label}</span>
            <span className="num mt-0.5 text-[10px] text-muted">
              {unresolved ? '— м²' : `${formatArea(data.areaEach)} м²`}
            </span>
            {data.isGroupBubble ? (
              <span className="mt-0.5 text-[10px] text-muted">
                блок · {data.positions} поз. · клик разворачивает
              </span>
            ) : null}
          </>
        ) : (
          /* Мелкий узел: код для сверки с экспликацией и площадь — без неё
             круг ничего не сообщает о величине помещения. */
          <>
            <span className="num text-[10px] font-semibold text-fg">{data.code}</span>
            <span className="num text-[9px] leading-none text-muted">
              {unresolved ? '— м²' : `${formatArea(data.areaEach)} м²`}
            </span>
          </>
        )}
      </div>

      {/*
        Выноска для узлов, в которые подпись не поместилась. Без неё мелкие
        помещения читаются только по коду, и назначение приходится каждый раз
        искать в экспликации. Не перехватывает указатель, чтобы не мешать
        протяжке связей и попаданию по самому кругу.
      */}
      {!showLabel && zoom >= CALLOUT_MIN_ZOOM ? (
        <span
          className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-[116px] -translate-x-1/2 rounded-[2px] bg-bg/80 px-1 text-center text-[10px] leading-tight text-fg"
          style={{ textWrap: 'balance' }}
        >
          <span className="line-clamp-2">{data.label}</span>
        </span>
      ) : null}

      {data.floor !== null ? (
        <span
          className="num absolute -right-1 -bottom-1 rounded-[2px] border border-line bg-bg px-1 text-[9px] text-muted"
          title="Назначенный уровень"
        >
          {data.floor === -1 ? 'п' : data.floor === 0 ? 'ц' : data.floor}
        </span>
      ) : null}

      {data.count > 1 ? (
        <span className="num absolute -right-1 -top-1 rounded-full border border-line bg-bg px-1 text-[10px] text-muted">
          ×{data.count}
        </span>
      ) : null}

      {data.pinned ? (
        <span
          aria-hidden
          title="Узел закреплён"
          className="absolute -left-1 -top-1 size-2.5 rounded-full border border-bg bg-accent"
        />
      ) : null}

      {data.custom ? (
        <span
          aria-hidden
          title="Помещение добавлено вручную"
          className="num absolute -bottom-1 -left-1 rounded-[2px] border border-accent/50 bg-bg px-1 text-[9px] text-accent"
        >
          ЗД
        </span>
      ) : null}

      {/*
        Ручка для протяжки новой связи. Размер компенсирует масштаб холста:
        на отдалении фиксированные 14 px превращаются в 4 px, и попасть
        в них невозможно.
      */}
      {data.isGroupBubble ? null : (
      <button
        type="button"
        title="Потяните, чтобы создать связь"
        aria-label={`Создать связь от «${data.label}»`}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
          startConnect?.(id, event);
        }}
        className="nodrag nopan absolute top-1/2 rounded-full border-bg bg-accent opacity-40 transition-opacity hover:opacity-100 group-hover:opacity-100"
        style={{
          width: handleSize,
          height: handleSize,
          right: -handleSize / 2,
          marginTop: -handleSize / 2,
          borderWidth: Math.max(1, handleSize / 7),
          cursor: 'crosshair',
        }}
      />
      )}
    </div>
  );
}
