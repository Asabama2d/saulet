import type {
  AreaRule,
  BuildingType,
  CountRule,
  NormSource,
  ParameterDef,
  Room,
  RoomGroup,
} from '@/types/knowledge';
import { plural } from '@/lib/format';
import { evaluateArithmetic, evaluateRule, type Scope } from './expr';
import { toRoom, type CustomEdge, type CustomRoom, type EdgeOverride } from './manual';
import type {
  AreaOrigin,
  AuditStep,
  CellVariant,
  ComputationResult,
  GroupTotal,
  MatrixRowValue,
  RoomInstance,
  RoomOverride,
  Totals,
} from './types';
import { collectIssues } from './checks';

/** Площади округляются вверх до 0.1 м². */
export function roundArea(value: number): number {
  return Math.ceil(value * 10 - 1e-9) / 10;
}

function applyRounding(value: number, mode: CountRule['round']): number {
  if (mode === 'up') return Math.ceil(value - 1e-9);
  if (mode === 'down') return Math.floor(value + 1e-9);
  return Math.round(value);
}

/**
 * Сводит сохранённое значение матрицы с описанием из базы: строки, добавленные
 * в базу позже, появляются со значениями по умолчанию, исчезнувшие — отбрасываются.
 */
export function normalizeMatrix(param: ParameterDef, stored: unknown): MatrixRowValue[] {
  const rows = param.matrix?.rows ?? [];
  const saved = new Map<string, MatrixRowValue>();
  if (Array.isArray(stored)) {
    for (const item of stored as MatrixRowValue[]) {
      if (item && typeof item.rowId === 'string') saved.set(item.rowId, item);
    }
  }
  return rows.map((row) => {
    const hit = saved.get(row.id);
    return {
      rowId: row.id,
      count: typeof hit?.count === 'number' ? Math.max(0, Math.trunc(hit.count)) : row.defaultCount,
      capacity:
        typeof hit?.capacity === 'number'
          ? Math.max(0, Math.trunc(hit.capacity))
          : row.defaultCapacity,
    };
  });
}

/** Область видимости для выражений: параметры + производные величины. */
export function buildScope(type: BuildingType, params: Record<string, unknown>): Scope {
  const scope: Scope = {};
  let groupsTotal = 0;
  let placesTotal = 0;

  for (const param of type.parameters) {
    const value = param.id in params ? params[param.id] : param.default;
    if (param.control === 'group-matrix') {
      const rows = normalizeMatrix(param, value);
      const units = rows.reduce((sum, r) => sum + r.count, 0);
      const places = rows.reduce((sum, r) => sum + r.count * r.capacity, 0);
      scope[`${param.id}_units`] = units;
      scope[`${param.id}_places`] = places;
      // Наибольшая наполняемость строки: по ней считаются учебные кабинеты,
      // рассчитанные на полный класс, а не на среднюю по объекту группу.
      scope[`${param.id}_capacity_max`] = rows.reduce(
        (max, r) => (r.count > 0 ? Math.max(max, r.capacity) : max),
        0,
      );

      // Агрегаты по меткам строк: groupMatrix_tag_nursery_count и т. п.
      const tagged = new Map<string, { count: number; places: number }>();
      for (const row of rows) {
        const def = param.matrix?.rows.find((r) => r.id === row.rowId);
        for (const tag of def?.tags ?? []) {
          const acc = tagged.get(tag) ?? { count: 0, places: 0 };
          acc.count += row.count;
          acc.places += row.count * row.capacity;
          tagged.set(tag, acc);
        }
      }
      for (const [tag, acc] of tagged) {
        scope[`${param.id}_tag_${tag}_count`] = acc.count;
        scope[`${param.id}_tag_${tag}_places`] = acc.places;
        scope[`${param.id}_tag_${tag}_share`] = places > 0 ? (acc.places / places) * 100 : 0;
      }

      groupsTotal += units;
      placesTotal += places;
    } else {
      scope[param.id] = value;
    }
  }

  scope.groups_total = groupsTotal;
  scope.places_total = placesTotal;
  return scope;
}

