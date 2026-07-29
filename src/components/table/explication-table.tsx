'use client';

import * as React from 'react';
import { ChevronRight, Pencil, Plus, Search } from 'lucide-react';
import type { GroupTotal, RoomInstance } from '@/lib/engine/types';
import { useComputation } from '@/lib/engine/use-computation';
import { useProjectStore } from '@/lib/store/project-store';
import { OriginBadge, StatusBadge } from '@/components/ui/badges';
import { NumberInput, Tooltip } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { RoomDialog } from '@/components/diagram/room-dialog';
import { formatArea, formatInt, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AuditTrail } from './audit-trail';

// Наименование и нормативное обоснование — самые длинные тексты таблицы.
// Им отданы гибкие колонки с увеличенным минимумом, а сам текст переносится
// на две строки: в одну строку с многоточием у большинства помещений
// пропадала содержательная часть названия и номер пункта нормы.
const GRID =
  'grid grid-cols-[22px_56px_minmax(220px,1.5fr)_46px_96px_96px_118px_66px_minmax(180px,1fr)] items-center gap-x-2';

function floorsLabel(instance: RoomInstance): string {
  const { floorsAllowed, floorsForbidden } = instance.room.constraints;
  if (floorsAllowed?.length) return floorsAllowed.join(', ');
  if (floorsForbidden?.length) return `не ${floorsForbidden.join(', ')}`;
  return 'любой';
}

function normLabel(instance: RoomInstance): string {
  const norm = instance.audit.norm;
  if (norm) return `${norm.doc}, ${norm.clause}`;
  return instance.audit.sourceHint ? 'Требует внесения — см. подсказку' : 'Не указано';
}

function RoomRow({
  instance,
  onEditCustom,
}: {
  instance: RoomInstance;
  onEditCustom: (roomId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const setOverride = useProjectStore((s) => s.setOverride);
  const clearOverride = useProjectStore((s) => s.clearOverride);
  const override = useProjectStore((s) => s.overrides[instance.key]);

  const outOfRange =
    instance.areaEach !== null &&
    instance.room.area.kind === 'range' &&
    typeof instance.room.area.min === 'number' &&
    typeof instance.room.area.max === 'number' &&
    (instance.areaEach < instance.room.area.min || instance.areaEach > instance.room.area.max);

  return (
    <div className={cn('border-b border-line/60', open && 'bg-panel/60')}>
      <div
        className={cn(
          GRID,
          'px-2 py-1 hover:bg-raised/60',
          instance.origin === 'unresolved' && 'hatched',
          outOfRange && 'bg-err-soft',
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Свернуть расчёт' : 'Показать расчёт'}
          onClick={() => setOpen((v) => !v)}
          className="flex size-4 items-center justify-center text-muted hover:text-fg"
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>

        <span className="num text-muted">{instance.room.code}</span>

        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: instance.group.color }}
          />
          <span className="line-clamp-2 leading-tight" title={instance.displayName}>
            {instance.displayName}
          </span>
          {instance.overridden ? (
            <Tooltip content="Значение изменено вручную">
              <span className="shrink-0 rounded-[2px] border border-accent/40 px-1 text-[10px] text-accent">
                ✎
              </span>
            </Tooltip>
          ) : null}
          {instance.room.custom ? (
            <button
              type="button"
              title="Изменить помещение"
              onClick={() => onEditCustom(instance.room.id)}
              className="shrink-0 rounded-[2px] border border-accent/40 px-1 text-[10px] text-accent hover:bg-accent-soft"
            >
              <Pencil className="size-2.5" />
            </button>
          ) : null}
        </span>

        <span className="num text-right">{formatInt(instance.count)}</span>

        <NumberInput
          ariaLabel={`Площадь единицы: ${instance.displayName}`}
          value={instance.areaEach}
          step={0.1}
          min={0}
          placeholder="—"
          onChange={(v) => {
            if (v === null) clearOverride(instance.key);
            else setOverride(instance.key, { areaEach: v });
          }}
        />

        <span className="num text-right font-medium">{formatArea(instance.areaTotal)}</span>

        <span className="flex items-center gap-1">
          <StatusBadge status={instance.room.status} compact />
          <OriginBadge origin={instance.origin} />
        </span>

        <span className="num text-right text-muted">{floorsLabel(instance)}</span>

        <span
          className="line-clamp-2 text-[11px] leading-tight text-muted"
          title={normLabel(instance)}
        >
          {normLabel(instance)}
        </span>
      </div>

      {outOfRange ? (
        <div className="px-2 pb-1 text-[11px] text-err">
          Значение вне нормативного диапазона {instance.room.area.min}–{instance.room.area.max} м².
          {override?.note ? '' : ' Укажите обоснование отступления в комментарии.'}
        </div>
      ) : null}

      {open ? <AuditTrail instance={instance} /> : null}
    </div>
  );
}

function GroupBlock({
  groupTotal,
  instances,
  onEditCustom,
}: {
  groupTotal: GroupTotal;
  instances: RoomInstance[];
  onEditCustom: (roomId: string) => void;
}) {
  const [open, setOpen] = React.useState(true);
  if (instances.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(GRID, 'w-full border-b border-line bg-panel px-2 py-1 text-left hover:bg-raised')}
      >
        <ChevronRight className={cn('size-3.5 text-muted transition-transform', open && 'rotate-90')} />
        <span />
        <span className="flex items-center gap-1.5 font-semibold">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ background: groupTotal.group.color }}
          />
          {groupTotal.group.name}
          <span className="font-normal text-muted">
            · {plural(instances.length, 'позиция', 'позиции', 'позиций')}
          </span>
        </span>
        <span />
        <span />
        <span className="num text-right font-semibold">{formatArea(groupTotal.netProvisional)}</span>
        <span className="text-[10px] text-muted">
          подтв. {formatArea(groupTotal.netConfirmed)} м²
        </span>
        <span />
        <span />
      </button>
      {open
        ? instances.map((i) => (
            <RoomRow key={i.key} instance={i} onEditCustom={onEditCustom} />
          ))
        : null}
    </div>
  );
}

