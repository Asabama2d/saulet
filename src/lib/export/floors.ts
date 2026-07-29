/** Имя уровня для выгрузок. Пустая строка означает «уровень не назначен». */
export function floorName(floor: number | undefined): string {
  if (floor === undefined) return '';
  if (floor === -1) return 'Подвал';
  if (floor === 0) return 'Цокольный этаж';
  return `Этаж ${floor}`;
}
