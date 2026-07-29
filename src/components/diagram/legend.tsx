'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import type { AdjacencyType, RoomGroup, Status } from '@/types/knowledge';
import { EDGE_STYLE, STATUS_STROKE, TONE_VAR, hexToRgba } from '@/lib/diagram/style';
import { cn } from '@/lib/utils';

function EdgeSample({ type }: { type: AdjacencyType }) {
  const style = EDGE_STYLE[type];
  const color = TONE_VAR[style.tone];
  return (
    <svg width={38} height={12} className="shrink-0">
      {style.gap ? (
        <>
          <line x1={0} y1={6} x2={13} y2={6} stroke={color} strokeWidth={style.width} strokeDasharray={style.dash} />
          <line x1={25} y1={6} x2={38} y2={6} stroke={color} strokeWidth={style.width} strokeDasharray={style.dash} />
        </>
      ) : (
        <line
          x1={0}
          y1={6}
          x2={38}
          y2={6}
          stroke={color}
          strokeWidth={style.width}
          strokeDasharray={style.dash}
        />
      )}
      {style.double ? (
        <line x1={0} y1={6} x2={38} y2={6} stroke="var(--app-bg)" strokeWidth={style.width - 2} />
      ) : null}
      {style.square ? (
        <rect x={14} y={1} width={10} height={10} fill="var(--app-bg)" stroke={color} strokeWidth={1.4} />
      ) : null}
      {style.cross ? (
        <g stroke={color} strokeWidth={2} strokeLinecap="round">
          <line x1={13} y1={1} x2={25} y2={11} />
          <line x1={13} y1={11} x2={25} y2={1} />
        </g>
      ) : null}
    </svg>
  );
}

function StatusSample({ status }: { status: Status }) {
  const stroke = STATUS_STROKE[status];
  return (
    <svg width={16} height={16} className="shrink-0">
      <circle
        cx={8}
        cy={8}
        r={6}
        fill="none"
        stroke="var(--app-fg)"
        strokeWidth={stroke.width}
        strokeDasharray={stroke.dash || undefined}
      />
      {status === 'conditional' ? (
        <path d="M 12 3 l 3 0 l 0 3" fill="none" stroke="var(--app-fg)" strokeWidth={1.6} />
      ) : null}
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  );
}

export function Legend({
  groups,
  hidden,
  onToggle,
  collapsed,
  onToggleCollapsed,
}: {
  groups: RoomGroup[];
  hidden: Set<string>;
  onToggle: (groupId: string) => void;
  collapsed: string[];
  onToggleCollapsed: (groupId: string) => void;
}) {
  const [open, setOpen] = React.useState(true);

  return (
    <div className="pointer-events-auto w-56 rounded-[3px] border border-line bg-bg/95 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted hover:bg-raised"
      >
        <ChevronDown className={cn('size-3 transition-transform', !open && '-rotate-90')} />
        Легенда
      </button>

      {open ? (
        <div className="flex max-h-[calc(100vh-9rem)] flex-col gap-2.5 overflow-y-auto border-t border-line p-2">
          <Section title="Функциональные группы">
            {groups.map((group) => {
              const off = hidden.has(group.id);
              const isCollapsed = collapsed.includes(group.id);
              return (
                <div key={group.id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onToggle(group.id)}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-1.5 rounded-[2px] px-1 py-0.5 text-left text-[11px] hover:bg-raised',
                      off && 'opacity-40',
                    )}
                    title={off ? 'Показать группу' : 'Приглушить группу'}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full border"
                      style={{
                        background: hexToRgba(group.color, 0.35),
                        borderColor: group.color,
                      }}
                    />
                    <span className="truncate">{group.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleCollapsed(group.id)}
                    title={
                      isCollapsed
                        ? 'Развернуть блок в отдельные помещения'
                        : 'Свернуть блок в один пузырь'
                    }
                    aria-label={isCollapsed ? 'Развернуть блок' : 'Свернуть блок'}
                    className={cn(
                      'shrink-0 rounded-[2px] border px-1 text-[10px] leading-4',
                      isCollapsed
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-line text-muted hover:bg-raised',
                    )}
                  >
                    {isCollapsed ? '▣' : '▢'}
                  </button>
                </div>
              );
            })}
          </Section>

          <Section title="Статус помещения">
            {(['required', 'conditional', 'recommended', 'optional'] as Status[]).map((status) => (
              <div key={status} className="flex items-center gap-1.5 px-1 text-[11px]">
                <StatusSample status={status} />
                <span>{STATUS_STROKE[status].label}</span>
              </div>
            ))}
          </Section>

          <Section title="Типы связей">
            {(Object.keys(EDGE_STYLE) as AdjacencyType[]).map((type) => (
              <div key={type} className="flex items-center gap-1.5 px-1 text-[11px]">
                <EdgeSample type={type} />
                <span className="leading-tight">{EDGE_STYLE[type].label}</span>
              </div>
            ))}
          </Section>

          <Section title="Размер">
            <p className="px-1 text-[11px] leading-snug text-muted">
              Радиус пропорционален √площади помещения. Пунктирный серый контур — площадь не
              определена.
            </p>
          </Section>
        </div>
      ) : null}
    </div>
  );
}
