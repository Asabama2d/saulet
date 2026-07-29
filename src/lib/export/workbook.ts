import * as XLSX from 'xlsx';
import type { BuildingType } from '@/types/knowledge';
import type { ComputationResult, RoomInstance } from '@/lib/engine/types';
import { knowledgeBase } from '@/lib/knowledge/loader';
import { floorName } from './floors';

/**
 * Экспликация в XLSX.
 *
 * Лист «Экспликация» несёт колонку обоснования с точной ссылкой и цитатой —
 * без неё выгрузка бесполезна для проверки. Неподтверждённые строки не
 * скрываются, но лист начинается с явного предупреждения (п. 10.6 задания).
 */

const ORIGIN_LABEL: Record<RoomInstance['origin'], string> = {
  'norm-verified': 'Проверено по первоисточнику',
  'norm-unverified': 'Требует проверки',
  assignment: 'Задание на проектирование',
  unresolved: 'Площадь не определена',
};

const STATUS_LABEL = {
  required: 'Обязательное',
  conditional: 'При условии',
  recommended: 'Рекомендуемое',
  optional: 'Желательное',
} as const;

const CATEGORY_LABEL = {
  norm: 'Норма',
  params: 'Параметры объекта',
  constraints: 'Размещение',
  verification: 'Верификация',
} as const;

function paramSummary(type: BuildingType, scope: Record<string, unknown>): [string, string][] {
  return type.parameters
    .filter((p) => p.control !== 'group-matrix')
    .map((p) => {
      const value = scope[p.id];
      const option = p.options?.find((o) => o.value === value);
      const text = Array.isArray(value)
        ? value
            .map((v) => p.options?.find((o) => o.value === v)?.label ?? String(v))
            .join(', ')
        : option?.label ??
          (typeof value === 'boolean' ? (value ? 'да' : 'нет') : String(value ?? '—'));
      return [p.label, `${text}${p.unit ? ` ${p.unit}` : ''}`] as [string, string];
    });
}

export function buildWorkbook(
  result: ComputationResult,
  floorAssignment: Record<string, number>,
  overrideNotes: Record<string, string | undefined>,
): XLSX.WorkBook {
  const { type, instances, totals, issues, scope } = result;
  const unverified = instances.filter((i) => !i.confirmed).length;

  const header: (string | number)[][] = [
    [`Экспликация помещений — ${type.name}`],
    [
      `Нормативная база ${knowledgeBase.version} от ${knowledgeBase.updatedAt}. Выгружено ${new Date().toLocaleString('ru-RU')}.`,
    ],
    [
      `Проверено ${totals.positionsConfirmed} из ${totals.positionsTotal} позиций. Рабочая площадь (подтверждено) ${totals.netConfirmed.toFixed(1)} м², общая ${totals.grossConfirmed.toFixed(1)} м² при K = ${totals.coefK}.`,
    ],
  ];

  if (unverified > 0) {
    header.push([
      `ВНИМАНИЕ: ${unverified} позиций не подтверждены — площадь не определена либо ссылка на пункт не сверена с первоисточником. Такие строки не входят в итоговую сумму и не могут выноситься в проектную документацию без проверки.`,
    ]);
  }
  header.push([]);

  const columns = [
    '№',
    'Наименование',
    'Функциональная группа',
    'Кол-во',
    'Площадь ед., м²',
    'Всего, м²',
    'Статус',
    'Источник значения',
    'Уровень',
    'Нормативное обоснование',
    'Редакция',
    'Цитата',
    'Расчёт',
    'Комментарий',
  ];

  const rows = instances.map((i) => {
    const norm = i.audit.norm;
    return [
      i.room.code,
      i.displayName,
      i.group.name,
      i.count,
      i.areaEach ?? '',
      i.areaTotal ?? '',
      STATUS_LABEL[i.room.status],
      ORIGIN_LABEL[i.origin],
      floorName(floorAssignment[i.room.id]),
      norm ? `${norm.doc}, ${norm.clause}` : (i.audit.sourceHint ?? 'Не указано'),
      norm?.edition ?? '',
      norm?.quote ?? '',
      i.audit.formula,
      overrideNotes[i.key] ?? i.room.notes ?? '',
    ];
  });

  const totalRow = [
    '',
    'ИТОГО подтверждено',
    '',
    '',
    '',
    Number(totals.netConfirmed.toFixed(1)),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  const provisionalRow = [
    '',
    'ИТОГО справочно (включая непроверенные)',
    '',
    '',
    '',
    Number(totals.netProvisional.toFixed(1)),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];

  const explication = XLSX.utils.aoa_to_sheet([
    ...header,
    columns,
    ...rows,
    [],
    totalRow,
    provisionalRow,
  ]);
  explication['!cols'] = [
    { wch: 8 },
    { wch: 46 },
    { wch: 26 },
    { wch: 7 },
    { wch: 14 },
    { wch: 12 },
    { wch: 15 },
    { wch: 26 },
    { wch: 14 },
    { wch: 40 },
    { wch: 24 },
    { wch: 70 },
    { wch: 40 },
    { wch: 40 },
  ];

  const checks = XLSX.utils.aoa_to_sheet([
    ['Отступления и проверки'],
    [
      'Строки уровня «Ошибка нормы» блокируют выпуск документации. Отступления от нормативных связей приведены с обоснованием автора.',
    ],
    [],
    ['Уровень', 'Категория', 'Заголовок', 'Описание', 'Затронуто позиций'],
    ...issues.map((issue) => [
      issue.level === 'error' ? 'Ошибка нормы' : issue.level === 'warning' ? 'Предупреждение' : 'К сведению',
      CATEGORY_LABEL[issue.category],
      issue.title,
      issue.detail,
      issue.roomKeys?.length ?? '',
    ]),
  ]);
  checks['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 52 }, { wch: 100 }, { wch: 18 }];

  const summary = XLSX.utils.aoa_to_sheet([
    ['Сводка по объекту'],
    [],
    ['Тип здания', type.name],
    ['Групп / классов', totals.groups],
    ['Мест', totals.places],
    ['Рабочая площадь, подтверждено, м²', Number(totals.netConfirmed.toFixed(1))],
    ['Рабочая площадь, справочно, м²', Number(totals.netProvisional.toFixed(1))],
    ['Коэффициент K', totals.coefK],
    ['Общая площадь, подтверждено, м²', Number(totals.grossConfirmed.toFixed(1))],
    ['Строительный объём, ориентировочно, м³', Number(totals.volumeConfirmed.toFixed(0))],
    [
      'Общая площадь на 1 место, м²',
      totals.areaPerPlace === null ? '—' : Number(totals.areaPerPlace.toFixed(1)),
    ],
    [],
    ['Параметры объекта'],
    ...paramSummary(type, scope),
    [],
    ['Нормативная база'],
    ...type.normBase.map((n) => [
      n.doc,
      `${n.clause}${n.edition ? `, ${n.edition}` : ''}${n.verified ? '' : ' — не сверено'}`,
    ]),
  ]);
  summary['!cols'] = [{ wch: 44 }, { wch: 70 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, explication, 'Экспликация');
  XLSX.utils.book_append_sheet(book, checks, 'Отступления и проверки');
  XLSX.utils.book_append_sheet(book, summary, 'Сводка');
  return book;
}