function unitCount(type: BuildingType, scope: Scope, unit: string): number {
  const expr = type.unitCounts[unit as keyof typeof type.unitCounts];
  if (!expr) return 0;
  return evaluateArithmetic(expr, scope);
}

/** Экземпляры повторяемой ячейки — по строкам матрицы, на которую она ссылается. */
function cellVariants(
  type: BuildingType,
  group: RoomGroup,
  params: Record<string, unknown>,
  scope: Scope,
): (CellVariant | null)[] {
  if (!group.isCell) return [null];

  const param = group.cellSource
    ? type.parameters.find((p) => p.id === group.cellSource)
    : undefined;

  if (param?.matrix) {
    const rows = normalizeMatrix(param, params[param.id]);
    return rows
      .filter((row) => row.count > 0)
      .map((row) => {
        const def = param.matrix!.rows.find((r) => r.id === row.rowId)!;
        return {
          id: row.rowId,
          label: def.label,
          units: row.count,
          capacity: row.capacity,
          tags: def.tags ?? [],
        };
      });
  }

  const units = unitCount(type, scope, 'group');
  if (units <= 0) return [];
  return [{ id: 'all', label: 'Все ячейки', units, capacity: 0, tags: [] }];
}

interface AreaResult {
  each: number | null;
  min: number | null;
  max: number | null;
  formula: string;
  deferred: boolean;
}

function computeAreaFromRule(
  rule: AreaRule,
  countRule: CountRule,
  type: BuildingType,
  scope: Scope,
  variant: CellVariant | null,
): AreaResult {
  const none = (formula: string): AreaResult => ({
    each: null,
    min: null,
    max: null,
    formula,
    deferred: false,
  });

  switch (rule.kind) {
    case 'fixed': {
      if (typeof rule.value !== 'number') return none('значение не задано');
      const each = roundArea(rule.value);
      return { each, min: each, max: each, formula: `${each.toFixed(1)} м²`, deferred: false };
    }
    case 'perPlace': {
      if (typeof rule.value !== 'number') return none('значение не задано');
      const places = variant ? variant.capacity : (scope.places_total as number);
      const each = roundArea(rule.value * places);
      return {
        each,
        min: each,
        max: each,
        formula: `${rule.value} ${rule.unit} × ${places} мест = ${each.toFixed(1)} м²`,
        deferred: false,
      };
    }
    case 'perUnit': {
      if (typeof rule.value !== 'number') return none('значение не задано');
      const unit = countRule.per ?? 'building';
      const units = unitCount(type, scope, unit);
      const each = roundArea(rule.value * units);
      return {
        each,
        min: each,
        max: each,
        formula: `${rule.value} ${rule.unit} × ${units} = ${each.toFixed(1)} м²`,
        deferred: false,
      };
    }
    case 'range': {
      if (typeof rule.min !== 'number' || typeof rule.max !== 'number') {
        return none('диапазон не задан');
      }
      const each = roundArea(rule.min);
      return {
        each,
        min: roundArea(rule.min),
        max: roundArea(rule.max),
        formula: `диапазон ${rule.min}–${rule.max} м², в сумму принят минимум ${each.toFixed(1)} м²`,
        deferred: false,
      };
    }
    case 'formula': {
      if (!rule.expr) return none('формула не задана');
      const each = roundArea(evaluateArithmetic(rule.expr, scope));
      return {
        each,
        min: each,
        max: each,
        formula: `${rule.expr} = ${each.toFixed(1)} м²`,
        deferred: false,
      };
    }
    case 'percentOfNet': {
      if (typeof rule.value !== 'number') return none('процент не задан');
      return { each: null, min: null, max: null, formula: `${rule.value} % рабочей площади`, deferred: true };
    }
    case 'lookup': {
      if (!rule.lookup) return none('таблица не задана');
      return lookupArea(rule.lookup, scope) ?? none('в таблице нет подходящей строки');
    }
  }
}

