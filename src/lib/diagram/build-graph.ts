import type { AdjacencyRule, AdjacencyType, FlowType, RoomGroup, Status } from '@/types/knowledge';
import type { ComputationResult, RoomInstance } from '@/lib/engine/types';
import { ruleKey, type CustomEdge, type EdgeOverride } from '@/lib/engine/manual';

/** Узел диаграммы: помещение или свёрнутая группа повторов. */
export interface DiagramNode {
  id: string;
  roomId: string;
  code: string;
  label: string;
  group: RoomGroup;
  status: Status;
  /** площадь одного помещения — от неё считается радиус */
  areaEach: number | null;
  count: number;
  radius: number;
  instanceKeys: string[];
  zone: 'clean' | 'dirty' | 'neutral';
  flows: FlowType[];
  /** функциональная группа, свёрнутая в пузырь второго порядка */
  isGroupBubble: boolean;
  /** сколько позиций внутри свёрнутого блока */
  positions: number;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  /** id помещений — ручные правки хранятся в них, а не в id узлов */
  fromRoom: string;
  toRoom: string;
  type: AdjacencyType;
  strength: number;
  reason: string;
  basis: AdjacencyRule['basis'];
  flow?: AdjacencyRule['flow'];
  normLabel: string | null;
  /** связь из базы знаний: ключ правки; у добавленных вручную — null */
  ruleKey: string | null;
  /** id пользовательской связи; у базовых — null */
  customId: string | null;
  /** нормативную связь удалить нельзя, только пометить отступлением */
  locked: boolean;
  /** тип изменён вручную */
  edited: boolean;
  deviation?: string;
}