export function ExplicationTable() {
  const { instances, byGroup, totals, type } = useComputation();
  const customRooms = useProjectStore((s) => s.customRooms);
  const [query, setQuery] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const openCustom = (roomId: string | null) => {
    setEditingId(roomId);
    setDialogOpen(true);
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return instances;
    return instances.filter(
      (i) =>
        i.displayName.toLowerCase().includes(q) ||
        i.room.code.toLowerCase().includes(q) ||
        i.group.name.toLowerCase().includes(q),
    );
  }, [instances, query]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по наименованию или коду"
            className="h-7 w-full rounded-[3px] border border-line bg-bg pl-7 pr-2 text-[12px]"
          />
        </div>
        <span className="text-[11px] text-muted">
          {plural(filtered.length, 'позиция', 'позиции', 'позиций')} · рабочая{' '}
          <span className="num">{formatArea(totals.netProvisional)}</span> м², из них подтверждено{' '}
          <span className="num">{formatArea(totals.netConfirmed)}</span> м²
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => openCustom(null)}
          title="Добавить помещение по заданию на проектирование"
        >
          <Plus className="size-3.5" />
          Помещение
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[1080px]">
          <div
            className={cn(
              GRID,
              'sticky top-0 z-10 border-b border-line bg-bg px-2 py-1 text-[10px] uppercase tracking-wide text-muted',
            )}
          >
            <span />
            <span>№</span>
            <span>Наименование</span>
            <span className="text-right">Кол.</span>
            <span className="text-right">Площадь ед., м²</span>
            <span className="text-right">Всего, м²</span>
            <span>Статус</span>
            <span className="text-right">Этаж</span>
            <span>Нормативное обоснование</span>
          </div>

          {byGroup.map((groupTotal) => (
            <GroupBlock
              key={groupTotal.group.id}
              groupTotal={groupTotal}
              instances={filtered.filter((i) => i.group.id === groupTotal.group.id)}
              onEditCustom={openCustom}
            />
          ))}

          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-muted">Ничего не найдено</p>
          ) : null}
        </div>
      </div>

      {dialogOpen ? (
        <RoomDialog
          key={editingId ?? 'new'}
          open
          onOpenChange={setDialogOpen}
          groups={type.groups}
          editing={customRooms.find((r) => r.id === editingId) ?? null}
        />
      ) : null}
    </div>
  );
}
