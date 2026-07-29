import type { AdjacencyType, FlowType, Status } from '@/types/knowledge';

/** Санитарные зоны. Синий / вермильон / серый различимы при дейтеранопии. */
export const ZONE_STYLE: Record<'clean' | 'dirty' | 'neutral', { color: string; label: string }> = {
  clean: { color: '#0072B2', label: 'Чистая' },
  dirty: { color: '#D55E00', label: 'Грязная' },
  neutral: { color: '#999999', label: 'Нейтральная' },
};

export const FLOW_LABEL: Record<FlowType, string> = {
  children: 'Дети / обучающиеся',
  visitors: 'Посетители',
  staff: 'Персонал',
  food: 'Пища',
  linen: 'Бельё',
  waste: 'Отходы',
  goods: 'Товары и грузы',
  medical: 'Медицинский',
};

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Контур узла = статус помещения. */
export const STATUS_STROKE: Record<Status, { dash: string; width: number; label: string }> = {
  required: { dash: '', width: 2, label: 'Обязательное' },
  conditional: { dash: '', width: 2, label: 'При условии' },
  recommended: { dash: '5 4', width: 1.5, label: 'Рекомендуемое' },
  optional: { dash: '1.5 3', width: 1.5, label: 'Желательное' },
};

export interface EdgeStyle {
  label: string;
  width: number;
  dash?: string;
  /** двойная тонкая линия — коммуникация */
  double?: boolean;
  /** квадрат на середине — шлюз */
  square?: boolean;
  /** перечёркивание — недопустимо */
  cross?: boolean;
  /** зазор в середине — разнесение */
  gap?: boolean;
  tone: 'fg' | 'muted' | 'err';
}

export const EDGE_STYLE: Record<AdjacencyType, EdgeStyle> = {
  direct: { label: 'Непосредственная смежность', width: 2.6, tone: 'fg' },
  near: { label: 'В пределах блока', width: 1.1, tone: 'fg' },
  'via-corridor': { label: 'Через коммуникацию', width: 3.2, double: true, tone: 'fg' },
  'via-airlock': { label: 'Через шлюз или тамбур', width: 1.4, square: true, tone: 'fg' },
  visual: { label: 'Визуальный контроль', width: 1.4, dash: '3 3', tone: 'fg' },
  separated: { label: 'Должны быть разнесены', width: 1.3, dash: '7 6', gap: true, tone: 'muted' },
  forbidden: { label: 'Соседство недопустимо', width: 1.8, cross: true, tone: 'err' },
};

export const TONE_VAR: Record<EdgeStyle['tone'], string> = {
  fg: 'var(--app-line-strong)',
  muted: 'var(--app-muted)',
  err: 'var(--app-err)',
};
