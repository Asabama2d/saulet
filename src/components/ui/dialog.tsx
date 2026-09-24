'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'w-[440px]',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[88vh] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[4px] border border-line bg-bg shadow-2xl',
            width,
          )}
        >
          <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-[13px] font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-[11px] leading-snug text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label="Закрыть"
              className="shrink-0 rounded-[2px] p-0.5 text-muted hover:bg-raised hover:text-fg"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-2.5 px-3 py-3">{children}</div>

          {footer ? (
            <div className="flex items-center justify-end gap-1.5 border-t border-line px-3 py-2">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[11px] leading-snug text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full rounded-[3px] border border-line bg-bg px-2 text-[12px]"
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  invalid?: boolean;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full resize-y rounded-[3px] border bg-bg px-2 py-1 text-[12px]',
        invalid ? 'border-err' : 'border-line',
      )}
    />
  );
}
