import type {
  AreaUnit,
  BuildingType,
  NormRef,
  NormSource,
  Room,
  RoomGroup,
} from '@/types/knowledge';

/** Значение контрола `group-matrix`. */
export interface MatrixRowValue {
  rowId: string;
  count: number;
  capacity: number;
}

/** Ручные правки пользователя поверх расчёта. Ключ — `RoomInstance.key`. */
export interface RoomOverride {
  /** площадь единицы помещения, м² */
  areaEach?: number;
  /** количество помещений */
  count?: number;
  /** обоснование правки, обязательно при отступлении от нормы */
  note?: string;
  /** ссылка на норму, если пользователь её нашёл и проверил */
  norm?: NormRef;
}

/** Экземпляр повторяемой ячейки: одна строка матрицы групп. */
export interface CellVariant {
  id: string;
  label: string;
  /** сколько таких ячеек */
  units: number;
  /** мест в одной ячейке */
  capacity: number;
  /** метки строки матрицы — доступны правилам как `row_tags` */
  tags: string[];
}

/** Откуда взято число площади. */
export type AreaOrigin =
  /** подтверждённая ссылка на норму */
  | 'norm-verified'
  /** число из базы, но ссылка не проверена по первоисточнику */
  | 'norm-unverified'
  /** введено пользователем как задание на проектирование */
  | 'assignment'
  /** числа нет */
  | 'unresolved';

export interface AuditStep {
  label: string;
  value: string;
}

export interface AuditTrail {
  /** «12 групп × 50.0 м²/группу = 600.0 м²» */
  formula: string;
  steps: AuditStep[];
  norm: NormRef | null;
  sourceHint?: string;
  /** источник значения площади для значка в UI */
  source: NormSource | null;
}

export interface RoomInstance {
  /** стабильный ключ: `roomId@variantId` */
  key: string;
  room: Room;
  group: RoomGroup;
  variant: CellVariant | null;
  /** отображаемое имя с уточнением варианта ячейки */
  displayName: string;
  count: number;
  areaEach: number | null;
  areaMin: number | null;
  areaMax: number | null;
  areaTotal: number | null;
  unit: AreaUnit;
  origin: AreaOrigin;
  /** входит ли в подтверждённую сумму */
  confirmed: boolean;
  audit: AuditTrail;
  overridden: boolean;
}

export type IssueLevel = 'error' | 'warning' | 'info';
export type IssueCategory = 'norm' | 'params' | 'constraints' | 'verification';

export interface Issue {
  id: string;
  level: IssueLevel;
  category: IssueCategory;
  title: string;
  detail: string;
  roomKeys?: string[];
}

export interface Totals {
  /** рабочая площадь по подтверждённым строкам */
  netConfirmed: number;
  /** рабочая площадь со всеми строками, у которых есть число */
  netProvisional: number;
  /** общая = рабочая × K */
  grossConfirmed: number;
  grossProvisional: number;
  /** ориентировочный строительный объём по общей площади и высоте этажа */
  volumeConfirmed: number;
  places: number;
  groups: number;
  /** м² общей площади на одно место, по подтверждённой сумме */
  areaPerPlace: number | null;
  coefK: number;
  floorHeight: number;
  /** позиций всего / из них с проверенным числом */
  positionsTotal: number;
  positionsConfirmed: number;
  positionsUnresolved: number;
}

export interface GroupTotal {
  group: RoomGroup;
  netConfirmed: number;
  netProvisional: number;
  positions: number;
}

export interface ComputationResult {
  type: BuildingType;
  scope: Record<string, unknown>;
  instances: RoomInstance[];
  byGroup: GroupTotal[];
  totals: Totals;
  issues: Issue[];
  /** помещения, исключённые условиями — для панели «что не попало» */
  excluded: { room: Room; group: RoomGroup }[];
}