export interface DiagramGraph {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

const MIN_RADIUS = 24;
const MAX_RADIUS = 140;
/** радиус для помещений без заданной площади */
const UNKNOWN_RADIUS = 26;

function mergeInstances(instances: RoomInstance[]): DiagramNode {
  const first = instances[0];
  const count = instances.reduce((sum, i) => sum + i.count, 0);
  const withArea = instances.filter((i) => i.areaEach !== null);
  const areaEach =
    withArea.length === 0
      ? null
      : withArea.reduce((sum, i) => sum + (i.areaEach ?? 0) * i.count, 0) /
        Math.max(
          1,
          withArea.reduce((sum, i) => sum + i.count, 0),
        );

  return {
    id: first.room.id,
    roomId: first.room.id,
    code: first.room.code,
    label: first.room.name,
    group: first.group,
    status: first.room.status,
    areaEach,
    count,
    radius: UNKNOWN_RADIUS,
    instanceKeys: instances.map((i) => i.key),
    zone: first.room.zone,
    flows: first.room.flows,
    isGroupBubble: false,
    positions: 1,
  };
}

function toNode(instance: RoomInstance): DiagramNode {
  return {
    id: instance.key,
    roomId: instance.room.id,
    code: instance.room.code,
    label: instance.displayName,
    group: instance.group,
    status: instance.room.status,
    areaEach: instance.areaEach,
    count: instance.count,
    radius: UNKNOWN_RADIUS,
    instanceKeys: [instance.key],
    zone: instance.room.zone,
    flows: instance.room.flows,
    isGroupBubble: false,
    positions: 1,
  };
}

/** Блок целиком одним узлом: радиус считается от суммарной площади группы. */
function toGroupNode(group: RoomGroup, instances: RoomInstance[]): DiagramNode {
  const total = instances.reduce((sum, i) => sum + (i.areaTotal ?? 0), 0);
  return {
    id: `group:${group.id}`,
    roomId: `group:${group.id}`,
    code: '—',
    label: group.name,
    group,
    status: 'required',
    areaEach: total > 0 ? total : null,
    count: instances.reduce((sum, i) => sum + i.count, 0),
    radius: UNKNOWN_RADIUS,
    instanceKeys: instances.map((i) => i.key),
    zone: 'neutral',
    flows: [...new Set(instances.flatMap((i) => i.room.flows))],
    isGroupBubble: true,
    positions: instances.length,
  };
}

/** Радиус ∝ √площади, нормированный в диапазон [24, 140] px. */
function assignRadii(nodes: DiagramNode[]): void {
  const areas = nodes.map((n) => n.areaEach).filter((a): a is number => a !== null && a > 0);
  if (areas.length === 0) {
    for (const node of nodes) node.radius = UNKNOWN_RADIUS;
    return;
  }
  const rootMin = Math.sqrt(Math.min(...areas));
  const rootMax = Math.sqrt(Math.max(...areas));
  const span = rootMax - rootMin;

  for (const node of nodes) {
    if (node.areaEach === null || node.areaEach <= 0) {
      node.radius = UNKNOWN_RADIUS;
      continue;
    }
    const root = Math.sqrt(node.areaEach);
    node.radius =
      span < 1e-6
        ? (MIN_RADIUS + MAX_RADIUS) / 2
        : MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * ((root - rootMin) / span);
  }
}

/**
 * Собирает граф из результата расчёта.
 * При `collapseRepeats` повторяемые ячейки сливаются в один узел с числом ×N —
 * иначе двенадцать одинаковых групповых ячеек делают диаграмму нечитаемой.
 */
export interface ManualEdgeState {
  customEdges: CustomEdge[];
  edgeOverrides: Record<string, EdgeOverride>;
  /** функциональные группы, свёрнутые в один пузырь */
  collapsedGroups?: string[];
}

export function buildGraph(
  result: ComputationResult,
  collapseRepeats: boolean,
  manual: ManualEdgeState = { customEdges: [], edgeOverrides: {} },
): DiagramGraph {
  const nodes: DiagramNode[] = [];
  const byRoom = new Map<string, DiagramNode[]>();
  const collapsed = new Set(manual.collapsedGroups ?? []);

  // Свёрнутые группы: весь блок одним узлом, связи внутри блока не рисуются.
  for (const groupId of collapsed) {
    const own = result.instances.filter((i) => i.group.id === groupId);
    if (own.length === 0) continue;
    const node = toGroupNode(own[0].group, own);
    nodes.push(node);
    for (const instance of own) byRoom.set(instance.room.id, [node]);
  }

  const loose = result.instances.filter((i) => !collapsed.has(i.group.id));

  if (collapseRepeats) {
    const grouped = new Map<string, RoomInstance[]>();
    for (const instance of loose) {
      const list = grouped.get(instance.room.id) ?? [];
      list.push(instance);
      grouped.set(instance.room.id, list);
    }
    for (const [roomId, list] of grouped) {
      const node = mergeInstances(list);
      nodes.push(node);
      byRoom.set(roomId, [node]);
    }
  } else {
    for (const instance of loose) {
      const node = toNode(instance);
      nodes.push(node);
      const list = byRoom.get(instance.room.id) ?? [];
      list.push(node);
      byRoom.set(instance.room.id, list);
    }
  }

  assignRadii(nodes);

  const edges: DiagramEdge[] = [];
  const seen = new Set<string>();

  /** Разворачивает связь между помещениями в связи между узлами диаграммы. */
  const expand = (
    from: string,
    to: string,
    make: (sourceId: string, targetId: string, pairId: string) => DiagramEdge,
  ) => {
    const sources = byRoom.get(from) ?? [];
    const targets = byRoom.get(to) ?? [];
    if (sources.length === 0 || targets.length === 0) return;

    for (const source of sources) {
      for (const target of targets) {
        if (source.id === target.id) continue;
        // При развёрнутых ячейках связываем одноимённые варианты между собой,
        // а не «каждый с каждым»: спальня ячейки 3–4 лет относится к своей группе.
        const sourceVariant = source.id.split('@')[1];
        const targetVariant = target.id.split('@')[1];
        const bothInCells = sourceVariant !== '-' && targetVariant !== '-';
        if (!collapseRepeats && bothInCells && sourceVariant !== targetVariant) continue;

        const pairId = `${source.id}:${target.id}`;
        const edge = make(source.id, target.id, pairId);
        if (seen.has(edge.id)) continue;
        seen.add(edge.id);
        edges.push(edge);
      }
    }
  };

  for (const rule of result.type.adjacency) {
    const key = ruleKey(rule);
    const override = manual.edgeOverrides[key];
    // Нормативную связь снять нельзя — она остаётся на диаграмме и уходит
    // в «Проверки» как отступление.
    if (override?.deleted && rule.basis !== 'norm') continue;

    const type = override?.type ?? rule.type;
    const strength = override?.strength ?? rule.strength;

    expand(rule.from, rule.to, (source, target, pairId) => ({
      id: `${key}:${pairId}`,
      source,
      target,
      fromRoom: rule.from,
      toRoom: rule.to,
      type,
      strength,
      reason: rule.reason,
      basis: rule.basis,
      flow: rule.flow,
      normLabel: rule.norm ? `${rule.norm.doc}, ${rule.norm.clause}` : null,
      ruleKey: key,
      customId: null,
      locked: rule.basis === 'norm',
      edited: Boolean(override?.type && override.type !== rule.type),
      deviation: override?.deviation,
    }));
  }

  for (const custom of manual.customEdges) {
    expand(custom.from, custom.to, (source, target, pairId) => ({
      id: `${custom.id}:${pairId}`,
      source,
      target,
      fromRoom: custom.from,
      toRoom: custom.to,
      type: custom.type,
      strength: custom.strength,
      reason: custom.reason,
      basis: custom.basis,
      flow: custom.flow,
      normLabel: null,
      ruleKey: null,
      customId: custom.id,
      locked: false,
      edited: false,
    }));
  }

  return { nodes, edges };
}
