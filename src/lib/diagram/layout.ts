import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { AdjacencyType } from '@/types/knowledge';
import type { DiagramGraph } from './build-graph';

/**
 * Начальная раскладка считается d3-force и передаётся в React Flow готовыми
 * координатами. Симуляция прогоняется синхронно: анимация «расползания» узлов
 * инструменту не нужна, нужна воспроизводимая картинка.
 */

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  radius: number;
  groupOrder: number;
  fx?: number | null;
  fy?: number | null;
}

type LayoutLink = SimulationLinkDatum<LayoutNode> & { type: AdjacencyType; strength: number };

/** Базовая длина ребра по типу связи, px. */
const BASE_DISTANCE: Record<AdjacencyType, number> = {
  direct: 86,
  near: 150,
  'via-corridor': 195,
  'via-airlock': 160,
  visual: 128,
  separated: 0,
  forbidden: 0,
};

/** Минимальное расстояние для разнесённых и недопустимых соседств, px. */
const REPULSION_DISTANCE: Record<'separated' | 'forbidden', number> = {
  separated: 380,
  forbidden: 460,
};

const CLUSTER_RADIUS = 430;
const TICKS = 420;

function isRepulsive(type: AdjacencyType): type is 'separated' | 'forbidden' {
  return type === 'separated' || type === 'forbidden';
}

/**
 * Дополнительная отталкивающая сила для `separated` и `forbidden`:
 * обычный forceLink их бы притягивал, а нужно наоборот.
 */
function repulsionForce(pairs: { source: LayoutNode; target: LayoutNode; distance: number }[]) {
  return (alpha: number) => {
    for (const { source, target, distance } of pairs) {
      const dx = (target.x ?? 0) - (source.x ?? 0);
      const dy = (target.y ?? 0) - (source.y ?? 0);
      const current = Math.hypot(dx, dy) || 1e-3;
      if (current >= distance) continue;
      const push = ((distance - current) / current) * alpha * 0.6;
      const ox = dx * push * 0.5;
      const oy = dy * push * 0.5;
      target.x = (target.x ?? 0) + ox;
      target.y = (target.y ?? 0) + oy;
      source.x = (source.x ?? 0) - ox;
      source.y = (source.y ?? 0) - oy;
    }
  };
}

export interface LayoutResult {
  positions: Record<string, { x: number; y: number }>;
}

/**
 * Раскладка по этажам: вертикаль задаётся дорожкой, горизонталь остаётся за
 * симуляцией. Так связи между этажами видно, а помещение нельзя случайно
 * увести с назначенного уровня.
 */
export interface FloorLayout {
  /** id узла → индекс дорожки, 0 сверху */
  bandOf: Record<string, number>;
  bandHeight: number;
}

export function runLayout(
  graph: DiagramGraph,
  pinned: Record<string, { x: number; y: number }>,
  seed: number,
  floors?: FloorLayout,
): LayoutResult {
  const groupOrders = [...new Set(graph.nodes.map((n) => n.group.order))].sort((a, b) => a - b);
  const angleStep = (Math.PI * 2) / Math.max(1, groupOrders.length);

  const clusterOf = (order: number) => {
    const index = groupOrders.indexOf(order);
    const angle = index * angleStep - Math.PI / 2;
    return { x: Math.cos(angle) * CLUSTER_RADIUS, y: Math.sin(angle) * CLUSTER_RADIUS * 0.72 };
  };

  /** Центр дорожки этажа для узла, если включён режим этажей. */
  const bandY = (id: string): number | null => {
    if (!floors) return null;
    const index = floors.bandOf[id];
    return index === undefined ? null : index * floors.bandHeight;
  };

  // В режиме этажей узлы одной дорожки заранее разводятся по горизонтали:
  // иначе они стартуют из одной точки и симуляция оставляет их слипшимися.
  const perBand = new Map<number, number>();

  const nodes: LayoutNode[] = graph.nodes.map((node, index) => {
    const cluster = clusterOf(node.group.order);
    const jitter = ((index * 37 + seed * 13) % 61) - 30;
    const pin = pinned[node.id];
    const band = bandY(node.id);

    let startX = cluster.x + jitter;
    if (floors && band !== null) {
      const bandIndex = floors.bandOf[node.id] ?? 0;
      const seat = perBand.get(bandIndex) ?? 0;
      perBand.set(bandIndex, seat + 1);
      startX = (seat - 12) * 110 + jitter;
    }

    return {
      id: node.id,
      radius: node.radius,
      groupOrder: node.group.order,
      x: pin ? pin.x : startX,
      y: pin ? pin.y : (band ?? cluster.y + jitter * 0.6),
      fx: pin ? pin.x : null,
      fy: pin ? pin.y : null,
    };
  });

  const index = new Map(nodes.map((n) => [n.id, n]));

  const links: LayoutLink[] = [];
  const repulsions: { source: LayoutNode; target: LayoutNode; distance: number }[] = [];

  for (const edge of graph.edges) {
    const source = index.get(edge.source);
    const target = index.get(edge.target);
    if (!source || !target) continue;
    if (isRepulsive(edge.type)) {
      repulsions.push({ source, target, distance: REPULSION_DISTANCE[edge.type] });
    } else {
      links.push({ source, target, type: edge.type, strength: edge.strength });
    }
  }

  const simulation: Simulation<LayoutNode, LayoutLink> = forceSimulation(nodes)
    .force(
      'link',
      forceLink<LayoutNode, LayoutLink>(links)
        .id((d) => d.id)
        // Расстояние обратно силе связи: чем сильнее требование смежности,
        // тем ближе узлы.
        .distance((l) => BASE_DISTANCE[l.type] * (1 + (5 - l.strength) * 0.14))
        .strength((l) => 0.12 + l.strength * 0.07),
    )
    .force('charge', forceManyBody<LayoutNode>().strength((d) => -14 * d.radius))
    .force(
      'collide',
      forceCollide<LayoutNode>()
        .radius((d) => d.radius + 14)
        .strength(0.92),
    )
    // Кластеризация по функциональным группам должна пересиливать отталкивание,
    // иначе блоки перемешиваются и диаграмма перестаёт читаться по зонам.
    // В режиме этажей вертикаль полностью отдана дорожкам.
    .force('x', forceX<LayoutNode>((d) => clusterOf(d.groupOrder).x).strength(floors ? 0.03 : 0.1))
    .force(
      'y',
      forceY<LayoutNode>((d) => bandY(d.id) ?? clusterOf(d.groupOrder).y).strength(
        floors ? 0.9 : 0.1,
      ),
    )
    .force('separate', repulsionForce(repulsions))
    .stop();

  simulation.tick(TICKS);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    let y = node.y ?? 0;

    // Свимлейн — это утверждение об этаже, а не подсказка: узел не должен
    // визуально уезжать в соседний уровень, даже если так удобнее силам.
    const band = bandY(node.id);
    if (floors && band !== null && !pinned[node.id]) {
      const margin = Math.max(8, floors.bandHeight / 2 - node.radius - 12);
      y = Math.max(band - margin, Math.min(band + margin, y));
    }

    positions[node.id] = { x: node.x ?? 0, y };
  }
  return { positions };
}
