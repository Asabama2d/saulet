'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Небольшое выпадающее меню: кнопка, список действий, закрытие по клику вне. */
export function Menu({
  trigger,
  children,
  align = 'right',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div
          className={cn(
            'absolute top-full z-50 mt-1 min-w-56 rounded-[3px] border border-line bg-bg p-0.5 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  onSelect,
  icon,
  hint,
  disabled,
  children,
}: {
  onSelect: () => void;
  icon?: React.ReactNode;
  hint?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-start gap-2 rounded-[2px] px-2 py-1.5 text-left text-[12px] hover:bg-raised disabled:pointer-events-none disabled:opacity-45"
    >
      {icon ? <span className="mt-px shrink-0 text-muted">{icon}</span> : null}
      <span className="flex min-w-0 flex-col">
        <span>{children}</span>
        {hint ? <span className="text-[11px] leading-snug text-muted">{hint}</span> : null}
      </span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-0.5 border-t border-line" />;
}
