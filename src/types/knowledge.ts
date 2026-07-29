/**
 * Модель нормативной базы знаний.
 *
 * Интерфейсы соответствуют разделу 3 технического задания. Поля, помеченные
 * `ДОПОЛНЕНИЕ`, добавлены сверх ТЗ — без них движок не может связать данные
 * (например, `CountRule.per: 'group'` не с чем сопоставить). Каждое такое поле
 * прокомментировано отдельно.
 */

/** Ссылка на норму. Единственный источник доверия к числу. */
export interface NormRef {
  /** "СП РК 3.02-111-2012" */
  doc: string;
  /** "4.4.2, таблица 4" */
  clause: string;
  /** "с изм. по 10.12.2025" */
  edition?: string;
  /** дословная формулировка пункта */
  quote?: string;
  source: NormSource;
  /** проверено человеком по первоисточнику */
  verified: boolean;
}

export type NormSource =
  /** СН РК / СП РК */
  | 'norm'
  /** санитарные правила */
  | 'sanpin'
  | 'gost'
  /** методика проектирования, пособия, зарубежная практика */
  | 'practice'
  /** задание на проектирование */
  | 'assignment';

export type Status =
  /** обязательное по норме */
  | 'required'
  /** обязательное при выполнении условия (бассейн, интернат, 2 смены) */
  | 'conditional'
  /** рекомендуемое нормой / «следует предусматривать» */
  | 'recommended'
  /** желательное, по методике проектирования или заданию */
  | 'optional';

export type FlowType =
  | 'visitors'
  | 'children'
  | 'staff'
  | 'food'
  | 'linen'
  | 'waste'
  | 'goods'
  | 'medical';

export type UnitKind = 'group' | 'class' | 'section' | 'floor' | 'building' | 'place';

export interface CountRule {
  kind: 'fixed' | 'perUnit' | 'formula';
  /** для fixed */
  value?: number;
  per?: UnitKind;
  /** 1 шт на N единиц */
  divisor?: number;
  /** безопасно вычисляемое выражение по параметрам */
  expr?: string;
  round: 'up' | 'down' | 'nearest';
}

export type AreaUnit = 'м²' | 'м²/место' | 'м²/учащегося' | 'м²/группу' | 'м²/класс';

/**
 * ДОПОЛНЕНИЕ. Площадь по таблице норматива.
 *
 * СП РК задаёт площади сопутствующих помещений таблицей по проектной
 * мощности (`interpolate` — примечание к таблице К.1 прямо предписывает
 * интерполяцию), а площади групповых ячеек — по архитектурному типу ОДВО
 * (`match`). Без этого пришлось бы городить формулы или плодить помещения.
 */
export interface AreaLookup {
  mode: 'interpolate' | 'match';
  /** ключ области видимости для интерполяции, например `places_total` */
  by?: string;
  /** узлы таблицы; за пределами диапазона значение не экстраполируется */
  points?: { at: number; value: number }[];
  /** первый подошедший случай выигрывает */
  cases?: { when: RuleExpr; value: number; label?: string }[];
}

export interface AreaRule {
  kind: 'fixed' | 'perPlace' | 'perUnit' | 'range' | 'percentOfNet' | 'formula' | 'lookup';
  value?: number;
  min?: number;
  max?: number;
  unit: AreaUnit;
  expr?: string;
  /** ДОПОЛНЕНИЕ. Таблица норматива для `kind: 'lookup'`. */
  lookup?: AreaLookup;
  /** null => значение считается неподтверждённым */
  norm: NormRef | null;
  /**
   * ДОПОЛНЕНИЕ (п. 10.5 ТЗ). Плейсхолдер обязан нести указание, из какой
   * таблицы какого документа пользователю взять настоящее число.
   */
  sourceHint?: string;
}

export interface RoomConstraints {
  /** -1 подвал, 0 цоколь, 1..n этажи */
  floorsAllowed?: number[];
  floorsForbidden?: number[];
  daylight: 'required' | 'desirable' | 'not-required';
  orientation?: 'N' | 'S' | 'E' | 'W' | 'SE' | 'SW' | 'any';
  /** м, в чистоте */
  minHeight?: number;
  /** id помещений, НАД которыми размещать нельзя */
  notAbove?: string[];
  notBelow?: string[];
  /** требует самостоятельного наружного входа */
  separateEntrance?: boolean;
  wetZone?: boolean;
  /** Ф1.1, Ф4.1, В1-В4 и т.д. */
  fireHazardClass?: string;
}

export interface Room {
  /** "kg.group.sleeping" */
  id: string;
  /** номер по экспликации-шаблону */
  code: string;
  name: string;
  nameKz?: string;
  /** id функциональной группы */
  group: string;
  status: Status;
  /** при каких параметрах помещение появляется */
  condition?: RuleExpr;
  count: CountRule;
  area: AreaRule;
  constraints: RoomConstraints;
  flows: FlowType[];
  zone: 'clean' | 'dirty' | 'neutral';
  notes?: string;
  norms: NormRef[];
  /**
   * ДОПОЛНЕНИЕ. Помещение добавлено пользователем, а не пришло из базы знаний.
   * Его площадь трактуется как задание на проектирование (`assignment`).
   */
  custom?: boolean;
}

