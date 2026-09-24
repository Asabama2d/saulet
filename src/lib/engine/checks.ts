import type { BuildingType, Room, RoomGroup } from '@/types/knowledge';
import { evaluateRule, type Scope } from './expr';
import { ruleKey, type CustomEdge, type EdgeOverride } from './manual';
import { EDGE_STYLE } from '@/lib/diagram/style';
import { availableFloors } from './floors';
import type { Issue, RoomInstance, Totals } from './types';

/**
 * Панель «Проверки».
 *
 * Здесь только правила, не зависящие от типа здания. Несовместимости
 * параметров конкретного типа описываются данными — блок `validations`
 * в JSON типа здания, чтобы движок оставался типонезависимым.
 */

interface CheckInput {
  type: BuildingType;
  params: Record<string, unknown>;
  scope: Scope;
  instances: RoomInstance[];
  excluded: { room: Room; group: RoomGroup }[];
  totals: Totals;
  customEdges: CustomEdge[];
  edgeOverrides: Record<string, EdgeOverride>;
  floorAssignment: Record<string, number>;
}

/** Подпись этажа для сообщений: −1 — подвал, 0 — цоколь. */
function floorLabel(floor: number): string {
  if (floor === -1) return 'подвал';
  if (floor === 0) return 'цокольный этаж';
  return `${floor} этаж`;
}

/** Тот же уровень в предложном падеже: «в подвале», «на 2 этаже». */
function floorIn(floor: number): string {
  if (floor === -1) return 'в подвале';
  if (floor === 0) return 'на цокольном этаже';
  return `на ${floor} этаже`;
}