/** Площадь по таблице норматива: интерполяция по числу или выбор по условию. */
function lookupArea(lookup: NonNullable<AreaRule['lookup']>, scope: Scope): AreaResult | null {
  if (lookup.mode === 'match') {
    const hit = lookup.cases?.find((c) => evaluateRule(c.when, scope));
    if (!hit) return null;
    const each = roundArea(hit.value);
    return {
      each,
      min: each,
      max: each,
      formula: hit.label
        ? `по таблице (${hit.label}) = ${each.toFixed(1)} м²`
        : `по таблице = ${each.toFixed(1)} м²`,
      deferred: false,
    };
  }

  const raw = scope[lookup.by!];
  const x = typeof raw === 'number' ? raw : null;
  const points = [...(lookup.points ?? [])].sort((a, b) => a.at - b.at);
  if (x === null || points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];

  // За пределами таблицы значение не экстраполируется: норматив его не задаёт.
  // Берётся крайний столбец, и это видно в строке расчёта.
  if (x <= first.at) {
    const each = roundArea(first.value);
    const note = x < first.at ? ` (значение ниже первого столбца таблицы ${first.at})` : '';
    return { each, min: each, max: each, formula: `по таблице при ${first.at} = ${each.toFixed(1)} м²${note}`, deferred: false };
  }
  if (x >= last.at) {
    const each = roundArea(last.value);
    const note = x > last.at ? ` (значение выше последнего столбца таблицы ${last.at})` : '';
    return { each, min: each, max: each, formula: `по таблице при ${last.at} = ${each.toFixed(1)} м²${note}`, deferred: false };
  }

  const upper = points.findIndex((p) => p.at >= x);
  const a = points[upper - 1];
  const b = points[upper];
  const value = a.value + ((b.value - a.value) * (x - a.at)) / (b.at - a.at);
  const each = roundArea(value);
  return {
    each,
    min: each,
    max: each,
    formula: `интерполяция по таблице между ${a.at} → ${a.value} и ${b.at} → ${b.value} при ${x} = ${each.toFixed(1)} м²`,
    deferred: false,
  };
}

function originOf(
  each: number | null,
  room: Room,
  override: RoomOverride | undefined,
): AreaOrigin {
  if (each === null) return 'unresolved';
  if (override?.areaEach !== undefined) {
    return override.norm?.verified ? 'norm-verified' : 'assignment';
  }
  // Помещение, добавленное пользователем, — это задание на проектирование,
  // а не непроверенная норма.
  if (room.custom) return 'assignment';
  return room.area.norm?.verified ? 'norm-verified' : 'norm-unverified';
}

function sourceOf(room: Room, override: RoomOverride | undefined): NormSource | null {
  if (override?.areaEach !== undefined) return override.norm?.source ?? 'assignment';
  if (room.custom) return 'assignment';
  return room.area.norm?.source ?? null;
}

export interface ComputeInput {
  type: BuildingType;
  params: Record<string, unknown>;
  overrides: Record<string, RoomOverride>;
  customRooms?: CustomRoom[];
  customEdges?: CustomEdge[];
  edgeOverrides?: Record<string, EdgeOverride>;
  floorAssignment?: Record<string, number>;
}

