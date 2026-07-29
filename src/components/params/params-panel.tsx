'use client';

import { RotateCcw } from 'lucide-react';
import { useProjectStore } from '@/lib/store/project-store';
import { useComputation } from '@/lib/engine/use-computation';
import { evaluateRule } from '@/lib/engine/expr';
import { Accordion, AccordionSection } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { ParamControl } from './param-control';

/**
 * Левая панель. Аккордеон по секциям типа здания; параметры со снятым
 * `visibleIf` не показываются, но значение сохраняется.
 */
export function ParamsPanel() {
  const { type, scope } = useComputation();
  const params = useProjectStore((s) => s.params);
  const setParam = useProjectStore((s) => s.setParam);
  const resetParams = useProjectStore((s) => s.resetParams);

  const sections = type.sections ?? [{ id: 'default', label: 'Параметры' }];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Параметры объекта
        </span>
        <Button
          size="icon"
          variant="ghost"
          title="Сбросить параметры и ручные правки"
          onClick={() => {
            if (confirm('Сбросить все параметры и ручные правки к значениям по умолчанию?')) {
              resetParams();
            }
          }}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Accordion
          type="multiple"
          defaultValue={sections.map((s) => s.id)}
          className="flex flex-col"
        >
          {sections.map((section) => {
            const items = type.parameters.filter(
              (p) => (p.section ?? 'default') === section.id && evaluateRule(p.visibleIf, scope),
            );
            if (items.length === 0) return null;
            return (
              <AccordionSection key={section.id} value={section.id} title={section.label}>
                {items.map((param) => (
                  <ParamControl
                    key={param.id}
                    param={param}
                    value={params[param.id] ?? param.default}
                    onChange={(value) => setParam(param.id, value)}
                  />
                ))}
              </AccordionSection>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
}
