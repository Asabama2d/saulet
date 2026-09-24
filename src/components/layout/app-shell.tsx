'use client';

import * as React from 'react';
import { hydrateProject, useProjectStore } from '@/lib/store/project-store';
import { useComputation } from '@/lib/engine/use-computation';
import { TooltipProvider, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { ParamsPanel } from '@/components/params/params-panel';
import { ExplicationTable } from '@/components/table/explication-table';
import { SummaryPanel } from '@/components/panels/summary-panel';
import { ChecksPanel } from '@/components/panels/checks-panel';
import { BubbleDiagram } from '@/components/diagram/bubble-diagram';
import { TopBar } from './top-bar';
import { Button } from '@/components/ui/button';
import { download, stamped } from '@/lib/export/download';
import { cn } from '@/lib/utils';

function RightPanel() {
  const { issues } = useComputation();
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;

  return (
    <Tabs defaultValue="summary" className="flex h-full flex-col">
      <div className="border-b border-line px-2 py-1.5">
        <TabsList>
          <TabsTrigger value="summary">Сводка</TabsTrigger>
          <TabsTrigger value="checks">
            Проверки
            {errors > 0 ? (
              <span className="ml-1 rounded-[2px] bg-err px-1 text-[10px] text-white">{errors}</span>
            ) : warnings > 0 ? (
              <span className="ml-1 rounded-[2px] bg-warn px-1 text-[10px] text-white">
                {warnings}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="summary">
          <SummaryPanel />
        </TabsContent>
        <TabsContent value="checks">
          <ChecksPanel />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function Workspace() {
  const [panel, setPanel] = React.useState<'workspace' | 'params' | 'summary'>('workspace');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Панели проекта" className="flex shrink-0 flex-wrap gap-1 border-b border-line p-1.5 xl:hidden">
        {([['workspace', 'Планировка'], ['params', 'Параметры'], ['summary', 'Сводка и проверки']] as const).map(([id, label]) => (
          <Button key={id} size="sm" variant={panel === id ? 'default' : 'ghost'} aria-pressed={panel === id} onClick={() => setPanel(id)}>{label}</Button>
        ))}
      </nav>
    <div className="flex min-h-0 flex-1">
      <aside className={cn('min-h-0 w-full shrink-0 border-r border-line bg-panel xl:block xl:w-[280px]', panel !== 'params' && 'hidden')}>
        <ParamsPanel />
      </aside>

      <main className={cn('min-w-0 flex-1 flex-col xl:flex', panel === 'workspace' ? 'flex' : 'hidden')}>
        {/*
          min-w-0 обязателен на каждом звене: таблица экспликации шире экрана,
          и без него её минимальная ширина растягивает всю оболочку.
        */}
        <Tabs defaultValue="diagram" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
            <TabsList>
              <TabsTrigger value="diagram">Диаграмма</TabsTrigger>
              <TabsTrigger value="table">Экспликация</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="diagram"
            className="min-h-0 min-w-0 flex-1 data-[state=inactive]:hidden"
          >
            <BubbleDiagram />
          </TabsContent>
          <TabsContent value="table" className="min-h-0 min-w-0 flex-1 data-[state=inactive]:hidden">
            <ExplicationTable />
          </TabsContent>
        </Tabs>
      </main>

      <aside className={cn('min-h-0 w-full shrink-0 border-l border-line bg-panel xl:block xl:w-[312px]', panel !== 'summary' && 'hidden')}>
        <RightPanel />
      </aside>
    </div>
    </div>
  );
}

function StorageNotice() {
  const problem = useProjectStore((s) => s.storageProblem);
  const resume = useProjectStore((s) => s.resumeAutosave);
  if (!problem) return null;
  return (
    <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warn bg-warn-soft px-3 py-2 text-[12px]">
      <span className="flex-1">{problem.message}</span>
      {problem.recovery !== null ? (
        <Button size="sm" variant="outline" onClick={() => download(new Blob([problem.recovery!], { type: 'application/json' }), stamped('saulet-recovery', 'json'))}>
          Скачать исходные данные
        </Button>
      ) : null}
      <Button size="sm" variant="outline" onClick={() => {
        if (problem.recovery === null || confirm('Заменить старое автосохранение текущим проектом? Сначала скачайте исходные данные, если они нужны.')) resume();
      }}>Возобновить сохранение</Button>
    </div>
  );
}

export function AppShell() {
  const hydrated = useProjectStore((s) => s.hydrated);

  React.useEffect(() => {
    void hydrateProject();
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col">
        {hydrated ? <TopBar /> : null}
        <StorageNotice />
        {hydrated ? (
          <Workspace />
        ) : (
          <div className="flex flex-1 items-center justify-center text-[12px] text-muted">
            Загрузка проекта…
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
