import type { ComputationResult } from '@/lib/engine/types';
import { floorName } from './floors';

/**
 * CSV для последующего создания Room'ов в Revit.
 *
 * Колонки названы так, чтобы маппиться на параметры Revit напрямую:
 * Name → Имя, Number → Номер, Department → Отдел, Area → Площадь,
 * Level → Уровень, Comments → Комментарии.
 *
 * Каждое физическое помещение — отдельная строка: Revit создаёт по одному
 * Room на запись, поэтому позиции с количеством больше единицы разворачиваются
 * с суффиксом номера.
 */

const COLUMNS = ['Name', 'Number', 'Department', 'Area', 'Level', 'Comments'] as const;

function escape(value: string | number): string {
  const text = String(value);
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildRevitCsv(
  result: ComputationResult,
  floorAssignment: Record<string, number>,
  overrideNotes: Record<string, string | undefined>,
): string {
  const lines: string[] = [COLUMNS.join(',')];

  // Номер помещения в Revit обязан быть уникальным. Один код экспликации даёт
  // несколько физических помещений — и по количеству, и по вариантам ячейки,
  // поэтому нумерация сквозная в пределах кода.
  const totalByCode = new Map<string, number>();
  for (const instance of result.instances) {
    totalByCode.set(
      instance.room.code,
      (totalByCode.get(instance.room.code) ?? 0) + instance.count,
    );
  }
  const usedByCode = new Map<string, number>();
  // Reserve literal codes: repeated A must not steal A-1 from another room.
  const reservedCodes = new Set(totalByCode.keys());
  const usedNumbers = new Set<string>();

  for (const instance of result.instances) {
    const level = floorName(floorAssignment[instance.room.id]);
    const norm = instance.audit.norm;
    const comment = [
      norm ? `${norm.doc}, ${norm.clause}` : instance.audit.sourceHint,
      instance.origin === 'norm-verified' ? null : 'ТРЕБУЕТ ПРОВЕРКИ',
      overrideNotes[instance.key],
    ]
      .filter(Boolean)
      .join(' | ');

    const code = instance.room.code;
    const single = (totalByCode.get(code) ?? 0) === 1;

    for (let index = 0; index < instance.count; index += 1) {
      const seat = (usedByCode.get(code) ?? 0) + 1;
      usedByCode.set(code, seat);
      let number = single && code.trim() ? code : `${code.trim() || 'ROOM'}-${seat}`;
      let suffix = seat;
      while (usedNumbers.has(number) || (number !== code && reservedCodes.has(number))) {
        suffix += 1;
        number = `${code.trim() || 'ROOM'}-${suffix}`;
      }
      usedNumbers.add(number);
      lines.push(
        [
          escape(instance.variant ? `${instance.room.name} (${instance.variant.label})` : instance.room.name),
          escape(number),
          escape(instance.group.name),
          // Площадь одного помещения: Revit считает площадь по контуру,
          // значение служит проверкой при раскладке.
          instance.areaEach === null ? '' : instance.areaEach.toFixed(2),
          escape(level),
          escape(comment),
        ].join(','),
      );
    }
  }

  // BOM: без него Excel открывает кириллицу в CSV нечитаемой.
  return `﻿${lines.join('\r\n')}\r\n`;
}
