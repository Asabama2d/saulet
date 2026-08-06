'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BuildingType, FlowType } from '@/types/knowledge';
import { getBuildingType, knowledgeBase } from '@/lib/knowledge/loader';
import { normalizeMatrix } from '@/lib/engine/compute';
import type { RoomOverride } from '@/lib/engine/types';
import type { CustomEdge, CustomRoom, EdgeOverride } from '@/lib/engine/manual';

export interface NodePin {
  x: number;
  y: number;
}

interface ProjectState {
  buildingTypeId: string;
  params: Record<string, unknown>;
  overrides: Record<string, RoomOverride>;
  /** помещения, добавленные пользователем */
  customRooms: CustomRoom[];
  /** связи, добавленные пользователем */
  customEdges: CustomEdge[];
  /** правки и отступления по связям из базы знаний */
  edgeOverrides: Record<string, EdgeOverride>;
  /** назначение помещения этажу: id помещения → номер этажа */
  floorAssignment: Record<string, number>;
  /** закреплённые вручную узлы диаграммы */
  pinned: Record<string, NodePin>;
  /** сворачивать повторяемые ячейки в один узел */
  collapseRepeats: boolean;
  /** функциональные группы, свёрнутые в пузырь второго порядка */
  collapsedGroups: string[];
  /** режим раскладки: свободная или по этажам-свимлейнам */
  layoutMode: 'free' | 'floors';
  /** окраска узлов: по функциональной группе или по санитарной зоне */
  colorMode: 'group' | 'zone';
  /** подсветка выбранных потоков; пустой набор — показывать всё */
  flowFilter: FlowType[];
  /** увеличивается при «Пересобрать раскладку» */
  layoutSeed: number;
  hydrated: boolean;

  setBuildingType: (id: string) => void;
  setParam: (id: string, value: unknown) => void;
  resetParams: () => void;
  setOverride: (key: string, patch: RoomOverride) => void;
  clearOverride: (key: string) => void;
  addCustomRoom: (room: CustomRoom) => void;
  updateCustomRoom: (id: string, patch: Partial<CustomRoom>) => void;
  removeCustomRoom: (id: string) => void;
  addCustomEdge: (edge: CustomEdge) => void;
  updateCustomEdge: (id: string, patch: Partial<CustomEdge>) => void;
  removeCustomEdge: (id: string) => void;
  setEdgeOverride: (key: string, patch: EdgeOverride) => void;
  clearEdgeOverride: (key: string) => void;
  setFloor: (roomId: string, floor: number | null) => void;
  clearFloors: () => void;
  setPin: (key: string, pin: NodePin) => void;
  unpin: (key: string) => void;
  unpinAll: () => void;
  setCollapseRepeats: (value: boolean) => void;
  toggleGroupCollapsed: (groupId: string) => void;
  setLayoutMode: (mode: 'free' | 'floors') => void;
  setColorMode: (mode: 'group' | 'zone') => void;
  setFlowFilter: (flows: FlowType[]) => void;
  relayout: () => void;
  loadProject: (data: SerializedProject) => void;
  exportProject: () => SerializedProject;
}

export interface SerializedProject {
  app: 'bubble-diagram';
  version: 2;
  knowledgeVersion: string;
  buildingTypeId: string;
  params: Record<string, unknown>;
  overrides: Record<string, RoomOverride>;
  customRooms?: CustomRoom[];
  customEdges?: CustomEdge[];
  edgeOverrides?: Record<string, EdgeOverride>;
  floorAssignment?: Record<string, number>;
  pinned: Record<string, NodePin>;
  collapseRepeats: boolean;
  collapsedGroups?: string[];
}

export function defaultParams(type: BuildingType): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const param of type.parameters) {
    params[param.id] =
      param.control === 'group-matrix' ? normalizeMatrix(param, param.default) : param.default;
  }
  return params;
}

