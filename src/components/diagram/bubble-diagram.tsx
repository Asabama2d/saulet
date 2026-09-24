'use client';

import * as React from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { ChevronDown, Image as ImageIcon, Maximize2, PinOff, Plus, RefreshCw } from 'lucide-react';
import '@xyflow/react/dist/style.css';

import { useComputation } from '@/lib/engine/use-computation';
import { availableFloors } from '@/lib/engine/floors';
import { floorName } from '@/lib/export/floors';
import { useProjectStore } from '@/lib/store/project-store';
import { buildGraph, type DiagramEdge } from '@/lib/diagram/build-graph';
import { runLayout } from '@/lib/diagram/layout';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem } from '@/components/ui/menu';
import { Switch } from '@/components/ui/primitives';
import { buildDiagramSvg } from '@/lib/export/diagram-svg';
import { svgSize, svgToPng } from '@/lib/export/diagram-image';
import { download, stamped } from '@/lib/export/download';
import { knowledgeBase } from '@/lib/knowledge/loader';
import { plural } from '@/lib/format';
import { EdgeLayer, type EdgeGeometry } from './edge-layer';
import { EdgeDialog, type PendingEdge } from './edge-dialog';
import { RoomDialog } from './room-dialog';
import { ConnectStartContext, RoomNode, type RoomNodeType } from './room-node';
import { Legend } from './legend';
import { LayersPanel } from './layers-panel';
import { FloorBands, type FloorBand } from './floor-bands';

/** Высота дорожки этажа в координатах холста. */
const BAND_HEIGHT = 320;

const nodeTypes = { room: RoomNode };

/** id узла → id помещения: ручные правки хранятся в помещениях. */
function toRoomId(nodeId: string): string {
  return nodeId.split('@')[0];
}

