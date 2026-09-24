import type { Scope } from './expr';

/** One set of levels for placement checks and diagram lanes, including multi-level basements. */
export function availableFloors(scope: Scope): number[] {
  const floors = typeof scope.floors === 'number' && Number.isFinite(scope.floors)
    ? Math.max(0, Math.trunc(scope.floors)) : 1;
  const underground = typeof scope.undergroundFloors === 'number' && Number.isFinite(scope.undergroundFloors)
    ? Math.max(0, Math.trunc(scope.undergroundFloors)) : scope.hasBasement === true ? 1 : 0;
  const result: number[] = [];
  for (let level = -underground; level < 0; level += 1) result.push(level);
  if (scope.hasGroundFloor === true) result.push(0);
  for (let level = 1; level <= floors; level += 1) result.push(level);
  return result;
}
