'use client';

import { useComputation } from '@/lib/engine/use-computation';
import { formatArea, formatInt, plural } from '@/lib/format';
import { Tooltip } from '@/components/ui/primitives';

function Row({
  label,
  value,
  unit,
  hint,
  strong,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  strong?: boolean;
}) {
  const content = (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className={strong ? 'text-fg' : 'text-muted'}>{label}</span>
      <span className={`num ${strong ? 'text-[13px] font-semibold' : ''}`}>
        {value}
        {unit ? <span className="ml-1 text-muted">{unit}</span> : null}
      </span>
    </div>
  );
  return hint ? <Tooltip content={hint}>{content}</Tooltip> : content;
}

export function SummaryPanel() {
  const { totals, byGroup } = useComputation();
  const maxGroup = Math.max(1, ...byGroup.map((g) => g.netProvisional));

  return (
    <div className="flex flex-col gap-3 p-2.5">
      <section className="flex flex-col">
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          Площади
        </h3>
        <Row
          label="Рабочая, подтверждено"
          value={formatArea(totals.netConfirmed)}
          unit="м²"
          strong
          hint="Сумма строк с проверенной ссылкой на норму или со значением, введённым как задание на проектирование."
        />
        <Row
          label="Рабочая, справочно"
          value={formatArea(totals.netProvisional)}
          unit="м²"
          hint="Со строками, у которых число есть, но ссылка на пункт не сверена с первоисточником. В проектную документацию не выносится."
        />
        <div className="my-1 border-t border-line" />
        <Row
          label={`Общая = рабочая × ${totals.coefK}`}
          value={formatArea(totals.grossConfirmed)}
          unit="м²"
          strong
        />
        <Row label="Общая, справочно" value={formatArea(totals.grossProvisional)} unit="м²" />
        <Row
          label={`Строительный объём (h = ${totals.floorHeight} м)`}
          value={formatArea(totals.volumeConfirmed, 0)}
          unit="м³"
          hint="Ориентировочно: общая площадь × высота этажа. Для точного подсчёта нужен объём по наружному обмеру."
        />
      </section>

      <section className="flex flex-col">
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          Вместимость
        </h3>
        <Row label="Групп" value={formatInt(totals.groups)} />
        <Row label="Мест" value={formatInt(totals.places)} />
        <Row
          label="Общая площадь на 1 место"
          value={totals.areaPerPlace === null ? '—' : formatArea(totals.areaPerPlace)}
          unit="м²"
          hint="Считается по подтверждённой сумме. Пока не заполнены площади, показатель не имеет смысла."
        />
      </section>

      <section className="flex flex-col">
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          Доля функциональных блоков
        </h3>
        <div className="flex flex-col gap-1">
          {byGroup.map((g) => (
            <div key={g.group.id} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: g.group.color }}
                  />
                  <span className="truncate text-[12px]">{g.group.name}</span>
                </span>
                <span className="num shrink-0 text-muted">{formatArea(g.netProvisional)} м²</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-raised">
                <div
                  className="h-full"
                  style={{
                    width: `${(g.netProvisional / maxGroup) * 100}%`,
                    background: g.group.color,
                  }}
                />
              </div>
            </div>
          ))}
          {byGroup.every((g) => g.netProvisional === 0) ? (
            <p className="text-[11px] leading-snug text-muted">
              Площади ещё не заполнены — диаграмма долей появится после внесения первых значений.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-[3px] border border-line bg-panel p-2 text-[11px] leading-snug text-muted">
        Всего {plural(totals.positionsTotal, 'позиция', 'позиции', 'позиций')}, из них{' '}
        {totals.positionsUnresolved} без площади. База знаний поставляется без числовых значений:
        каждое число вносится по первоисточнику, подсказка со ссылкой на документ показана в строке
        таблицы.
      </section>
    </div>
  );
}
