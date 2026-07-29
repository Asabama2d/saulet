'use client';

import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import type { Issue, IssueLevel } from '@/lib/engine/types';
import { useComputation } from '@/lib/engine/use-computation';
import { cn } from '@/lib/utils';

const LEVEL_META: Record<
  IssueLevel,
  { label: string; Icon: typeof Info; className: string; badge: string }
> = {
  error: {
    label: 'Ошибка нормы',
    Icon: OctagonAlert,
    className: 'border-err/40 bg-err-soft',
    badge: 'text-err',
  },
  warning: {
    label: 'Предупреждение',
    Icon: AlertTriangle,
    className: 'border-warn/40 bg-warn-soft',
    badge: 'text-warn',
  },
  info: {
    label: 'К сведению',
    Icon: Info,
    className: 'border-line bg-panel',
    badge: 'text-muted',
  },
};

function IssueCard({ issue }: { issue: Issue }) {
  const meta = LEVEL_META[issue.level];
  return (
    <div className={cn('rounded-[3px] border p-2', meta.className)}>
      <div className="flex items-start gap-1.5">
        <meta.Icon className={cn('mt-px size-3.5 shrink-0', meta.badge)} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium">{issue.title}</div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">{issue.detail}</p>
          {issue.roomKeys && issue.roomKeys.length > 0 ? (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">
              Затронуто позиций: {issue.roomKeys.length}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ChecksPanel() {
  const { issues } = useComputation();

  if (issues.length === 0) {
    return (
      <div className="p-3 text-[12px] text-muted">
        Конфликтов не найдено. Проверки выполняются при каждом изменении параметров.
      </div>
    );
  }

  const levels: IssueLevel[] = ['error', 'warning', 'info'];

  return (
    <div className="flex flex-col gap-3 p-2.5">
      {levels.map((level) => {
        const own = issues.filter((i) => i.level === level);
        if (own.length === 0) return null;
        return (
          <section key={level} className="flex flex-col gap-1.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {LEVEL_META[level].label} · {own.length}
            </h3>
            {own.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
