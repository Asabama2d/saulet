import type { BuildingType, KnowledgeBase } from '@/types/knowledge';
import { knowledgeBaseSchema } from './schema';
import norms from '@/data/knowledge/norms.json';
import kindergarten from '@/data/knowledge/kindergarten.json';
import school from '@/data/knowledge/school.json';
import clinic from '@/data/knowledge/clinic.json';
import mall from '@/data/knowledge/mall.json';

/**
 * Загрузчик базы знаний. База собирается из JSON-файлов `/src/data/knowledge/`,
 * валидируется Zod-схемой и проверяется на ссылочную целостность.
 * Любая ошибка — исключение на этапе импорта модуля: работать на половине
 * базы нельзя, иначе в экспликацию попадёт неполный состав помещений.
 */

class KnowledgeBaseError extends Error {
  constructor(message: string) {
    super(`Нормативная база не прошла валидацию:\n${message}`);
    this.name = 'KnowledgeBaseError';
  }
}

/** Проверки, которые Zod не выражает: ссылки между сущностями и уникальность id. */
function checkIntegrity(type: BuildingType): string[] {
  const problems: string[] = [];
  const prefix = `[${type.id}]`;

  const groupIds = new Set(type.groups.map((g) => g.id));
  const roomIds = new Set<string>();
  const paramIds = new Set(type.parameters.map((p) => p.id));
  const sectionIds = new Set((type.sections ?? []).map((s) => s.id));

  for (const room of type.rooms) {
    if (roomIds.has(room.id)) problems.push(`${prefix} дубль id помещения: ${room.id}`);
    roomIds.add(room.id);
    if (!groupIds.has(room.group)) {
      problems.push(`${prefix} помещение ${room.id} ссылается на несуществующую группу ${room.group}`);
    }
  }

  for (const group of type.groups) {
    if (group.cellSource && !paramIds.has(group.cellSource)) {
      problems.push(`${prefix} группа ${group.id}: cellSource ${group.cellSource} — нет такого параметра`);
    }
  }

  for (const param of type.parameters) {
    if (param.section && sectionIds.size > 0 && !sectionIds.has(param.section)) {
      problems.push(`${prefix} параметр ${param.id}: неизвестная секция ${param.section}`);
    }
    if (param.control === 'group-matrix' && !param.matrix) {
      problems.push(`${prefix} параметр ${param.id}: control="group-matrix" без описания matrix`);
    }
    if ((param.control === 'select' || param.control === 'multiselect') && !param.options?.length) {
      problems.push(`${prefix} параметр ${param.id}: ${param.control} без options`);
    }
  }

  for (const rule of type.adjacency) {
    if (!roomIds.has(rule.from)) {
      problems.push(`${prefix} связь ${rule.from} → ${rule.to}: нет помещения ${rule.from}`);
    }
    if (!roomIds.has(rule.to)) {
      problems.push(`${prefix} связь ${rule.from} → ${rule.to}: нет помещения ${rule.to}`);
    }
    if (rule.basis === 'norm' && !rule.norm) {
      problems.push(`${prefix} связь ${rule.from} → ${rule.to}: basis="norm" без ссылки на норму`);
    }
  }

  for (const room of type.rooms) {
    for (const ref of [...(room.constraints.notAbove ?? []), ...(room.constraints.notBelow ?? [])]) {
      if (!roomIds.has(ref)) {
        problems.push(`${prefix} помещение ${room.id}: ограничение ссылается на несуществующее ${ref}`);
      }
    }
    if (room.count.kind === 'perUnit' && room.count.per && !type.unitCounts[room.count.per]) {
      problems.push(
        `${prefix} помещение ${room.id}: count.per="${room.count.per}" не описан в unitCounts типа`,
      );
    }
  }

  return problems;
}

function load(): KnowledgeBase {
  const raw = {
    ...(norms as Record<string, unknown>),
    buildingTypes: [kindergarten, school, clinic, mall],
  };

  const parsed = knowledgeBaseSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '<корень>'}: ${i.message}`)
      .join('\n');
    throw new KnowledgeBaseError(details);
  }

  const base = parsed.data as KnowledgeBase;

  const problems = base.buildingTypes.flatMap(checkIntegrity);
  if (problems.length > 0) {
    throw new KnowledgeBaseError(problems.map((p) => `  • ${p}`).join('\n'));
  }

  return base;
}

export const knowledgeBase: KnowledgeBase = load();

export function getBuildingType(id: string): BuildingType {
  const type = knowledgeBase.buildingTypes.find((t) => t.id === id);
  if (!type) throw new Error(`Тип здания не найден: ${id}`);
  return type;
}

export function findDocument(doc: string) {
  return knowledgeBase.documents.find((d) => d.doc === doc);
}
