'use client';

import { useMemo } from 'react';
import { getBuildingType } from '@/lib/knowledge/loader';
import { useProjectStore } from '@/lib/store/project-store';
import { compute } from './compute';
import type { ComputationResult } from './types';

/**
 * Пересчёт состава помещений при любом изменении параметров или ручных правок.
 * Ошибка в выражении базы не роняет приложение — она приходит строкой в
 * панель «Проверки», где её видно проектировщику.
 */
export function useComputation(): ComputationResult {
  const buildingTypeId = useProjectStore((s) => s.buildingTypeId);
  const params = useProjectStore((s) => s.params);
  const overrides = useProjectStore((s) => s.overrides);
  const customRooms = useProjectStore((s) => s.customRooms);
  const customEdges = useProjectStore((s) => s.customEdges);
  const edgeOverrides = useProjectStore((s) => s.edgeOverrides);
  const floorAssignment = useProjectStore((s) => s.floorAssignment);

  return useMemo(() => {
    const type = getBuildingType(buildingTypeId);
    try {
      return compute({
        type,
        params,
        overrides,
        customRooms,
        customEdges,
        edgeOverrides,
        floorAssignment,
      });
    } catch (error) {
      return {
        type,
        scope: {},
        instances: [],
        byGroup: [],
        excluded: [],
        totals: {
          netConfirmed: 0,
          netProvisional: 0,
          grossConfirmed: 0,
          grossProvisional: 0,
          volumeConfirmed: 0,
          places: 0,
          groups: 0,
          areaPerPlace: null,
          coefK: 1,
          floorHeight: 0,
          positionsTotal: 0,
          positionsConfirmed: 0,
          positionsUnresolved: 0,
        },
        issues: [
          {
            id: 'engine-error',
            level: 'error',
            category: 'norm',
            title: 'Ошибка в правилах базы знаний',
            detail: error instanceof Error ? error.message : String(error),
          },
        ],
      } satisfies ComputationResult;
    }
  }, [
    buildingTypeId,
    params,
    overrides,
    customRooms,
    customEdges,
    edgeOverrides,
    floorAssignment,
  ]);
}
