'use client';

import type { ParameterDef } from '@/types/knowledge';
import type { MatrixRowValue } from '@/lib/engine/types';
import { normalizeMatrix } from '@/lib/engine/compute';
import { NumberInput, InfoHint } from '@/components/ui/primitives';
import { formatInt } from '@/lib/format';

/**
 * Матрица групп: строка — возрастная группа, столбцы — количество групп и
 * наполняемость. Итог по строке и по объекту считается на лету.
 */
export function GroupMatrix({
  param,
  value,
  onChange,
}: {
  param: ParameterDef;
  value: unknown;
  onChange: (rows: MatrixRowValue[]) => void;
}) {
  const rows = normalizeMatrix(param, value);
  const defs = param.matrix?.rows ?? [];

  const update = (rowId: string, patch: Partial<MatrixRowValue>) => {
    onChange(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };

  const totalGroups = rows.reduce((s, r) => s + r.count, 0);
  const totalPlaces = rows.reduce((s, r) => s + r.count * r.capacity, 0);

  return (
    <div className="rounded-[3px] border border-line">
      {/*
        Заголовки колонок переносятся по словам и обязательно с `min-w-0`:
        по умолчанию элемент грида не сжимается уже своего содержимого, поэтому
        длинная подпись («Коек / посещений в смену») выдавливала соседние
        колонки и накладывалась на них. Выравнивание по низу держит базовую
        линию однострочных и многострочных заголовков вместе.
      */}
      <div className="grid grid-cols-[1fr_46px_58px_46px] items-end gap-1 border-b border-line bg-panel px-1.5 py-1 text-[9px] uppercase leading-[1.15] text-muted">
        <span className="min-w-0 break-words">{param.matrix?.rowLabel ?? 'Строка'}</span>
        <span className="min-w-0 break-words text-right">
          {param.matrix?.countLabel ?? 'Кол-во'}
        </span>
        <span className="min-w-0 break-words text-right">
          {param.matrix?.capacityLabel ?? 'Мест'}
        </span>
        <span className="min-w-0 break-words text-right">Итого</span>
      </div>

      {defs.map((def) => {
        const row = rows.find((r) => r.rowId === def.id)!;
        const places = row.count * row.capacity;
        return (
          <div
            key={def.id}
            className="grid grid-cols-[1fr_46px_58px_46px] items-center gap-1 border-b border-line/60 px-1.5 py-1 last:border-b-0"
          >
            <span className="flex min-w-0 items-center gap-1 text-[12px] leading-tight">
              {def.label}
              {def.hint ? <InfoHint text={def.hint} /> : null}
            </span>
            <NumberInput
              ariaLabel={`${def.label}: количество групп`}
              value={row.count}
              min={0}
              step={1}
              onChange={(v) => update(def.id, { count: Math.max(0, Math.trunc(v ?? 0)) })}
            />
            <NumberInput
              ariaLabel={`${def.label}: наполняемость`}
              value={row.capacity}
              min={0}
              step={1}
              onChange={(v) => update(def.id, { capacity: Math.max(0, Math.trunc(v ?? 0)) })}
            />
            <span className="num text-right text-muted">{places > 0 ? formatInt(places) : '—'}</span>
          </div>
        );
      })}

      <div className="grid grid-cols-[1fr_46px_58px_46px] items-center gap-1 border-t border-line bg-panel px-1.5 py-1 text-[12px] font-medium">
        <span>Итого</span>
        <span className="num text-right">{formatInt(totalGroups)}</span>
        <span />
        <span className="num text-right">{formatInt(totalPlaces)}</span>
      </div>
    </div>
  );
}
