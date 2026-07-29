'use client';

import * as React from 'react';
import { AlertTriangle, Lock, Trash2, Undo2 } from 'lucide-react';
import type { AdjacencyType, FlowType } from '@/types/knowledge';
import type { DiagramEdge } from '@/lib/diagram/build-graph';
import { EDGE_STYLE, FLOW_LABEL } from '@/lib/diagram/style';
import { createId, type CustomEdge } from '@/lib/engine/manual';
import { useProjectStore } from '@/lib/store/project-store';
import { Button } from '@/components/ui/button';
import { Dialog, Field, TextArea } from '@/components/ui/dialog';
import { Select } from '@/components/ui/primitives';

const TYPE_OPTIONS = (Object.keys(EDGE_STYLE) as AdjacencyType[]).map((type) => ({
  value: type,
  label: EDGE_STYLE[type].label,
}));

const STRENGTH_OPTIONS = [
  { value: '1', label: '1 — слабая', hint: 'Узлы почти не притягиваются' },
  { value: '2', label: '2' },
  { value: '3', label: '3 — средняя' },
  { value: '4', label: '4' },
  { value: '5', label: '5 — жёсткая', hint: 'Узлы становятся максимально близко' },
];

const FLOW_OPTIONS = [
  { value: 'none', label: 'Не указан' },
  ...(Object.keys(FLOW_LABEL) as FlowType[]).map((flow) => ({
    value: flow,
    label: FLOW_LABEL[flow],
  })),
];

const BASIS_OPTIONS = [
  { value: 'technology', label: 'Технология', hint: 'Технологический процесс, последовательность операций' },
  { value: 'ergonomics', label: 'Эргономика', hint: 'Удобство эксплуатации, маршруты персонала' },
];

export interface PendingEdge {
  from: string;
  to: string;
}

