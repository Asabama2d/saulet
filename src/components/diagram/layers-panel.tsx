'use client';

import * as React from 'react';
import { ChevronDown, Eraser } from 'lucide-react';
import type { FlowType } from '@/types/knowledge';
import { FLOW_LABEL, ZONE_STYLE } from '@/lib/diagram/style';
import { useProjectStore } from '@/lib/store/project-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FLOWS = Object.keys(FLOW_LABEL) as FlowType[];

/**
 * Слои диаграммы: потоки, окраска по зонам, раскладка по этажам.
 * Фильтр по потокам не удаляет узлы, а приглушает остальное — маршрут виден
 * в контексте всего объекта, а не сам по себе.
 */
export function LayersPanel({ usedFlows }: { usedFlows: Set<FlowType> }) {
  const [open, setOpen] = React.useState(false);
  const flowFilter = useProjectStore((s) => s.flowFilter);
  const setFlowFilter = useProjectStore((s) => s.setFlowFilter);
  const colorMode = useProjectStore((s) => s.colorMode);
  const setColorMode = useProjectStore((s) => s.setColorMode);
  const layoutMode = useProjectStore((s) => s.layoutMode);
  const setLayoutMode = useProjectStore((s) => s.setLayoutMode);
  const clearFloors = useProjectStore((s) => s.clearFloors);
  const floorAssignment = useProjectStore((s) => s.floorAssignment);

  const toggleFlow = (flow: FlowType) =>
    setFlowFilter(
      flowFilter.includes(flow) ? flowFilter.filter((f) => f !== flow) : [...flowFilter, flow],
    );

  const assigned = Object.keys(floorAssignment).length;

  return (
    <div className={cn('pointer-events-auto rounded-[3px] border border-line bg-bg/95 backdrop-blur', open ? 'w-52' : 'w-28')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted hover:bg-raised"
      >
        <ChevronDown className={cn('size-3 transition-transform', !open && '-rotate-90')} />
        Слои
        {flowFilter.length > 0 ? (
          <span className="ml-auto rounded-[2px] bg-accent px-1 text-[10px] text-white">
            {flowFilter.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="flex flex-col gap-2.5 border-t border-line p-2">
          <section className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Потоки
              </span>
              {flowFilter.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setFlowFilter([])}
                  className="ml-auto text-[10px] text-accent hover:underline"
                >
                  сбросить
                </button>
              ) : null}
            </div>
            {FLOWS.filter((f) => usedFlows.has(f)).map((flow) => {
              const on = flowFilter.includes(flow);
              return (
                <button
                  key={flow}
                  type="button"
                  onClick={() => toggleFlow(flow)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-[2px] px-1 py-0.5 text-left text-[11px] hover:bg-raised',
                    on ? 'text-fg' : 'text-muted',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-2.5 shrink-0 rounded-[2px] border',
                      on ? 'border-accent bg-accent' : 'border-line',
                    )}
                  />
                  {FLOW_LABEL[flow]}
                </button>
              );
            })}
            {flowFilter.length === 0 ? (
              <p className="px-1 pt-0.5 text-[10px] leading-snug text-muted">
                Ничего не выбрано — показаны все связи.
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Окраска узлов
            </span>
            <div className="flex gap-1">
              <ModeButton active={colorMode === 'group'} onClick={() => setColorMode('group')}>
                По группам
              </ModeButton>
              <ModeButton active={colorMode === 'zone'} onClick={() => setColorMode('zone')}>
                По зонам
              </ModeButton>
            </div>
            {colorMode === 'zone' ? (
              <div className="mt-1 flex flex-col gap-0.5">
                {(['clean', 'dirty', 'neutral'] as const).map((zone) => (
                  <div key={zone} className="flex items-center gap-1.5 px-1 text-[11px]">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full border"
                      style={{
                        background: `${ZONE_STYLE[zone].color}59`,
                        borderColor: ZONE_STYLE[zone].color,
                      }}
                    />
                    {ZONE_STYLE[zone].label}
                  </div>
                ))}
                <p className="px-1 pt-0.5 text-[10px] leading-snug text-muted">
                  Прямая смежность чистой и грязной зон попадает в «Проверки».
                </p>
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Раскладка
            </span>
            <div className="flex gap-1">
              <ModeButton active={layoutMode === 'free'} onClick={() => setLayoutMode('free')}>
                Свободная
              </ModeButton>
              <ModeButton active={layoutMode === 'floors'} onClick={() => setLayoutMode('floors')}>
                По этажам
              </ModeButton>
            </div>
            {layoutMode === 'floors' ? (
              <>
                <p className="px-1 pt-1 text-[10px] leading-snug text-muted">
                  Перетащите узел в дорожку нужного уровня. Ограничения по этажам проверяются
                  сразу.
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 self-start"
                  disabled={assigned === 0}
                  onClick={clearFloors}
                >
                  <Eraser className="size-3.5" />
                  Снять назначения ({assigned})
                </Button>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-[2px] border px-1.5 py-0.5 text-[11px]',
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-raised',
      )}
    >
      {children}
    </button>
  );
}
