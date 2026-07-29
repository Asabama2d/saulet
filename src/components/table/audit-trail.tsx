'use client';

import { AlertTriangle } from 'lucide-react';
import type { RoomInstance } from '@/lib/engine/types';
import { SourceIcon } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/lib/store/project-store';

/**
 * Раскрывающийся блок расчёта. Без него строка не считается готовой:
 * формула, ссылка на норму и указание, откуда взять непроверенное число.
 */
export function AuditTrail({ instance }: { instance: RoomInstance }) {
  const setOverride = useProjectStore((s) => s.setOverride);
  const clearOverride = useProjectStore((s) => s.clearOverride);
  const override = useProjectStore((s) => s.overrides[instance.key]);
  const { audit, room } = instance;

  return (
    // Блок расчёта прилипает к левому краю: таблица шире экрана, и обоснование
    // не должно уезжать за границу вместе с колонками.
    <div className="sticky left-0 w-[calc(100vw-42rem)] min-w-[560px] border-t border-line bg-panel px-3 py-2 text-[12px]">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Расчёт</div>
          <div className="num rounded-[3px] border border-line bg-bg px-2 py-1.5">{audit.formula}</div>
          <dl className="mt-1 grid grid-cols-[92px_1fr] gap-x-2 gap-y-0.5">
            {audit.steps.map((step, index) => (
              <div key={index} className="contents">
                <dt className="text-muted">{step.label}</dt>
                <dd className="num">{step.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Обоснование
            <SourceIcon source={audit.source} />
          </div>

          {audit.norm ? (
            <div className="rounded-[3px] border border-line bg-bg px-2 py-1.5">
              <div className="font-medium">
                {audit.norm.doc}, {audit.norm.clause}
              </div>
              {audit.norm.edition ? (
                <div className="text-[11px] text-muted">{audit.norm.edition}</div>
              ) : null}
              {audit.norm.quote ? (
                <div className="mt-1 border-l-2 border-line pl-2 text-[11px] italic text-muted">
                  {audit.norm.quote}
                </div>
              ) : null}
              {!audit.norm.verified ? (
                <div className="mt-1 flex items-start gap-1 text-[11px] text-warn">
                  <AlertTriangle className="mt-px size-3 shrink-0" />
                  Ссылка не сверена с первоисточником
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hatched rounded-[3px] border border-warn/40 px-2 py-1.5">
              <div className="flex items-start gap-1 font-medium text-warn">
                <AlertTriangle className="mt-px size-3 shrink-0" />
                Норма не указана
              </div>
              {audit.sourceHint ? (
                <p className="mt-1 leading-snug text-fg">{audit.sourceHint}</p>
              ) : null}
            </div>
          )}

          {room.notes ? <p className="leading-snug text-muted">{room.notes}</p> : null}

          <div className="mt-1 flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Комментарий к правке
            </label>
            <textarea
              rows={2}
              value={override?.note ?? ''}
              placeholder="Обоснование отступления или источник значения"
              onChange={(e) => setOverride(instance.key, { note: e.target.value })}
              className="w-full resize-y rounded-[3px] border border-line bg-bg px-2 py-1 text-[12px]"
            />
            {instance.overridden ? (
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => clearOverride(instance.key)}
              >
                Вернуть расчётное значение
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-1.5 text-[11px] text-muted">
        <span>
          Освещение:{' '}
          {room.constraints.daylight === 'required'
            ? 'естественное обязательно'
            : room.constraints.daylight === 'desirable'
              ? 'естественное желательно'
              : 'без естественного'}
        </span>
        {room.constraints.minHeight ? <span>Высота в чистоте: {room.constraints.minHeight} м</span> : null}
        {room.constraints.orientation ? <span>Ориентация: {room.constraints.orientation}</span> : null}
        {room.constraints.separateEntrance ? <span>Самостоятельный наружный вход</span> : null}
        {room.constraints.wetZone ? <span>Мокрая зона</span> : null}
        <span>Зона: {room.zone === 'clean' ? 'чистая' : room.zone === 'dirty' ? 'грязная' : 'нейтральная'}</span>
        {room.flows.length > 0 ? <span>Потоки: {room.flows.join(', ')}</span> : null}
      </div>
    </div>
  );
}
