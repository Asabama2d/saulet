'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, Download, FileSpreadsheet, FileText, Moon, Save, Sun, Upload } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as XLSX from 'xlsx';
import { knowledgeBase } from '@/lib/knowledge/loader';
import { useProjectStore } from '@/lib/store/project-store';
import { MAX_PROJECT_BYTES, parseProjectText } from '@/lib/store/project-file';
import { useComputation } from '@/lib/engine/use-computation';
import { buildWorkbook } from '@/lib/export/workbook';
import { buildRevitCsv } from '@/lib/export/revit-csv';
import { download, stamped } from '@/lib/export/download';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { Select, Tooltip } from '@/components/ui/primitives';
import { plural } from '@/lib/format';

function VerificationIndicator() {
  const { totals } = useComputation();
  const share =
    totals.positionsTotal === 0 ? 0 : totals.positionsConfirmed / totals.positionsTotal;

  return (
    <Tooltip
      content="Позиции с проверенной ссылкой на норму или со значением, внесённым как задание на проектирование. Остальные в итоговую сумму не входят."
      side="bottom"
    >
      <div className="flex items-center gap-2 rounded-[3px] border border-line px-2 py-1">
        <span className="text-[11px] text-muted">Проверено</span>
        <span className="num">
          {totals.positionsConfirmed} из {totals.positionsTotal}
        </span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-raised">
          <span
            className="block h-full bg-ok transition-[width]"
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </span>
      </div>
    </Tooltip>
  );
}

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  // Обе иконки в разметке, нужная показывается классом темы. Так на сервере и
  // на клиенте рендерится одно и то же — флага «смонтировано» не нужно.
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label="Переключить тему"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Moon className="size-3.5 dark:hidden" />
      <Sun className="hidden size-3.5 dark:block" />
    </Button>
  );
}

function ProjectIO() {
  const exportProject = useProjectStore((s) => s.exportProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const floorAssignment = useProjectStore((s) => s.floorAssignment);
  const overrides = useProjectStore((s) => s.overrides);
  const result = useComputation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const notes = React.useMemo(
    () => Object.fromEntries(Object.entries(overrides).map(([key, o]) => [key, o.note])),
    [overrides],
  );

  const saveProject = () => {
    const data = exportProject();
    download(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      stamped(data.buildingTypeId, 'json'),
    );
  };

  const saveWorkbook = () => {
    const book = buildWorkbook(result, floorAssignment, notes);
    const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    download(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      stamped(`${result.type.id}-explication`, 'xlsx'),
    );
  };

  const saveCsv = () => {
    const csv = buildRevitCsv(result, floorAssignment, notes);
    download(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      stamped(`${result.type.id}-revit-rooms`, 'csv'),
    );
  };

  const open = async (file: File) => {
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Файл проекта больше 5 МБ');
      const parsed = parseProjectText(await file.text());
      if (!confirm('Открыть проект из файла? Текущий проект будет заменён. Сохраните его в JSON, если хотите вернуться к нему.')) return;
      loadProject(parsed);
      setMessage(parsed.knowledgeVersion !== knowledgeBase.version
        ? `Проект открыт. Версия базы в файле: ${parsed.knowledgeVersion}; сейчас: ${knowledgeBase.version}. Проверьте пересчитанные площади.`
        : 'Проект открыт');
    } catch (error) {
      setMessage(`Не удалось открыть проект: ${error instanceof Error ? error.message : error}`);
    }
  };

  const unconfirmed = result.totals.positionsTotal - result.totals.positionsConfirmed;

  return (
    <>
      <Button size="sm" variant="ghost" onClick={saveProject} title="Сохранить проект в JSON">
        <Save className="size-3.5" />
        Сохранить
      </Button>
      {message ? (
        <div role="status" className="fixed bottom-3 left-3 right-3 z-50 flex items-center gap-3 rounded border border-line bg-bg p-3 text-[12px] shadow-lg sm:left-auto sm:max-w-lg">
          <span>{message}</span>
          <Button size="sm" variant="ghost" onClick={() => setMessage(null)} aria-label="Закрыть уведомление">×</Button>
        </div>
      ) : null}
      <Menu
        trigger={({ toggle }) => (
          <Button size="sm" variant="ghost" onClick={toggle} title="Выгрузки">
            <Download className="size-3.5" />
            Экспорт
            <ChevronDown className="size-3" />
          </Button>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              icon={<FileSpreadsheet className="size-3.5" />}
              hint={
                unconfirmed > 0
                  ? `${unconfirmed} позиций не подтверждены — предупреждение попадёт в шапку листа`
                  : 'Экспликация, отступления и проверки, сводка'
              }
              onSelect={() => {
                saveWorkbook();
                close();
              }}
            >
              Экспликация XLSX
            </MenuItem>
            <MenuItem
              icon={<FileText className="size-3.5" />}
              hint="Name, Number, Department, Area, Level, Comments"
              onSelect={() => {
                saveCsv();
                close();
              }}
            >
              CSV для Revit
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Save className="size-3.5" />}
              hint="Параметры, ручные правки, координаты узлов"
              onSelect={() => {
                saveProject();
                close();
              }}
            >
              Проект JSON
            </MenuItem>
          </>
        )}
      </Menu>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => inputRef.current?.click()}
        title="Загрузить проект из JSON"
      >
        <Upload className="size-3.5" />
        Открыть
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void open(file);
          e.target.value = '';
        }}
      />
    </>
  );
}

export function TopBar() {
  const buildingTypeId = useProjectStore((s) => s.buildingTypeId);
  const setBuildingType = useProjectStore((s) => s.setBuildingType);
  const currentType =
    knowledgeBase.buildingTypes.find((t) => t.id === buildingTypeId) ??
    knowledgeBase.buildingTypes[0];

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="whitespace-nowrap text-[13px] font-semibold">Saulet</span>
        <span className="hidden whitespace-nowrap text-[11px] text-muted lg:inline">
          состав помещений · нормы РК
        </span>
      </div>

      <div className="w-56 min-w-0 flex-1 sm:max-w-72" title={currentType.name}>
        <Select
          ariaLabel="Назначение здания"
          value={buildingTypeId}
          onValueChange={(id) => {
            if (id !== buildingTypeId && confirm('Сменить назначение здания? Параметры и ручные правки будут сброшены. Сохраните текущий проект в JSON, если он нужен.')) {
              setBuildingType(id);
            }
          }}
          options={knowledgeBase.buildingTypes.map((t) => ({ value: t.id, label: t.name }))}
        />
      </div>

      <div className="ml-auto flex max-w-full flex-wrap items-center gap-1">
        <Link href="/norms" className="rounded border border-line px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft">Атлас норм</Link>
        <Tooltip
          content={`Нормативная база версии ${knowledgeBase.version}. Редакции документов проверять на дату начала проектирования — нормативы РК обновляются приказами несколько раз в год.`}
          side="bottom"
        >
          <span className="hidden whitespace-nowrap text-[11px] text-muted xl:inline">
            База {knowledgeBase.updatedAt} ·{' '}
            {plural(knowledgeBase.documents.length, 'документ', 'документа', 'документов')}
          </span>
        </Tooltip>
        <div className="hidden xl:block"><VerificationIndicator /></div>
        <ProjectIO />
        <ThemeToggle />
      </div>
    </header>
  );
}