function DiagramInner() {
  const result = useComputation();
  const collapseRepeats = useProjectStore((s) => s.collapseRepeats);
  const setCollapseRepeats = useProjectStore((s) => s.setCollapseRepeats);
  const layoutSeed = useProjectStore((s) => s.layoutSeed);
  const relayout = useProjectStore((s) => s.relayout);
  const setPin = useProjectStore((s) => s.setPin);
  const unpin = useProjectStore((s) => s.unpin);
  const unpinAll = useProjectStore((s) => s.unpinAll);
  const pinnedMap = useProjectStore((s) => s.pinned);
  const customEdges = useProjectStore((s) => s.customEdges);
  const edgeOverrides = useProjectStore((s) => s.edgeOverrides);
  const customRooms = useProjectStore((s) => s.customRooms);
  const setEdgeOverride = useProjectStore((s) => s.setEdgeOverride);
  const removeCustomEdge = useProjectStore((s) => s.removeCustomEdge);
  const collapsedGroups = useProjectStore((s) => s.collapsedGroups);
  const toggleGroupCollapsed = useProjectStore((s) => s.toggleGroupCollapsed);
  const layoutMode = useProjectStore((s) => s.layoutMode);
  const colorMode = useProjectStore((s) => s.colorMode);
  const flowFilter = useProjectStore((s) => s.flowFilter);
  const floorAssignment = useProjectStore((s) => s.floorAssignment);
  const setFloor = useProjectStore((s) => s.setFloor);

  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [nodes, setNodes, onNodesChange] = useNodesState<RoomNodeType>([]);
  const [selectedEdge, setSelectedEdge] = React.useState<DiagramEdge | null>(null);
  const [pendingEdge, setPendingEdge] = React.useState<PendingEdge | null>(null);
  const [edgeDialogOpen, setEdgeDialogOpen] = React.useState(false);
  const [roomDialogOpen, setRoomDialogOpen] = React.useState(false);
  const [editingRoomId, setEditingRoomId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState<{
    fromId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const { fitView, screenToFlowPosition } = useReactFlow();

  const graph = React.useMemo(
    () => buildGraph(result, collapseRepeats, { customEdges, edgeOverrides, collapsedGroups }),
    [result, collapseRepeats, customEdges, edgeOverrides, collapsedGroups],
  );

  /** Дорожки этажей сверху вниз: не назначено, затем этажи по убыванию. */
  const bands = React.useMemo<FloorBand[]>(() => {
    const list: FloorBand[] = [{ floor: null, label: 'Не назначено', y: 0 }];
    for (const floor of availableFloors(result.scope).reverse()) {
      list.push({ floor, label: floorName(floor), y: 0 });
    }
    return list.map((band, index) => ({ ...band, y: index * BAND_HEIGHT }));
  }, [result.scope]);

  const bandIndexOf = React.useCallback(
    (roomId: string) => {
      const floor = roomId in floorAssignment ? floorAssignment[roomId] : null;
      const index = bands.findIndex((b) => b.floor === floor);
      return index === -1 ? 0 : index;
    },
    [bands, floorAssignment],
  );

  // Раскладка читает закреплённые узлы разово: перетаскивание не должно
  // запускать пересчёт всей симуляции.
  const positions = React.useMemo(() => {
    const floors =
      layoutMode === 'floors'
        ? {
            bandOf: Object.fromEntries(
              graph.nodes.map((n) => [n.id, bandIndexOf(n.roomId)] as const),
            ),
            bandHeight: BAND_HEIGHT,
          }
        : undefined;
    return runLayout(graph, useProjectStore.getState().pinned, layoutSeed, floors).positions;
  }, [graph, layoutSeed, layoutMode, bandIndexOf]);

  /** Габарит дорожек по горизонтали — под ширину получившейся раскладки. */
  const bandExtent = React.useMemo(() => {
    const xs = Object.values(positions).map((p) => p.x);
    if (xs.length === 0) return { left: -600, width: 1200 };
    const left = Math.min(...xs) - 220;
    const right = Math.max(...xs) + 220;
    return { left, width: Math.max(900, right - left) };
  }, [positions]);

  /**
   * Подсвечиваются нарушения, а не «требует проверки»: незаполненная или
   * несверенная площадь и так видна жёлтым бейджем в экспликации, а красное
   * кольцо на диаграмме должно означать конфликт.
   */
  const flaggedRooms = React.useMemo(() => {
    const keys = new Set(
      result.issues
        .filter((i) => i.level !== 'info' && i.category !== 'verification')
        .flatMap((i) => i.roomKeys ?? []),
    );
    return new Set(
      result.instances.filter((i) => keys.has(i.key)).map((i) => i.room.id),
    );
  }, [result]);

  React.useEffect(() => {
    const pins = useProjectStore.getState().pinned;
    setNodes(
      graph.nodes.map((node) => ({
        id: node.id,
        type: 'room' as const,
        position: {
          x: (positions[node.id]?.x ?? 0) - node.radius,
          y: (positions[node.id]?.y ?? 0) - node.radius,
        },
        // Размер известен заранее (2 × радиус) и задаётся явно: React Flow не
        // ждёт замера и не прячет узлы на первом кадре.
        width: node.radius * 2,
        height: node.radius * 2,
        data: {
          ...node,
          dimmed: false,
          pinned: Boolean(pins[node.id]),
          flagged: false,
          custom: node.roomId.startsWith('custom.'),
          colorMode: 'group' as const,
          floor: null,
        },
      })),
    );
  }, [graph, positions, setNodes]);

  // Приглушение, закрепление и подсветка — отдельными проходами, чтобы не
  // сбрасывать перетащенные позиции.
  React.useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          // Фильтр по потокам не убирает узлы, а приглушает не относящиеся
          // к маршруту: путь должен читаться в контексте объекта.
          dimmed:
            hidden.has(node.data.group.id) ||
            (flowFilter.length > 0 && !node.data.flows.some((f) => flowFilter.includes(f))),
          pinned: Boolean(pinnedMap[node.id]),
          flagged: flaggedRooms.has(node.data.roomId),
          colorMode,
          floor: node.data.roomId in floorAssignment ? floorAssignment[node.data.roomId] : null,
        },
      })),
    );
  }, [hidden, pinnedMap, flaggedRooms, flowFilter, colorMode, floorAssignment, setNodes]);

  React.useEffect(() => {
    const id = window.setTimeout(() => fitView({ padding: 0.16, duration: 0 }), 40);
    return () => window.clearTimeout(id);
  }, [positions, fitView]);

  const removeSelectedEdge = React.useCallback(() => {
    const edge = selectedEdge;
    if (!edge) return;
    if (edge.locked) {
      setEdgeDialogOpen(true);
      return;
    }
    if (edge.customId) removeCustomEdge(edge.customId);
    else if (edge.ruleKey) setEdgeOverride(edge.ruleKey, { deleted: true });
    setSelectedEdge(null);
  }, [selectedEdge, removeCustomEdge, setEdgeOverride]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (edgeDialogOpen || roomDialogOpen) return;
      const key = event.key.toLowerCase();
      if (key === 'f' || key === 'а') {
        event.preventDefault();
        fitView({ padding: 0.16, duration: 200 });
      }
      if (key === 'g' || key === 'п') {
        event.preventDefault();
        setCollapseRepeats(!useProjectStore.getState().collapseRepeats);
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selectedEdge) return;
        event.preventDefault();
        removeSelectedEdge();
      }
      if (event.key === 'Escape') setSelectedEdge(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitView, setCollapseRepeats, selectedEdge, removeSelectedEdge, edgeDialogOpen, roomDialogOpen]);

  /** Геометрия связей берётся из текущих позиций узлов — линии едут за drag'ом. */
  const edgeGeometry = React.useMemo<EdgeGeometry[]>(() => {
    const centers = new Map(
      nodes.map((node) => {
        const radius = node.data.radius;
        return [node.id, { x: node.position.x + radius, y: node.position.y + radius, radius }];
      }),
    );
    const groupOf = new Map(graph.nodes.map((n) => [n.id, n.group.id]));

    return graph.edges.flatMap((edge) => {
      const from = centers.get(edge.source);
      const to = centers.get(edge.target);
      if (!from || !to) return [];
      return [
        {
          edge,
          from: { x: from.x, y: from.y },
          to: { x: to.x, y: to.y },
          radiusFrom: from.radius,
          radiusTo: to.radius,
          dimmed:
            hidden.has(groupOf.get(edge.source) ?? '') ||
            hidden.has(groupOf.get(edge.target) ?? '') ||
            (flowFilter.length > 0 && (!edge.flow || !flowFilter.includes(edge.flow))),
        },
      ];
    });
  }, [nodes, graph, hidden, flowFilter]);

  /** Потоки, реально встречающиеся в текущем составе, — остальные не показываем. */
  const usedFlows = React.useMemo(
    () => new Set(graph.nodes.flatMap((n) => n.flows)),
    [graph],
  );

  const nameOf = React.useCallback(
    (roomId: string) => graph.nodes.find((n) => n.roomId === roomId)?.label ?? roomId,
    [graph],
  );

  /** Центры узлов в координатах холста — по ним и попадаем при отпускании. */
  const nodeCenters = React.useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        x: node.position.x + node.data.radius,
        y: node.position.y + node.data.radius,
        radius: node.data.radius,
      })),
    [nodes],
  );

  const startConnect = React.useCallback(
    (nodeId: string, event: React.PointerEvent) => {
      const origin = nodeCenters.find((n) => n.id === nodeId);
      if (!origin) return;
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setSelectedEdge(null);
      setConnecting({ fromId: nodeId, from: { x: origin.x, y: origin.y }, to: point });
    },
    [nodeCenters, screenToFlowPosition],
  );

  // Протяжка ведётся на уровне окна: указатель уходит далеко за пределы узла.
  React.useEffect(() => {
    if (!connecting) return;

    const onMove = (event: PointerEvent) => {
      setConnecting((current) =>
        current
          ? { ...current, to: screenToFlowPosition({ x: event.clientX, y: event.clientY }) }
          : current,
      );
    };

    const onUp = (event: PointerEvent) => {
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const hit = nodeCenters.find(
        (n) => Math.hypot(n.x - point.x, n.y - point.y) <= n.radius + 12,
      );
      setConnecting(null);
      if (!hit || hit.id === connecting.fromId) return;

      const from = toRoomId(connecting.fromId);
      const to = toRoomId(hit.id);
      if (from === to) return;
      setPendingEdge({ from, to });
      setEdgeDialogOpen(true);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [connecting, nodeCenters, screenToFlowPosition]);

  const toggleGroup = (groupId: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  const pinnedCount = Object.keys(pinnedMap).length;
  const editingRoom = customRooms.find((r) => r.id === editingRoomId) ?? null;
  /**
   * Выгрузка собирается из данных графа, а не снимком экрана: файл получается
   * векторным, лёгким и не зависит от текущего масштаба холста.
   */
  const exportImage = React.useCallback(
    async (format: 'svg' | 'png') => {
      const svg = buildDiagramSvg({
        nodes: nodes.map((n) => ({
          node: n.data as unknown as (typeof graph.nodes)[number],
          x: n.position.x + n.data.radius,
          y: n.position.y + n.data.radius,
        })),
        edges: edgeGeometry,
        groups: result.type.groups,
        colorMode,
        bands: layoutMode === 'floors' ? bands.map((b) => ({ label: b.label, y: b.y })) : undefined,
        bandHeight: layoutMode === 'floors' ? BAND_HEIGHT : undefined,
        title: `Пузырьковая диаграмма — ${result.type.name}`,
        subtitle: `${result.totals.groups > 0 ? `${result.totals.groups} групп / классов, ` : ''}${result.totals.places} мест · рабочая площадь ${result.totals.netProvisional.toFixed(1)} м², подтверждено ${result.totals.netConfirmed.toFixed(1)} м²`,
        footer: `Нормативная база ${knowledgeBase.version} от ${knowledgeBase.updatedAt}. Выгружено ${new Date().toLocaleString('ru-RU')}. Неподтверждённые площади в итоговую сумму не входят.`,
      });

      try {
        if (format === 'svg') {
          download(
            new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
            stamped(`${result.type.id}-diagram`, 'svg'),
          );
          return;
        }
        const { width, height } = svgSize(svg);
        download(await svgToPng(svg, width, height), stamped(`${result.type.id}-diagram`, 'png'));
      } catch (error) {
        // Модальный alert замораживает вкладку — сообщение показывается строкой.
        console.error('Экспорт диаграммы:', error);
        setNotice(
          `Не удалось выгрузить диаграмму: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [nodes, edgeGeometry, colorMode, result, graph, layoutMode, bands],
  );

  return (
    <ConnectStartContext.Provider value={startConnect}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesConnectable={false}
        nodesDraggable={!connecting}
        onNodeDragStop={(_, node) => {
          const data = node.data as RoomNodeType['data'];
          const center = { x: node.position.x + data.radius, y: node.position.y + data.radius };
          setPin(node.id, center);
          // В режиме этажей отпускание в дорожке и есть назначение уровня.
          if (layoutMode === 'floors') {
            const index = Math.max(
              0,
              Math.min(bands.length - 1, Math.round(center.y / BAND_HEIGHT)),
            );
            const target = bands[index].floor;
            // Свёрнутый блок назначает уровень всем помещениям группы разом.
            const roomIds = data.isGroupBubble
              ? [...new Set(
                  result.instances
                    .filter((i) => i.group.id === data.group.id)
                    .map((i) => i.room.id),
                )]
              : [data.roomId];
            for (const roomId of roomIds) setFloor(roomId, target);
          }
        }}
        onNodeClick={(_, node) => {
          const data = node.data as RoomNodeType['data'];
          if (data.isGroupBubble) toggleGroupCollapsed(data.group.id);
        }}
        onNodeDoubleClick={(_, node) => {
          const roomId = toRoomId(node.id);
          if (roomId.startsWith('custom.')) {
            setEditingRoomId(roomId);
            setRoomDialogOpen(true);
            return;
          }
          unpin(node.id);
        }}
        onPaneClick={() => setSelectedEdge(null)}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        panActivationKeyCode="Space"
        deleteKeyCode={null}
        elementsSelectable
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        className="bg-bg"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--app-grid)" />

        {layoutMode === 'floors' ? (
          <FloorBands
            bands={bands}
            height={BAND_HEIGHT}
            width={bandExtent.width}
            left={bandExtent.left}
          />
        ) : null}

        <EdgeLayer
          items={edgeGeometry}
          selectedId={selectedEdge?.id ?? null}
          onSelect={setSelectedEdge}
        />

        {connecting ? (
          <ViewportPortal>
            <svg
              width={1}
              height={1}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                overflow: 'visible',
                pointerEvents: 'none',
              }}
            >
              <line
                x1={connecting.from.x}
                y1={connecting.from.y}
                x2={connecting.to.x}
                y2={connecting.to.y}
                stroke="var(--app-accent)"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              <circle cx={connecting.to.x} cy={connecting.to.y} r={4} fill="var(--app-accent)" />
            </svg>
          </ViewportPortal>
        ) : null}

        <Controls
          showInteractive={false}
          className="!border-line !bg-bg"
          data-export="hide"
        />

        <Panel position="top-left" className="!m-2 !right-2" data-export="hide">
          <div className="flex flex-wrap items-center gap-1.5 rounded-[3px] border border-line bg-bg/95 px-1.5 py-1 backdrop-blur">
            <Button
              size="sm"
              variant="ghost"
              onClick={relayout}
              title="Пересобрать раскладку (закреплённые узлы сохраняются)"
            >
              <RefreshCw className="size-3.5" />
              Пересобрать
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fitView({ padding: 0.16, duration: 200 })}
              title="Вписать в экран (F)"
            >
              <Maximize2 className="size-3.5" />
              Вписать
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pinnedCount === 0}
              onClick={unpinAll}
              title="Открепить все узлы"
            >
              <PinOff className="size-3.5" />
              Открепить{pinnedCount > 0 ? ` (${pinnedCount})` : ''}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingRoomId(null);
                setRoomDialogOpen(true);
              }}
              title="Добавить помещение по заданию на проектирование"
            >
              <Plus className="size-3.5" />
              Помещение
            </Button>
            <Menu
              align="left"
              trigger={({ toggle }) => (
                <Button size="sm" variant="ghost" onClick={toggle} title="Выгрузить диаграмму">
                  <ImageIcon className="size-3.5" />
                  Картинка
                  <ChevronDown className="size-3" />
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem
                    hint="Векторная, для вставки в отчёт и правки"
                    onSelect={() => {
                      void exportImage('svg');
                      close();
                    }}
                  >
                    Диаграмма SVG
                  </MenuItem>
                  <MenuItem
                    hint="Растровая, двойное разрешение"
                    onSelect={() => {
                      void exportImage('png');
                      close();
                    }}
                  >
                    Диаграмма PNG
                  </MenuItem>
                </>
              )}
            </Menu>
            <label className="ml-1 flex items-center gap-1.5 text-[11px] text-muted">
              <Switch
                ariaLabel="Свернуть повторы"
                checked={collapseRepeats}
                onCheckedChange={setCollapseRepeats}
              />
              Свернуть повторы (G)
            </label>
          </div>
        </Panel>

        <Panel position="top-right" className="!m-2 !top-28 max-h-[calc(100%-10rem)] overflow-y-auto sm:!top-20 lg:!top-12">
          <div className="flex flex-col items-end gap-2">
            <div data-export="hide">
              <LayersPanel usedFlows={usedFlows} />
            </div>
            <Legend
              groups={result.type.groups}
              hidden={hidden}
              onToggle={toggleGroup}
              collapsed={collapsedGroups}
              onToggleCollapsed={toggleGroupCollapsed}
            />
          </div>
        </Panel>

        <Panel position="bottom-left" className="!m-2" data-export="hide">
          {notice ? (
            <div className="mb-1.5 flex max-w-[560px] items-start gap-2 rounded-[3px] border border-err/50 bg-err-soft px-2 py-1 text-[11px] text-err">
              <span className="min-w-0">{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Скрыть сообщение"
                className="shrink-0"
              >
                ×
              </button>
            </div>
          ) : null}
          {selectedEdge ? (
            <SelectedEdgeBar
              edge={selectedEdge}
              nameOf={nameOf}
              onEdit={() => {
                setPendingEdge(null);
                setEdgeDialogOpen(true);
              }}
              onRemove={removeSelectedEdge}
              onClose={() => setSelectedEdge(null)}
            />
          ) : (
            <div className="rounded-[3px] border border-line bg-bg/95 px-2 py-1 text-[11px] text-muted backdrop-blur">
              {plural(nodes.length, 'узел', 'узла', 'узлов')} ·{' '}
              {plural(edgeGeometry.length, 'связь', 'связи', 'связей')} · протяните от точки на
              узле, чтобы создать связь; клик по линии — выбрать, Del — снять
            </div>
          )}
        </Panel>
      </ReactFlow>

      {/* key пересоздаёт диалог на каждое открытие — поля берут начальные значения при монтировании */}
      {edgeDialogOpen ? (
        <EdgeDialog
          key={`${selectedEdge?.id ?? ''}|${pendingEdge?.from ?? ''}|${pendingEdge?.to ?? ''}`}
          open
          onOpenChange={(open) => {
            setEdgeDialogOpen(open);
            if (!open) setPendingEdge(null);
          }}
          pending={pendingEdge}
          edge={pendingEdge ? null : selectedEdge}
          nameOf={nameOf}
        />
      ) : null}

      {roomDialogOpen ? (
        <RoomDialog
          key={editingRoomId ?? 'new'}
          open
          onOpenChange={setRoomDialogOpen}
          groups={result.type.groups}
          editing={editingRoom}
        />
      ) : null}
    </ConnectStartContext.Provider>
  );
}

function SelectedEdgeBar({
  edge,
  nameOf,
  onEdit,
  onRemove,
  onClose,
}: {
  edge: DiagramEdge;
  nameOf: (roomId: string) => string;
  onEdit: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex max-w-[560px] items-center gap-2 rounded-[3px] border border-accent/50 bg-bg/95 px-2 py-1 text-[11px] backdrop-blur">
      <span className="min-w-0 truncate">
        <span className="font-medium">{nameOf(edge.fromRoom)}</span>
        <span className="text-muted"> ↔ </span>
        <span className="font-medium">{nameOf(edge.toRoom)}</span>
        {edge.locked ? <span className="ml-1.5 text-accent">норма</span> : null}
        {edge.edited ? <span className="ml-1.5 text-warn">изменена</span> : null}
      </span>
      <Button size="sm" variant="ghost" onClick={onEdit}>
        Изменить
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onRemove}
        title={edge.locked ? 'Нормативную связь снять нельзя — оформите отступление' : 'Снять связь (Del)'}
      >
        Снять
      </Button>
      <Button size="icon" variant="ghost" aria-label="Снять выделение" onClick={onClose}>
        ×
      </Button>
    </div>
  );
}

export function BubbleDiagram() {
  return (
    <ReactFlowProvider>
      <DiagramInner />
    </ReactFlowProvider>
  );
}