export interface RoomGroup {
  /** "kg.group-cell", "sch.primary-block" */
  id: string;
  /** "Групповая ячейка", "Блок начальных классов" */
  name: string;
  color: string;
  order: number;
  /** повторяемая ячейка (тиражируется по числу групп/классов) */
  isCell?: boolean;
  /**
   * ДОПОЛНЕНИЕ. id параметра-матрицы, по строкам которой тиражируется ячейка.
   * Каждая строка матрицы (возрастная группа, ступень) даёт свой экземпляр
   * ячейки, потому что площади ячейки яслей и дошкольной группы различаются.
   * Если не задан — ячейка тиражируется по `unitCounts` типа здания.
   */
  cellSource?: string;
}

export type AdjacencyType =
  /** непосредственная смежность, дверь в дверь */
  | 'direct'
  /** в пределах блока */
  | 'near'
  /** через коммуникацию */
  | 'via-corridor'
  /** через шлюз/тамбур/предбанник */
  | 'via-airlock'
  /** визуальный/зрительный контроль без прохода */
  | 'visual'
  /** должны быть разнесены */
  | 'separated'
  /** соседство/размещение недопустимо */
  | 'forbidden';

/** Связь между помещениями — основа диаграммы. */
export interface AdjacencyRule {
  from: string;
  to: string;
  type: AdjacencyType;
  strength: 1 | 2 | 3 | 4 | 5;
  /** человекочитаемое обоснование */
  reason: string;
  basis: 'norm' | 'technology' | 'ergonomics';
  norm?: NormRef;
  /** ДОПОЛНЕНИЕ. Поток, который несёт связь — для фильтра по слоям (этап 5). */
  flow?: FlowType;
}

export interface ParameterOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * ДОПОЛНЕНИЕ. Описание контрола `group-matrix`: строка = возрастная группа
 * или ступень, столбцы = количество и наполняемость.
 */
export interface MatrixDef {
  rowLabel: string;
  countLabel: string;
  capacityLabel: string;
  rows: {
    id: string;
    label: string;
    hint?: string;
    defaultCount: number;
    defaultCapacity: number;
    /** норматив наполняемости; пользователь может переопределить */
    capacityNorm: NormRef | null;
    /**
     * Метки строки. Движок публикует агрегаты `<paramId>_tag_<tag>_count`
     * и `<paramId>_tag_<tag>_places`, чтобы правила могли ссылаться на
     * «все ясельные группы» без перечисления строк.
     */
    tags?: string[];
  }[];
}

/** Параметр левой панели. */
export interface ParameterDef {
  id: string;
  label: string;
  control: 'select' | 'number' | 'toggle' | 'multiselect' | 'group-matrix';
  options?: ParameterOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  default: unknown;
  visibleIf?: RuleExpr;
  /** подсказка «откуда этот параметр» */
  helpNorm?: NormRef;
  /**
   * ДОПОЛНЕНИЕ. Текстовое пояснение к параметру, когда ссылки на конкретный
   * пункт нет. Не заменяет `helpNorm` и в UI подаётся другим значком.
   */
  help?: string;
  /** ДОПОЛНЕНИЕ. Секция аккордеона левой панели. */
  section?: string;
  /** ДОПОЛНЕНИЕ. Описание матрицы для control === 'group-matrix'. */
  matrix?: MatrixDef;
}

/** Предикат по значениям параметров. */
export type RuleExpr =
  | { eq: [string, unknown] }
  | { neq: [string, unknown] }
  | { gt: [string, number] }
  | { gte: [string, number] }
  | { lt: [string, number] }
  | { in: [string, unknown[]] }
  | { and: RuleExpr[] }
  | { or: RuleExpr[] }
  | { not: RuleExpr };

export interface BuildingType {
  /** "kindergarten" | "school" */
  id: string;
  name: string;
  parameters: ParameterDef[];
  groups: RoomGroup[];
  rooms: Room[];
  adjacency: AdjacencyRule[];
  /** перечень документов типа */
  normBase: NormRef[];
  /**
   * ДОПОЛНЕНИЕ. Как считать единицы, на которые ссылается `CountRule.per`.
   * Выражения вычисляются в области видимости параметров.
   * Пример: { group: "groups_total", place: "places_total", building: "1" }
   */
  unitCounts: Partial<Record<UnitKind, string>>;
  /** ДОПОЛНЕНИЕ. Порядок и названия секций аккордеона левой панели. */
  sections?: { id: string; label: string }[];
  /**
   * ДОПОЛНЕНИЕ. Несовместимости параметров конкретного типа здания —
   * данными, а не кодом, чтобы движок проверок оставался типонезависимым.
   * Срабатывает, когда `when` истинно.
   */
  validations?: ValidationRule[];
  /**
   * ДОПОЛНЕНИЕ. Предельная общая площадь по нормативу — сравнивается с итогом
   * расчёта. Приложение Ж СП РК 3.02-111-2012* задаёт её таблицей по
   * вместимости; между узлами применяется интерполяция.
   */
  grossAreaLimit?: {
    by: string;
    points: { at: number; value: number }[];
    title: string;
    detail: string;
  };
}

export interface ValidationRule {
  id: string;
  level: 'error' | 'warning' | 'info';
  when: RuleExpr;
  title: string;
  detail: string;
}

/** Документ нормативной базы (реестр `/data/knowledge/norms.json`). */
export interface NormDocument {
  id: string;
  doc: string;
  title: string;
  edition?: string;
  status: 'active' | 'superseded' | 'unknown';
  source: NormSource;
  scope: string[];
  notes?: string;
}

export interface KnowledgeBase {
  version: string;
  updatedAt: string;
  documents: NormDocument[];
  buildingTypes: BuildingType[];
}