const initialTypeId = knowledgeBase.buildingTypes[0].id;

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      buildingTypeId: initialTypeId,
      params: defaultParams(getBuildingType(initialTypeId)),
      overrides: {},
      customRooms: [],
      customEdges: [],
      edgeOverrides: {},
      floorAssignment: {},
      pinned: {},
      collapseRepeats: true,
      collapsedGroups: [],
      layoutMode: 'free',
      colorMode: 'group',
      flowFilter: [],
      layoutSeed: 1,
      hydrated: false,

      setBuildingType: (id) =>
        set({
          buildingTypeId: id,
          params: defaultParams(getBuildingType(id)),
          overrides: {},
          customRooms: [],
          customEdges: [],
          edgeOverrides: {},
          floorAssignment: {},
          collapsedGroups: [],
          pinned: {},
          layoutSeed: get().layoutSeed + 1,
        }),

      setParam: (id, value) => set((s) => ({ params: { ...s.params, [id]: value } })),

      resetParams: () =>
        set((s) => ({
          params: defaultParams(getBuildingType(s.buildingTypeId)),
          overrides: {},
          customRooms: [],
          customEdges: [],
          edgeOverrides: {},
          floorAssignment: {},
          collapsedGroups: [],
          pinned: {},
          layoutSeed: s.layoutSeed + 1,
        })),

      setOverride: (key, patch) =>
        set((s) => ({ overrides: { ...s.overrides, [key]: { ...s.overrides[key], ...patch } } })),

      clearOverride: (key) =>
        set((s) => {
          const next = { ...s.overrides };
          delete next[key];
          return { overrides: next };
        }),

      addCustomRoom: (room) =>
        set((s) => ({ customRooms: [...s.customRooms, room], layoutSeed: s.layoutSeed + 1 })),

      updateCustomRoom: (id, patch) =>
        set((s) => ({
          customRooms: s.customRooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      removeCustomRoom: (id) =>
        set((s) => ({
          customRooms: s.customRooms.filter((r) => r.id !== id),
          // связи осиротевшего помещения снимаются вместе с ним
          customEdges: s.customEdges.filter((e) => e.from !== id && e.to !== id),
          layoutSeed: s.layoutSeed + 1,
        })),

      addCustomEdge: (edge) => set((s) => ({ customEdges: [...s.customEdges, edge] })),

      updateCustomEdge: (id, patch) =>
        set((s) => ({
          customEdges: s.customEdges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),

      removeCustomEdge: (id) =>
        set((s) => ({ customEdges: s.customEdges.filter((e) => e.id !== id) })),

      setEdgeOverride: (key, patch) =>
        set((s) => ({ edgeOverrides: { ...s.edgeOverrides, [key]: { ...s.edgeOverrides[key], ...patch } } })),

      clearEdgeOverride: (key) =>
        set((s) => {
          const next = { ...s.edgeOverrides };
          delete next[key];
          return { edgeOverrides: next };
        }),

      setFloor: (roomId, floor) =>
        set((s) => {
          const next = { ...s.floorAssignment };
          if (floor === null) delete next[roomId];
          else next[roomId] = floor;
          return { floorAssignment: next };
        }),

      clearFloors: () => set((s) => ({ floorAssignment: {}, layoutSeed: s.layoutSeed + 1 })),

      toggleGroupCollapsed: (groupId) =>
        set((s) => ({
          collapsedGroups: s.collapsedGroups.includes(groupId)
            ? s.collapsedGroups.filter((g) => g !== groupId)
            : [...s.collapsedGroups, groupId],
          layoutSeed: s.layoutSeed + 1,
        })),

      setLayoutMode: (mode) => set((s) => ({ layoutMode: mode, layoutSeed: s.layoutSeed + 1 })),

      setColorMode: (mode) => set({ colorMode: mode }),

      setFlowFilter: (flows) => set({ flowFilter: flows }),

      setPin: (key, pin) => set((s) => ({ pinned: { ...s.pinned, [key]: pin } })),

      unpin: (key) =>
        set((s) => {
          const next = { ...s.pinned };
          delete next[key];
          return { pinned: next };
        }),

      unpinAll: () => set({ pinned: {} }),

      setCollapseRepeats: (value) =>
        set((s) => ({ collapseRepeats: value, layoutSeed: s.layoutSeed + 1 })),

      relayout: () => set((s) => ({ layoutSeed: s.layoutSeed + 1 })),

      loadProject: (data) =>
        set((s) => ({
          buildingTypeId: data.buildingTypeId,
          params: data.params,
          overrides: data.overrides ?? {},
          customRooms: data.customRooms ?? [],
          customEdges: data.customEdges ?? [],
          edgeOverrides: data.edgeOverrides ?? {},
          floorAssignment: data.floorAssignment ?? {},
          pinned: data.pinned ?? {},
          collapseRepeats: data.collapseRepeats ?? true,
          collapsedGroups: data.collapsedGroups ?? [],
          layoutSeed: s.layoutSeed + 1,
        })),

      exportProject: () => {
        const s = get();
        return {
          app: 'bubble-diagram',
          version: 2,
          knowledgeVersion: knowledgeBase.version,
          buildingTypeId: s.buildingTypeId,
          params: s.params,
          overrides: s.overrides,
          customRooms: s.customRooms,
          customEdges: s.customEdges,
          edgeOverrides: s.edgeOverrides,
          floorAssignment: s.floorAssignment,
          pinned: s.pinned,
          collapseRepeats: s.collapseRepeats,
          collapsedGroups: s.collapsedGroups,
        };
      },
    }),
    {
      name: 'bubble-diagram.project',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Восстановление откладывается до монтирования на клиенте: иначе первый
      // серверный рендер и первый клиентский расходятся.
      skipHydration: true,
      partialize: ({
        buildingTypeId,
        params,
        overrides,
        customRooms,
        customEdges,
        edgeOverrides,
        floorAssignment,
        pinned,
        collapseRepeats,
        collapsedGroups,
        layoutMode,
        colorMode,
        flowFilter,
      }) => ({
        buildingTypeId,
        params,
        overrides,
        customRooms,
        customEdges,
        edgeOverrides,
        floorAssignment,
        pinned,
        collapseRepeats,
        collapsedGroups,
        layoutMode,
        colorMode,
        flowFilter,
      }),
    },
  ),
);

/** Однократное восстановление проекта из localStorage. */
export async function hydrateProject(): Promise<void> {
  if (useProjectStore.getState().hydrated) return;
  try {
    await useProjectStore.persist.rehydrate();
  } catch (err) {
    // localStorage может быть недоступен: расширение браузера его блокирует,
    // строгий приватный режим, переполнена квота, сохранён битый JSON.
    // Это не повод не запускать приложение — стартуем с параметрами
    // по умолчанию, иначе пользователь навсегда упирается в «Загрузка проекта…».
    console.warn('Проект из localStorage восстановить не удалось, старт с нуля:', err);
  } finally {
    // hydrated выставляется в любом случае — и при успехе, и при ошибке.
    useProjectStore.setState({ hydrated: true });
  }
}
