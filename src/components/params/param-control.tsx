'use client';

import type { ParameterDef } from '@/types/knowledge';
import type { MatrixRowValue } from '@/lib/engine/types';
import { CheckboxList, InfoHint, NumberInput, Select, Switch } from '@/components/ui/primitives';
import { GroupMatrix } from './group-matrix';

function NormHint({ param }: { param: ParameterDef }) {
  if (param.helpNorm) {
    return (
      <InfoHint
        tone="norm"
        text={
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">
              {param.helpNorm.doc}, {param.helpNorm.clause}
            </span>
            {param.helpNorm.quote ? <span className="text-muted">{param.helpNorm.quote}</span> : null}
            {!param.helpNorm.verified ? (
              <span className="text-warn">Ссылка не сверена с первоисточником</span>
            ) : null}
          </span>
        }
      />
    );
  }
  if (param.help) return <InfoHint text={param.help} />;
  return null;
}

export function ParamControl({
  param,
  value,
  onChange,
}: {
  param: ParameterDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = (
    <span className="flex items-center gap-1 text-[12px] leading-tight text-fg">
      {param.label}
      <NormHint param={param} />
    </span>
  );

  if (param.control === 'toggle') {
    return (
      <div className="flex items-center justify-between gap-2 py-0.5">
        {label}
        <Switch
          ariaLabel={param.label}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </div>
    );
  }

  if (param.control === 'number') {
    return (
      <div className="flex items-center justify-between gap-2">
        {label}
        <NumberInput
          className="w-28 shrink-0"
          ariaLabel={param.label}
          value={typeof value === 'number' ? value : null}
          min={param.min}
          max={param.max}
          step={param.step ?? 1}
          unit={param.unit}
          onChange={(v) => onChange(v ?? param.default)}
        />
      </div>
    );
  }

  if (param.control === 'select') {
    return (
      <div className="flex flex-col gap-1">
        {label}
        <Select
          ariaLabel={param.label}
          value={typeof value === 'string' ? value : String(param.default)}
          onValueChange={onChange}
          options={param.options ?? []}
        />
      </div>
    );
  }

  if (param.control === 'multiselect') {
    return (
      <div className="flex flex-col gap-1">
        {label}
        <CheckboxList
          values={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          options={param.options ?? []}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {label}
      <GroupMatrix
        param={param}
        value={value}
        onChange={(rows: MatrixRowValue[]) => onChange(rows)}
      />
    </div>
  );
}