export function compute({
  type,
  params,
  overrides,
  customRooms = [],
  customEdges = [],
  edgeOverrides = {},
  floorAssignment = {},
}: ComputeInput): ComputationResult {
  const scope = buildScope(type, params);
  const groups = new Map(type.groups.map((g) => [g.id, g]));

  const instances: RoomInstance[] = [];
  const excluded: { room: Room; group: RoomGroup }[] = [];
  const deferred: { instance: RoomInstance; percent: number }[] = [];
  /** Помещения, чьё правило не удалось вычислить при текущих параметрах. */
  const ruleErrors: { room: Room; group: RoomGroup; message: string }[] = [];

  const allRooms = [...type.rooms, ...customRooms.filter((c) => groups.has(c.group)).map(toRoom)];

  for (const room of allRooms) {
    const group = groups.get(room.group)!;
    const variants = cellVariants(type, group, params, scope);
    let anyIncluded = false;

    for (const variant of variants) {
      const localScope: Scope = variant
        ? {
            ...scope,
            row_groups: variant.units,
            row_places: variant.capacity,
            row_id: variant.id,
            row_tags: variant.tags,
          }
        : scope;

      if (!evaluateRule(room.condition, localScope)) continue;
      anyIncluded = true;

      const key = `${room.id}@${variant?.id ?? '-'}`;
      const override = overrides[key];

      // Количество
      //
      // Выражение считается в try/catch: ошибка в одной строке (например, ноль
      // в поле-делителе) не должна обнулять весь расчёт. Помещение получает
      // нулевое количество и неопределённую площадь, текст ошибки уходит
      // в «Проверки», остальной состав считается дальше.
      let baseCount: number;
      let countFormula: string;
      let ruleError: string | null = null;
      try {
        if (room.count.kind === 'fixed') {
          baseCount = room.count.value ?? 1;
          countFormula = `${baseCount} шт`;
        } else if (room.count.kind === 'perUnit') {
          const units = unitCount(type, localScope, room.count.per ?? 'building');
          const divisor = room.count.divisor ?? 1;
          baseCount = applyRounding(units / divisor, room.count.round);
          countFormula =
            divisor === 1
              ? `${units} × ${room.count.per} = ${baseCount} шт`
              : `${units} ${room.count.per} ÷ ${divisor} = ${baseCount} шт`;
        } else {
          const raw = evaluateArithmetic(room.count.expr!, localScope);
          baseCount = applyRounding(raw, room.count.round);
          countFormula = `${room.count.expr} = ${baseCount} шт`;
        }
      } catch (error) {
        ruleError = error instanceof Error ? error.message : String(error);
        baseCount = 0;
        countFormula = `не вычислено: ${ruleError}`;
      }

      const multiplier = variant ? variant.units : 1;
      let count = baseCount * multiplier;
      if (variant && ruleError === null) {
        countFormula = `${countFormula} × ${plural(variant.units, 'ячейка', 'ячейки', 'ячеек')} = ${count} шт`;
      }
      if (override?.count !== undefined) {
        count = override.count;
        countFormula = `задано вручную: ${count} шт`;
      }

      // Площадь
      let area: AreaResult;
      try {
        area = computeAreaFromRule(room.area, room.count, type, localScope, variant);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ruleError = ruleError ?? message;
        area = { each: null, min: null, max: null, formula: `не вычислено: ${message}`, deferred: false };
      }
      if (ruleError !== null) {
        ruleErrors.push({ room, group, message: ruleError });
      }
      let each = area.each;
      let areaFormula = area.formula;
      if (override?.areaEach !== undefined) {
        each = roundArea(override.areaEach);
        areaFormula = `задано вручную: ${each.toFixed(1)} м²`;
      }

      const areaTotal = each === null ? null : roundArea(each * count);
      const origin = originOf(each, room, override);

      const steps: AuditStep[] = [
        { label: 'Количество', value: countFormula },
        { label: 'Площадь единицы', value: areaFormula },
        {
          label: 'Итого',
          value: areaTotal === null ? 'не определено' : `${areaTotal.toFixed(1)} м²`,
        },
      ];
      if (variant) steps.unshift({ label: 'Ячейка', value: variant.label });
      if (room.condition) {
        steps.unshift({ label: 'Условие', value: 'выполнено при текущих параметрах' });
      }

      const instance: RoomInstance = {
        key,
        room,
        group,
        variant,
        displayName: variant ? `${room.name} — ${variant.label}` : room.name,
        count,
        areaEach: each,
        areaMin: area.min,
        areaMax: area.max,
        areaTotal,
        unit: room.area.unit,
        origin,
        confirmed: origin === 'norm-verified' || origin === 'assignment',
        overridden: override !== undefined,
        audit: {
          formula:
            areaTotal === null
              ? `${count} шт · площадь не определена`
              : `${count} шт × ${(each ?? 0).toFixed(1)} м² = ${areaTotal.toFixed(1)} м²`,
          steps,
          norm: override?.norm ?? room.area.norm,
          sourceHint: room.area.sourceHint,
          source: sourceOf(room, override),
        },
      };

      instances.push(instance);
      if (area.deferred && override?.areaEach === undefined && typeof room.area.value === 'number') {
        deferred.push({ instance, percent: room.area.value });
      }
    }

    if (!anyIncluded) excluded.push({ room, group });
  }

  // Второй проход: percentOfNet считается от рабочей площади остальных помещений.
  if (deferred.length > 0) {
    const base = instances
      .filter((i) => i.room.area.kind !== 'percentOfNet' && i.areaTotal !== null)
      .reduce((sum, i) => sum + (i.areaTotal ?? 0), 0);

    for (const { instance, percent } of deferred) {
      const each = roundArea((base * percent) / 100);
      instance.areaEach = each;
      instance.areaMin = each;
      instance.areaMax = each;
      instance.areaTotal = roundArea(each * instance.count);
      instance.origin = instance.room.area.norm?.verified ? 'norm-verified' : 'norm-unverified';
      instance.confirmed = instance.origin === 'norm-verified';
      instance.audit.formula = `${percent} % × ${base.toFixed(1)} м² = ${instance.areaTotal.toFixed(1)} м²`;
      instance.audit.steps = [
        { label: 'База', value: `рабочая площадь прочих помещений ${base.toFixed(1)} м²` },
        { label: 'Доля', value: `${percent} %` },
        { label: 'Итого', value: `${instance.areaTotal.toFixed(1)} м²` },
      ];
    }
  }

  const totals = computeTotals(instances, scope);
  const byGroup = computeByGroup(type, instances);
  const issues = collectIssues({
    type,
    params,
    scope,
    instances,
    excluded,
    totals,
    customEdges,
    edgeOverrides,
    floorAssignment,
  });

  // Невычислимые правила показываем отдельными ошибками: без них помещение
  // просто исчезло бы из состава без объяснения причины.
  for (const { room, group, message } of ruleErrors) {
    issues.push({
      id: `rule-error:${room.id}`,
      level: 'error',
      category: 'norm',
      title: `Не вычислено правило: ${room.name}`,
      detail: `${message}. Помещение «${room.name}» (${group.name}) исключено из подсчёта площадей. Проверьте параметры, на которые ссылается правило — чаще всего причина в нулевом значении поля-делителя.`,
    });
  }

  return { type, scope, instances, byGroup, totals, issues, excluded };
}

