import type { AdjacencyRule, AdjacencyType, FlowType, Room, Status } from '@/types/knowledge';

/**
 * Ручные правки поверх базы знаний: добавленные помещения и связи,
 * изменения и отступления по нормативным связям.
 *
 * Хранятся в проекте отдельно от базы и накладываются на неё при расчёте,
 * поэтому обновление нормативной базы не стирает работу проектировщика.
 */

export interface CustomRoom {
  id: string;
  code: string;
  name: string;
  group: string;
  status: Status;
  count: number;
  areaEach: number | null;
  flows: FlowType[];
  zone: 'clean' | 'dirty' | 'neutral';
  note?: string;
}

export interface CustomEdge {
  id: string;
  /** id помещения, а не узла: связь переживает сворачивание повторов */
  from: string;
  to: string;
  type: AdjacencyType;
  strength: 1 | 2 | 3 | 4 | 5;
  reason: string;
  basis: 'technology' | 'ergonomics';
  flow?: FlowType;
}

/** Правка связи, пришедшей из базы знаний. */
export interface EdgeOverride {
  type?: AdjacencyType;
  strength?: 1 | 2 | 3 | 4 | 5;
  /** снятие связи; для `basis: 'norm'` запрещено */
  deleted?: boolean;
  /** обоснование отступления от нормативной связи — обязательно, попадает в отчёт */
  deviation?: string;
}

/** Устойчивый ключ связи из базы: тип входит в ключ, потому что пара может иметь несколько связей. */
export function ruleKey(rule: Pick<AdjacencyRule, 'from' | 'to' | 'type'>): string {
  return `${rule.from}|${rule.to}|${rule.type}`;
}

/** Ключ связи независимо от направления — чтобы не заводить дубль в обратную сторону. */
export function pairKey(from: string, to: string): string {
  return from < to ? `${from}::${to}` : `${to}::${from}`;
}

export function createId(prefix: string): string {
  return `${prefix}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Помещение пользователя в виде обычного `Room` — дальше движок не различает их. */
export function toRoom(custom: CustomRoom): Room {
  return {
    id: custom.id,
    code: custom.code,
    name: custom.name,
    group: custom.group,
    status: custom.status,
    count: { kind: 'fixed', value: Math.max(1, Math.trunc(custom.count)), round: 'up' },
    area: {
      kind: 'fixed',
      value: custom.areaEach ?? undefined,
      unit: 'м²',
      norm: null,
      sourceHint:
        'Помещение добавлено вручную. Площадь принята по заданию на проектирование — при наличии нормы укажите документ и пункт.',
    },
    constraints: { daylight: 'not-required' },
    flows: custom.flows,
    zone: custom.zone,
    notes: custom.note,
    norms: [],
    custom: true,
  };
}
