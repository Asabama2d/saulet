'use client';

import { BookMarked, ClipboardList, FlaskConical, Ruler, ShieldCheck } from 'lucide-react';
import type { NormSource, Status } from '@/types/knowledge';
import type { AreaOrigin } from '@/lib/engine/types';
import { Tooltip } from './primitives';
import { cn } from '@/lib/utils';

const STATUS_META: Record<Status, { label: string; short: string; className: string; hint: string }> = {
  required: {
    label: 'Обязательное',
    short: 'Об',
    className: 'border-fg/40 bg-transparent text-fg',
    hint: 'Обязательное по норме',
  },
  conditional: {
    label: 'При условии',
    short: 'Ус',
    className: 'border-accent bg-accent-soft text-accent',
    hint: 'Обязательное при выполнении условия (бассейн, интернат, режим)',
  },
  recommended: {
    label: 'Рекомендуемое',
    short: 'Рк',
    className: 'border-dashed border-muted bg-transparent text-muted',
    hint: 'Рекомендуемое нормой — «следует предусматривать»',
  },
  optional: {
    label: 'Желательное',
    short: 'Жл',
    className: 'border-dotted border-muted bg-transparent text-muted',
    hint: 'Желательное по методике проектирования или заданию',
  },
};

export function StatusBadge({ status, compact }: { status: Status; compact?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <Tooltip content={meta.hint}>
      <span
        className={cn(
          'inline-flex h-4 shrink-0 items-center rounded-[2px] border px-1 text-[10px] font-medium uppercase tracking-wide',
          meta.className,
        )}
      >
        {compact ? meta.short : meta.label}
      </span>
    </Tooltip>
  );
}

const ORIGIN_META: Record<AreaOrigin, { label: string; className: string; hint: string }> = {
  'norm-verified': {
    label: 'Проверено',
    className: 'border-ok/40 bg-ok-soft text-ok',
    hint: 'Ссылка на пункт сверена с первоисточником. Строка входит в итоговую сумму.',
  },
  'norm-unverified': {
    label: 'Требует проверки',
    className: 'border-warn/40 bg-warn-soft text-warn',
    hint: 'Число есть, но пункт документа не сверен с первоисточником. В итоговую сумму не входит.',
  },
  assignment: {
    label: 'Задание',
    className: 'border-accent/40 bg-accent-soft text-accent',
    hint: 'Значение введено вручную как задание на проектирование. Входит в итоговую сумму под ответственность автора.',
  },
  unresolved: {
    label: 'Нет числа',
    className: 'border-line bg-raised text-muted',
    hint: 'Площадь не определена. Строка не участвует в расчёте — внесите значение по первоисточнику.',
  },
};

export function OriginBadge({ origin }: { origin: AreaOrigin }) {
  const meta = ORIGIN_META[origin];
  return (
    <Tooltip content={meta.hint}>
      <span
        className={cn(
          'inline-flex h-4 shrink-0 items-center rounded-[2px] border px-1 text-[10px] font-medium',
          meta.className,
        )}
      >
        {meta.label}
      </span>
    </Tooltip>
  );
}

const SOURCE_META: Record<NormSource, { label: string; Icon: typeof BookMarked }> = {
  norm: { label: 'Строительная норма (СН/СП РК)', Icon: BookMarked },
  sanpin: { label: 'Санитарные правила', Icon: ShieldCheck },
  gost: { label: 'ГОСТ / СТ РК', Icon: Ruler },
  practice: { label: 'Методика проектирования, пособие, практика', Icon: FlaskConical },
  assignment: { label: 'Задание на проектирование', Icon: ClipboardList },
};

/** Требование нормы и рекомендация методики никогда не выглядят одинаково. */
export function SourceIcon({ source }: { source: NormSource | null }) {
  if (!source) {
    return (
      <Tooltip content="Источник не указан">
        <span className="inline-block size-3.5 text-muted">—</span>
      </Tooltip>
    );
  }
  const { label, Icon } = SOURCE_META[source];
  return (
    <Tooltip content={label}>
      <span
        className={cn(
          'inline-flex size-3.5 items-center justify-center',
          source === 'norm' || source === 'sanpin' ? 'text-accent' : 'text-muted',
        )}
      >
        <Icon className="size-3.5" />
      </span>
    </Tooltip>
  );
}
