import type { CorpusIndex } from './types';

// Navigation vocabulary only; these labels are not normative requirements.
// Alternatives are ORed against full clause text, then intersected with the
// active topics and the user's search. They never match document titles.
export const FACETS = {
  width: { title: 'Ширина прохода', roots: ['ширин', 'ені', 'енін'] },
  height: { title: 'Высота', roots: ['высот', 'биікт'] },
  opening: { title: 'Открывание дверей', roots: ['открыв', 'открыт', 'ашыл'] },
  resistance: { title: 'Огнестойкость', roots: ['огнестой', 'отқа төзімді'] },
  exits: { title: 'Выходы', roots: ['выход', 'шығу', 'шығыс'] },
  distance: { title: 'Длина пути', roots: ['расстояни', 'длин', 'қашықтық', 'ұзындық'] },
  area: { title: 'Площадь', roots: ['площад', 'аудан'] },
  capacity: { title: 'Вместимость', roots: ['вместим', 'численност', 'сыйымдылық'] },
  slope: { title: 'Уклон', roots: ['уклон', 'еңіс'] },
} as const;
export type FacetId = keyof typeof FACETS;
const topicFacets: Record<string, FacetId[]> = {
  doors: ['width', 'opening', 'resistance'], evacuation: ['exits', 'width', 'distance'],
  mall: ['area', 'capacity', 'exits'], fire: ['resistance', 'exits', 'distance'],
  accessibility: ['width', 'slope', 'opening'], stairs: ['width', 'height', 'slope'],
  rooms: ['area', 'height', 'capacity'], schools: ['area', 'capacity', 'exits'],
  parking: ['width', 'slope', 'height'], sanitary: ['area', 'width', 'capacity'],
};
export function focusFacets(topic?: string): FacetId[] {
  return topic ? topicFacets[topic] ?? [] : [];
}
export function relatedTopics(index: CorpusIndex, visible: number[], selected: string[], limit = 3) {
  const preferred: Record<string, string[]> = {
    doors: ['evacuation', 'accessibility', 'fire'], evacuation: ['doors', 'stairs', 'fire'],
    mall: ['evacuation', 'sanitary', 'rooms'], accessibility: ['doors', 'stairs', 'sanitary'],
    stairs: ['evacuation', 'accessibility', 'doors'], fire: ['evacuation', 'doors', 'ventilation'],
  };
  const priority = preferred[selected.at(-1) ?? ''] ?? [];
  const rank = (id: string) => priority.includes(id) ? priority.indexOf(id) : priority.length;
  const counts = new Map<string, number>();
  for (const id of visible) for (const topic of index.clauses[id].topics) {
    if (!selected.includes(topic)) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return index.topics.filter((t) => counts.has(t.id))
    .map((t) => ({ ...t, count: counts.get(t.id)! }))
    .sort((a, b) => rank(a.id) - rank(b.id) || b.count - a.count || a.id.localeCompare(b.id)).slice(0, limit);
}
