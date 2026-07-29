'use client';

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import type { FlowType, RoomGroup, Status } from '@/types/knowledge';
import { createId, type CustomRoom } from '@/lib/engine/manual';
import { useProjectStore } from '@/lib/store/project-store';
import { Button } from '@/components/ui/button';
import { Dialog, Field, TextArea, TextInput } from '@/components/ui/dialog';
import { CheckboxList, NumberInput, Select } from '@/components/ui/primitives';

const STATUS_OPTIONS: { value: Status; label: string; hint?: string }[] = [
  { value: 'required', label: 'Обязательное' },
  { value: 'conditional', label: 'При условии' },
  { value: 'recommended', label: 'Рекомендуемое' },
  { value: 'optional', label: 'Желательное', hint: 'По методике проектирования или заданию' },
];

const ZONE_OPTIONS = [
  { value: 'clean', label: 'Чистая' },
  { value: 'dirty', label: 'Грязная' },
  { value: 'neutral', label: 'Нейтральная' },
];

const FLOW_OPTIONS: { value: FlowType; label: string }[] = [
  { value: 'children', label: 'Дети / обучающиеся' },
  { value: 'visitors', label: 'Посетители' },
  { value: 'staff', label: 'Персонал' },
  { value: 'food', label: 'Пища' },
  { value: 'linen', label: 'Бельё' },
  { value: 'waste', label: 'Отходы' },
  { value: 'goods', label: 'Товары и грузы' },
  { value: 'medical', label: 'Медицинский' },
];

/** Помещение, добавленное вручную: площадь трактуется как задание на проектирование. */
export function RoomDialog({
  open,
  onOpenChange,
  groups,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: RoomGroup[];
  editing: CustomRoom | null;
}) {
  const addCustomRoom = useProjectStore((s) => s.addCustomRoom);
  const updateCustomRoom = useProjectStore((s) => s.updateCustomRoom);
  const removeCustomRoom = useProjectStore((s) => s.removeCustomRoom);

  // Начальные значения берутся при монтировании: диалог создаётся заново на
  // каждое открытие (родитель задаёт key), поэтому синхронизация не нужна.
  const [name, setName] = React.useState(editing?.name ?? '');
  const [code, setCode] = React.useState(editing?.code ?? '');
  const [group, setGroup] = React.useState(editing?.group ?? groups[0]?.id ?? '');
  const [status, setStatus] = React.useState<Status>(editing?.status ?? 'optional');
  const [count, setCount] = React.useState(editing?.count ?? 1);
  const [areaEach, setAreaEach] = React.useState<number | null>(editing?.areaEach ?? null);
  const [zone, setZone] = React.useState<CustomRoom['zone']>(editing?.zone ?? 'neutral');
  const [flows, setFlows] = React.useState<string[]>(editing?.flows ?? []);
  const [note, setNote] = React.useState(editing?.note ?? '');
  const [touched, setTouched] = React.useState(false);

  const nameMissing = name.trim().length === 0;
  const close = () => onOpenChange(false);

  const save = () => {
    setTouched(true);
    if (nameMissing || !group) return;

    const payload: Omit<CustomRoom, 'id'> = {
      code: code.trim() || '—',
      name: name.trim(),
      group,
      status,
      count: Math.max(1, Math.trunc(count)),
      areaEach,
      zone,
      flows: flows as FlowType[],
      note: note.trim() || undefined,
    };

    if (editing) updateCustomRoom(editing.id, payload);
    else addCustomRoom({ id: createId('custom'), ...payload });
    close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="w-[520px]"
      title={editing ? 'Помещение по заданию' : 'Новое помещение'}
      description="Площадь такого помещения помечается источником «Задание на проектирование» и входит в подтверждённую сумму под ответственность автора."
      footer={
        <>
          {editing ? (
            <Button
              size="sm"
              variant="danger"
              className="mr-auto"
              onClick={() => {
                removeCustomRoom(editing.id);
                close();
              }}
            >
              <Trash2 className="size-3.5" />
              Удалить
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={close}>
            Отмена
          </Button>
          <Button size="sm" variant="default" onClick={save}>
            {editing ? 'Применить' : 'Добавить'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <Field
          label="Наименование"
          hint={touched && nameMissing ? <span className="text-err">Укажите наименование.</span> : undefined}
        >
          <TextInput value={name} onChange={setName} autoFocus placeholder="Например: серверная" />
        </Field>
        <Field label="№ по экспликации">
          <TextInput value={code} onChange={setCode} placeholder="9.01" />
        </Field>
      </div>

      <Field label="Функциональная группа">
        <Select
          ariaLabel="Функциональная группа"
          value={group}
          onValueChange={setGroup}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
        />
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Статус">
          <Select
            ariaLabel="Статус"
            value={status}
            onValueChange={(v) => setStatus(v as Status)}
            options={STATUS_OPTIONS}
          />
        </Field>
        <Field label="Количество">
          <NumberInput ariaLabel="Количество" value={count} min={1} step={1} onChange={(v) => setCount(v ?? 1)} />
        </Field>
        <Field label="Площадь единицы">
          <NumberInput
            ariaLabel="Площадь единицы"
            value={areaEach}
            min={0}
            step={0.1}
            unit="м²"
            placeholder="—"
            onChange={setAreaEach}
          />
        </Field>
      </div>

      <div className="grid grid-cols-[160px_1fr] gap-2">
        <Field label="Зона">
          <Select
            ariaLabel="Зона"
            value={zone}
            onValueChange={(v) => setZone(v as CustomRoom['zone'])}
            options={ZONE_OPTIONS}
          />
        </Field>
        <Field label="Потоки">
          <div className="max-h-28 overflow-y-auto rounded-[3px] border border-line px-1 py-0.5">
            <CheckboxList values={flows} onChange={setFlows} options={FLOW_OPTIONS} />
          </div>
        </Field>
      </div>

      <Field label="Комментарий" hint="Источник значения площади, ссылка на задание, особые условия.">
        <TextArea value={note} onChange={setNote} rows={2} placeholder="Площадь принята по заданию на проектирование" />
      </Field>
    </Dialog>
  );
}