export function EdgeDialog({
  open,
  onOpenChange,
  pending,
  edge,
  nameOf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** создание новой связи */
  pending: PendingEdge | null;
  /** правка существующей */
  edge: DiagramEdge | null;
  nameOf: (roomId: string) => string;
}) {
  const addCustomEdge = useProjectStore((s) => s.addCustomEdge);
  const updateCustomEdge = useProjectStore((s) => s.updateCustomEdge);
  const removeCustomEdge = useProjectStore((s) => s.removeCustomEdge);
  const setEdgeOverride = useProjectStore((s) => s.setEdgeOverride);
  const clearEdgeOverride = useProjectStore((s) => s.clearEdgeOverride);

  // Начальные значения берутся при монтировании: диалог создаётся заново на
  // каждое открытие (родитель задаёт key), поэтому синхронизация не нужна.
  const [type, setType] = React.useState<AdjacencyType>(edge?.type ?? 'direct');
  const [strength, setStrength] = React.useState<number>(edge?.strength ?? 3);
  const [reason, setReason] = React.useState(edge?.reason ?? '');
  const [basis, setBasis] = React.useState<'technology' | 'ergonomics'>(
    edge && edge.basis !== 'norm' ? edge.basis : 'technology',
  );
  const [deviation, setDeviation] = React.useState(edge?.deviation ?? '');
  const [flow, setFlow] = React.useState<string>(edge?.flow ?? 'none');
  const [touched, setTouched] = React.useState(false);

  const fromId = edge?.fromRoom ?? pending?.from ?? '';
  const toId = edge?.toRoom ?? pending?.to ?? '';
  const isBaseRule = Boolean(edge?.ruleKey);
  const isNorm = Boolean(edge?.locked);
  const typeChanged = Boolean(edge && type !== edge.type);
  const needsDeviation = isNorm && typeChanged;
  const reasonMissing = !isBaseRule && reason.trim().length === 0;
  const deviationMissing = needsDeviation && deviation.trim().length === 0;
  const canSave = !reasonMissing && !deviationMissing;

  const close = () => onOpenChange(false);

  const save = () => {
    setTouched(true);
    if (!canSave) return;

    const flowValue = flow === 'none' ? undefined : (flow as FlowType);

    if (edge?.customId) {
      updateCustomEdge(edge.customId, {
        type,
        strength: strength as CustomEdge['strength'],
        reason,
        basis,
        flow: flowValue,
      });
    } else if (edge?.ruleKey) {
      setEdgeOverride(edge.ruleKey, {
        type,
        strength: strength as CustomEdge['strength'],
        deviation: deviation.trim() || undefined,
        deleted: false,
      });
    } else if (pending) {
      addCustomEdge({
        id: createId('edge'),
        from: pending.from,
        to: pending.to,
        type,
        strength: strength as CustomEdge['strength'],
        reason: reason.trim(),
        basis,
        flow: flowValue,
      });
    }
    close();
  };

  const remove = () => {
    if (edge?.customId) removeCustomEdge(edge.customId);
    else if (edge?.ruleKey) setEdgeOverride(edge.ruleKey, { deleted: true });
    close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={edge ? 'Связь' : 'Новая связь'}
      description={
        <span className="num">
          {nameOf(fromId)} ↔ {nameOf(toId)}
        </span>
      }
      footer={
        <>
          {edge ? (
            <Button
              size="sm"
              variant={isNorm ? 'ghost' : 'danger'}
              disabled={isNorm}
              onClick={remove}
              title={
                isNorm
                  ? 'Нормативную связь снять нельзя — измените тип и укажите обоснование отступления'
                  : 'Снять связь'
              }
              className="mr-auto"
            >
              {isNorm ? <Lock className="size-3.5" /> : <Trash2 className="size-3.5" />}
              Снять связь
            </Button>
          ) : null}
          {edge?.ruleKey ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearEdgeOverride(edge.ruleKey!);
                close();
              }}
            >
              <Undo2 className="size-3.5" />
              Как в базе
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={close}>
            Отмена
          </Button>
          <Button size="sm" variant="default" onClick={save}>
            {edge ? 'Применить' : 'Создать'}
          </Button>
        </>
      }
    >
      {edge && isBaseRule ? (
        <div className="rounded-[3px] border border-line bg-panel px-2 py-1.5 text-[11px] leading-snug">
          <div className="font-medium text-fg">
            {isNorm ? 'Нормативная связь' : `Основание: ${edge.basis === 'ergonomics' ? 'эргономика' : 'технология'}`}
          </div>
          {edge.normLabel ? <div className="mt-0.5 text-accent">{edge.normLabel}</div> : null}
          <div className="mt-0.5 text-muted">{edge.reason}</div>
        </div>
      ) : null}

      <Field label="Тип связи">
        <Select
          ariaLabel="Тип связи"
          value={type}
          onValueChange={(v) => setType(v as AdjacencyType)}
          options={TYPE_OPTIONS}
        />
      </Field>

      <Field
        label="Сила связи"
        hint="Влияет на раскладку: чем выше, тем ближе узлы друг к другу."
      >
        <Select
          ariaLabel="Сила связи"
          value={String(strength)}
          onValueChange={(v) => setStrength(Number(v))}
          options={STRENGTH_OPTIONS}
        />
      </Field>

      {!isBaseRule ? (
        <>
          <Field
            label="Поток"
            hint="Нужен для фильтра по слоям и для проверки пересечения чистых и грязных путей."
          >
            <Select ariaLabel="Поток" value={flow} onValueChange={setFlow} options={FLOW_OPTIONS} />
          </Field>
          <Field label="Основание">
            <Select
              ariaLabel="Основание"
              value={basis}
              onValueChange={(v) => setBasis(v as 'technology' | 'ergonomics')}
              options={BASIS_OPTIONS}
            />
          </Field>
          <Field
            label="Обоснование"
            hint={
              touched && reasonMissing ? (
                <span className="text-err">Без обоснования связь не создаётся.</span>
              ) : (
                'Чем связь вызвана: технологическая цепочка, маршрут персонала, зрительный контроль.'
              )
            }
          >
            <TextArea
              value={reason}
              onChange={setReason}
              rows={2}
              invalid={touched && reasonMissing}
              placeholder="Например: готовая продукция передаётся на раздачу без промежуточных помещений"
            />
          </Field>
        </>
      ) : null}

      {isNorm ? (
        <Field
          label="Обоснование отступления"
          hint={
            touched && deviationMissing ? (
              <span className="text-err">
                Тип нормативной связи изменён — обоснование обязательно.
              </span>
            ) : (
              'Попадает в панель «Проверки» и в отчёт.'
            )
          }
        >
          <TextArea
            value={deviation}
            onChange={setDeviation}
            rows={2}
            invalid={touched && deviationMissing}
            placeholder="Причина отступления и компенсирующие мероприятия"
          />
        </Field>
      ) : null}

      {needsDeviation ? (
        <div className="flex items-start gap-1.5 rounded-[3px] border border-warn/40 bg-warn-soft px-2 py-1.5 text-[11px] leading-snug text-warn">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          Изменение типа нормативной связи — отступление от норматива. Оно останется на
          диаграмме, попадёт в «Проверки» и в отчёт.
        </div>
      ) : null}
    </Dialog>
  );
}