function computeTotals(instances: RoomInstance[], scope: Scope): Totals {
  const netConfirmed = instances
    .filter((i) => i.confirmed && i.areaTotal !== null)
    .reduce((sum, i) => sum + (i.areaTotal ?? 0), 0);
  const netProvisional = instances
    .filter((i) => i.areaTotal !== null)
    .reduce((sum, i) => sum + (i.areaTotal ?? 0), 0);

  const coefK = typeof scope.coefK === 'number' ? scope.coefK : 1.2;
  const floorHeight = typeof scope.floorHeight === 'number' ? scope.floorHeight : 3.3;
  const places = (scope.places_total as number) ?? 0;

  const grossConfirmed = netConfirmed * coefK;
  const grossProvisional = netProvisional * coefK;

  return {
    netConfirmed,
    netProvisional,
    grossConfirmed,
    grossProvisional,
    volumeConfirmed: grossConfirmed * floorHeight,
    places,
    groups: (scope.groups_total as number) ?? 0,
    areaPerPlace: places > 0 && grossConfirmed > 0 ? grossConfirmed / places : null,
    coefK,
    floorHeight,
    positionsTotal: instances.length,
    positionsConfirmed: instances.filter((i) => i.confirmed).length,
    positionsUnresolved: instances.filter((i) => i.areaTotal === null).length,
  };
}

function computeByGroup(type: BuildingType, instances: RoomInstance[]): GroupTotal[] {
  return type.groups
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((group) => {
      const own = instances.filter((i) => i.group.id === group.id);
      return {
        group,
        netConfirmed: own
          .filter((i) => i.confirmed)
          .reduce((sum, i) => sum + (i.areaTotal ?? 0), 0),
        netProvisional: own.reduce((sum, i) => sum + (i.areaTotal ?? 0), 0),
        positions: own.length,
      };
    })
    .filter((g) => g.positions > 0);
}
