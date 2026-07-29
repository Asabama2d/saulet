'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Check, ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ Select */

export function Select({
  value,
  onValueChange,
  options,
  className,
  ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string; hint?: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'flex h-7 w-full items-center justify-between gap-1 rounded-[3px] border border-line bg-bg px-2 text-[12px] text-fg hover:border-line-strong data-[placeholder]:text-muted',
          className,
        )}
      >
        {/*
          Значение обрезается многоточием, а не переносится: длинные названия
          («Лечебно-профилактическая организация») иначе распирают триггер
          фиксированной высоты и выходят за его границы.
        */}
        <span className="min-w-0 flex-1 truncate text-left">
          <SelectPrimitive.Value />
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={2}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[3px] border border-line bg-bg shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-0.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="relative flex cursor-default select-none flex-col rounded-[2px] px-2 py-1 pr-7 text-[12px] outline-none data-[highlighted]:bg-raised"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                {option.hint ? (
                  <span className="text-[11px] leading-tight text-muted">{option.hint}</span>
                ) : null}
                <SelectPrimitive.ItemIndicator className="absolute right-2 top-1.5">
                  <Check className="size-3.5 text-accent" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ Switch */

export function Switch({
  checked,
  onCheckedChange,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      className="relative h-4 w-7 shrink-0 rounded-full border border-line bg-raised transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent"
    >
      <SwitchPrimitive.Thumb className="block size-3 translate-x-0.5 rounded-full bg-bg shadow transition-transform data-[state=checked]:translate-x-3.5" />
    </SwitchPrimitive.Root>
  );
}

/* --------------------------------------------------------------- NumberInput */

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  ariaLabel,
  placeholder,
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(value === null ? '' : String(value));
  const lastValue = React.useRef(value);

  React.useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value;
      setDraft(value === null ? '' : String(value));
    }
  }, [value]);

  const commit = (raw: string) => {
    const normalized = raw.replace(',', '.').trim();
    if (normalized === '') {
      lastValue.current = null;
      onChange(null);
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      setDraft(value === null ? '' : String(value));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    lastValue.current = next;
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div className={cn('relative', className)}>
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = Number(draft.replace(',', '.')) || 0;
            const delta = e.key === 'ArrowUp' ? step : -step;
            commit(String(Number((base + delta).toFixed(6))));
          }
        }}
        // Отступ справа считается по длине единицы измерения: «м» и «баллов»
        // требуют разного места, иначе значение налезает на подпись.
        style={unit ? { paddingRight: `${unit.length * 6.2 + 12}px` } : undefined}
        className="num h-7 w-full rounded-[3px] border border-line bg-bg px-2 text-right text-fg placeholder:text-muted hover:border-line-strong"
      />
      {unit ? (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">
          {unit}
        </span>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- Checkboxes */

export function CheckboxList({
  values,
  onChange,
  options,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: { value: string; label: string; hint?: string }[];
}) {
  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };
  return (
    <div className="flex flex-col gap-0.5">
      {options.map((option) => {
        const checked = values.includes(option.value);
        return (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-2 rounded-[2px] px-1 py-0.5 text-[12px] hover:bg-raised"
          >
            <span
              className={cn(
                'mt-[2px] flex size-3.5 shrink-0 items-center justify-center rounded-[2px] border',
                checked ? 'border-accent bg-accent text-white' : 'border-line bg-bg',
              )}
            >
              {checked ? <Check className="size-2.5" strokeWidth={3} /> : null}
            </span>
            <span className="flex flex-col">
              <span>{option.label}</span>
              {option.hint ? <span className="text-[11px] text-muted">{option.hint}</span> : null}
            </span>
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={() => toggle(option.value)}
            />
          </label>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- Tooltip */

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={4}
          collisionPadding={8}
          className="z-50 max-w-80 rounded-[3px] border border-line bg-bg px-2 py-1.5 text-[11px] leading-snug text-fg shadow-lg"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** Значок «i» с пояснением: норма — синий, методика/допущение — серый. */
export function InfoHint({ text, tone = 'plain' }: { text: React.ReactNode; tone?: 'plain' | 'norm' }) {
  return (
    <Tooltip content={text}>
      <button
        type="button"
        aria-label="Пояснение"
        className={cn(
          'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full',
          tone === 'norm' ? 'text-accent' : 'text-muted',
        )}
      >
        <Info className="size-3.5" />
      </button>
    </Tooltip>
  );
}

/* --------------------------------------------------------------- Accordion */

export const Accordion = AccordionPrimitive.Root;

export function AccordionSection({
  value,
  title,
  aside,
  children,
}: {
  value: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AccordionPrimitive.Item value={value} className="border-b border-line">
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger className="group flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted hover:bg-raised">
          <ChevronDown className="size-3 transition-transform group-data-[state=closed]:-rotate-90" />
          <span className="flex-1">{title}</span>
          {aside}
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="overflow-hidden">
        <div className="flex flex-col gap-2 px-2.5 pb-3 pt-1">{children}</div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}

/* -------------------------------------------------------------------- Tabs */

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ children }: { children: React.ReactNode }) {
  return (
    <TabsPrimitive.List className="flex items-center gap-0.5 rounded-[3px] bg-raised p-0.5">
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="rounded-[2px] px-2.5 py-1 text-[12px] text-muted transition-colors data-[state=active]:bg-bg data-[state=active]:text-fg data-[state=active]:shadow-sm"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