export function collectIssues({
  type,
  scope,
  instances,
  excluded,
  totals,
  customEdges,
  edgeOverrides,
  floorAssignment,
}: CheckInput): Issue[] {
  const issues: Issue[] = [];

  if (totals.groups === 0) {
    issues.push({
      id: 'no-groups',
      level: 'error',
      category: 'params',
      title: 'Не задана ни одна группа',
      detail:
        'Матрица групп пуста, расчёт состава помещений невозможен. Задайте количество групп и наполняемость в секции «Вместимость и режим».',
    });
  } else if (totals.places === 0) {
    issues.push({
      id: 'no-places',
      level: 'error',
      category: 'params',
      title: 'Не задана наполняемость групп',
      detail: 'Количество мест равно нулю — удельные площади посчитать не из чего.',
    });
  }

  const floors = availableFloors(scope);
  for (const instance of instances) {
    const allowed = instance.room.constraints.floorsAllowed;
    if (allowed && allowed.length > 0 && !allowed.some((f) => floors.includes(f))) {
      issues.push({
        id: `floor-${instance.key}`,
        level: 'error',
        category: 'constraints',
        title: `«${instance.displayName}» негде разместить`,
        detail: `Помещение допускается только на этажах ${allowed.join(', ')}, а в здании есть этажи ${floors.join(', ')}.`,
        roomKeys: [instance.key],
      });
    }
  }

  const unresolved = instances.filter((i) => i.areaTotal === null);
  if (unresolved.length > 0) {
    issues.push({
      id: 'unresolved-areas',
      level: 'warning',
      category: 'verification',
      title: `Площадь не определена: ${unresolved.length} позиций`,
      detail:
        'Строки не участвуют в итоговой сумме. Внесите площадь по первоисточнику — подсказка, откуда брать число, показана в строке таблицы.',
      roomKeys: unresolved.map((i) => i.key),
    });
  }

  const unverified = instances.filter((i) => i.origin === 'norm-unverified');
  if (unverified.length > 0) {
    issues.push({
      id: 'unverified-norms',
      level: 'warning',
      category: 'verification',
      title: `Ссылка на норму не проверена: ${unverified.length} позиций`,
      detail:
        'Число есть, но пункт документа не сверен с первоисточником. Такие строки в подтверждённую сумму не входят.',
      roomKeys: unverified.map((i) => i.key),
    });
  }

  const deviations = instances.filter((i) => i.overridden && i.room.area.norm?.verified);
  for (const instance of deviations) {
    issues.push({
      id: `deviation-${instance.key}`,
      level: 'warning',
      category: 'norm',
      title: `Отступление от нормы: «${instance.displayName}»`,
      detail:
        instance.audit.norm && instance.room.area.norm
          ? `Значение изменено вручную при наличии проверенной нормы ${instance.room.area.norm.doc}, ${instance.room.area.norm.clause}. Отступление попадает в отчёт.`
          : 'Значение изменено вручную при наличии проверенной нормы.',
      roomKeys: [instance.key],
    });
  }

  const requiredExcluded = excluded.filter((e) => e.room.status === 'required');
  if (requiredExcluded.length > 0) {
    issues.push({
      id: 'required-excluded',
      level: 'info',
      category: 'params',
      title: `Обязательные помещения исключены параметрами: ${requiredExcluded.length}`,
      detail: requiredExcluded.map((e) => `${e.room.name} (${e.group.name})`).join(' · '),
    });
  }

  collectEdgeIssues(type, instances, customEdges, edgeOverrides, issues);
  collectFloorIssues(instances, floorAssignment, floors, issues);
  collectZoneIssues(type, instances, customEdges, edgeOverrides, issues);

  const limit = type.grossAreaLimit;
  if (limit && totals.grossProvisional > 0) {
    const x = typeof scope[limit.by] === 'number' ? (scope[limit.by] as number) : null;
    const points = [...limit.points].sort((a, b) => a.at - b.at);
    if (x !== null && x >= points[0].at) {
      const upper = points.findIndex((p) => p.at >= x);
      const cap =
        upper <= 0
          ? points[points.length - 1].value
          : points[upper - 1].value +
            ((points[upper].value - points[upper - 1].value) * (x - points[upper - 1].at)) /
              (points[upper].at - points[upper - 1].at);
      if (totals.grossProvisional > cap) {
        issues.push({
          id: 'gross-area-limit',
          level: 'warning',
          category: 'norm',
          title: limit.title,
          detail: `${limit.detail} Предел при ${x}: ${cap.toFixed(0)} м², расчётная общая площадь: ${totals.grossProvisional.toFixed(0)} м².`,
        });
      }
    }
  }

  for (const rule of type.validations ?? []) {
    if (evaluateRule(rule.when, scope)) {
      issues.push({
        id: `validation-${rule.id}`,
        level: rule.level,
        category: 'params',
        title: rule.title,
        detail: rule.detail,
      });
    }
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * Ручные правки связей. Отступление от нормативной связи — не мелочь:
 * оно выносится в отчёт отдельной строкой с обоснованием автора.
 */
function collectEdgeIssues(
  type: BuildingType,
  instances: RoomInstance[],
  customEdges: CustomEdge[],
  edgeOverrides: Record<string, EdgeOverride>,
  issues: Issue[],
): void {
  const names = new Map([
    ...type.rooms.map((r) => [r.id, r.name] as const),
    ...instances.map((i) => [i.room.id, i.room.name] as const),
  ]);
  const label = (id: string) => names.get(id) ?? id;

  for (const rule of type.adjacency) {
    const key = ruleKey(rule);
    const override = edgeOverrides[key];
    if (!override) continue;

    const pair = `«${label(rule.from)}» ↔ «${label(rule.to)}»`;
    const isNorm = rule.basis === 'norm';

    if (override.deleted) {
      issues.push({
        id: `edge-deleted-${key}`,
        level: isNorm ? 'error' : 'info',
        category: 'norm',
        title: `Связь снята: ${pair}`,
        detail: isNorm
          ? `Снята нормативная связь (${EDGE_STYLE[rule.type].label.toLowerCase()}). ${rule.norm ? `${rule.norm.doc}, ${rule.norm.clause}. ` : ''}Нормативные связи снимать нельзя — восстановите её или оформите отступление с обоснованием.`
          : `Снята технологическая связь (${EDGE_STYLE[rule.type].label.toLowerCase()}). Основание в базе: ${rule.reason}.`,
      });
      continue;
    }

    if (override.type && override.type !== rule.type) {
      const from = EDGE_STYLE[rule.type].label.toLowerCase();
      const to = EDGE_STYLE[override.type].label.toLowerCase();
      issues.push({
        id: `edge-type-${key}`,
        level: isNorm ? 'warning' : 'info',
        category: 'norm',
        title: `${isNorm ? 'Отступление от нормативной связи' : 'Изменён тип связи'}: ${pair}`,
        detail: `${from} → ${to}. ${
          rule.norm ? `Норма: ${rule.norm.doc}, ${rule.norm.clause}. ` : `Основание в базе: ${rule.reason}. `
        }${override.deviation ? `Обоснование автора: ${override.deviation}` : 'Обоснование не указано.'}`,
      });
    }

    if (override.deviation && !override.type) {
      issues.push({
        id: `edge-deviation-${key}`,
        level: 'warning',
        category: 'norm',
        title: `Отступление: ${pair}`,
        detail: `${rule.norm ? `${rule.norm.doc}, ${rule.norm.clause}. ` : ''}Обоснование автора: ${override.deviation}`,
      });
    }
  }

  if (customEdges.length > 0) {
    issues.push({
      id: 'custom-edges',
      level: 'info',
      category: 'norm',
      title: `Связи, добавленные вручную: ${customEdges.length}`,
      detail: customEdges
        .map((e) => `${label(e.from)} ↔ ${label(e.to)} — ${EDGE_STYLE[e.type].label.toLowerCase()}: ${e.reason}`)
        .join(' · '),
    });
  }
}

/**
 * Раскладка по этажам. Пока помещение не назначено этажу, ограничения
 * `floorsAllowed` / `floorsForbidden` и запреты `notAbove` / `notBelow`
 * проверить не на чем — они включаются вместе со свимлейнами.
 */
function collectFloorIssues(
  instances: RoomInstance[],
  floorAssignment: Record<string, number>,
  floors: number[],
  issues: Issue[],
): void {
  const assignedOf = (roomId: string) =>
    roomId in floorAssignment ? floorAssignment[roomId] : null;

  for (const instance of instances) {
    const floor = assignedOf(instance.room.id);
    if (floor === null) continue;
    const { floorsAllowed, floorsForbidden } = instance.room.constraints;

    if (!floors.includes(floor)) {
      issues.push({
        id: `floor-missing-${instance.key}`,
        level: 'error',
        category: 'constraints',
        title: `«${instance.displayName}» назначено на несуществующий этаж`,
        detail: `Помещение отнесено к уровню «${floorLabel(floor)}», которого нет при текущих параметрах здания.`,
        roomKeys: [instance.key],
      });
      continue;
    }

    if (floorsForbidden?.includes(floor)) {
      issues.push({
        id: `floor-forbidden-${instance.key}`,
        level: 'error',
        category: 'constraints',
        title: `«${instance.displayName}» на запрещённом уровне`,
        detail: `Помещение размещено ${floorIn(floor)}. Размещение ${floorsForbidden.map(floorIn).join(', ')} не допускается.`,
        roomKeys: [instance.key],
      });
    } else if (floorsAllowed?.length && !floorsAllowed.includes(floor)) {
      issues.push({
        id: `floor-not-allowed-${instance.key}`,
        level: 'error',
        category: 'constraints',
        title: `«${instance.displayName}» вне допустимых уровней`,
        detail: `Помещение размещено ${floorIn(floor)}, а допускается только ${floorsAllowed.map(floorIn).join(', ')}.`,
        roomKeys: [instance.key],
      });
    }
  }

  // Запреты размещения над и под — например, санузлы над помещениями пищеблока.
  const byRoom = new Map(instances.map((i) => [i.room.id, i]));
  for (const instance of instances) {
    const own = assignedOf(instance.room.id);
    if (own === null) continue;

    for (const targetId of instance.room.constraints.notAbove ?? []) {
      const target = assignedOf(targetId);
      if (target === null || own <= target) continue;
      issues.push({
        id: `not-above-${instance.key}-${targetId}`,
        level: 'error',
        category: 'constraints',
        title: `«${instance.displayName}» размещено над «${byRoom.get(targetId)?.displayName ?? targetId}»`,
        detail: `Размещение над этим помещением не допускается: ${floorLabel(own)} над уровнем «${floorLabel(target)}».`,
        roomKeys: [instance.key],
      });
    }

    for (const targetId of instance.room.constraints.notBelow ?? []) {
      const target = assignedOf(targetId);
      if (target === null || own >= target) continue;
      issues.push({
        id: `not-below-${instance.key}-${targetId}`,
        level: 'error',
        category: 'constraints',
        title: `«${instance.displayName}» размещено под «${byRoom.get(targetId)?.displayName ?? targetId}»`,
        detail: `Размещение под этим помещением не допускается: ${floorLabel(own)} под уровнем «${floorLabel(target)}».`,
        roomKeys: [instance.key],
      });
    }
  }
}

/** Потоки, для которых пересечение чистой и грязной зон имеет смысл. */
const MATERIAL_FLOWS = new Set(['food', 'linen', 'waste', 'goods']);

/**
 * Пересечение чистых и грязных путей.
 *
 * Проверяются только связи, которые добавил или изменил пользователь. Связи
 * базы знаний — выверенная модель норматива: смежность класса с санузлом секции
 * или зала с раздевальными предписана самой нормой, и предупреждать о них
 * значит топить настоящие конфликты в шуме. Санитарные зоны базовых связей
 * показывает режим окраски «по зонам».
 */
function collectZoneIssues(
  type: BuildingType,
  instances: RoomInstance[],
  customEdges: CustomEdge[],
  edgeOverrides: Record<string, EdgeOverride>,
  issues: Issue[],
): void {
  const rooms = new Map(instances.map((i) => [i.room.id, i]));

  const check = (
    from: string,
    to: string,
    edgeType: string,
    flow: string | undefined,
    origin: string,
    keyPart: string,
  ) => {
    // Шлюз и есть решение проблемы, разнесение и запрет — не смежность.
    if (edgeType !== 'direct') return;
    if (!flow || !MATERIAL_FLOWS.has(flow)) return;

    const a = rooms.get(from);
    const b = rooms.get(to);
    if (!a || !b) return;
    const zones = [a.room.zone, b.room.zone];
    if (!zones.includes('clean') || !zones.includes('dirty')) return;

    issues.push({
      id: `zone-cross-${keyPart}`,
      level: 'warning',
      category: 'constraints',
      title: `Чистая и грязная зоны напрямую: «${a.displayName}» ↔ «${b.displayName}»`,
      detail: `${origin} Связь несёт материальный поток и соединяет зоны напрямую: ${a.room.name} — ${a.room.zone === 'clean' ? 'чистая' : 'грязная'}, ${b.room.name} — ${b.room.zone === 'clean' ? 'чистая' : 'грязная'}. Рассмотрите шлюз или тамбур («через шлюз»), иначе потоки пересекутся.`,
      roomKeys: [a.key, b.key],
    });
  };

  for (const rule of type.adjacency) {
    const override = edgeOverrides[ruleKey(rule)];
    if (!override?.type || override.type === rule.type) continue;
    check(
      rule.from,
      rule.to,
      override.type,
      rule.flow,
      `Тип связи изменён вручную с «${EDGE_STYLE[rule.type].label.toLowerCase()}».`,
      ruleKey(rule),
    );
  }

  for (const edge of customEdges) {
    check(edge.from, edge.to, edge.type, edge.flow, 'Связь добавлена вручную.', edge.id);
  }
}
