import type { NormTopic } from './types';

// Explicit lexical links, not compliance conclusions. Stems cover inflections.
export const TOPICS: NormTopic[] = [
  { id: 'doors', title: 'Двери', roots: ['двер', 'дверн', 'есік'], color: '#67d5cf' },
  { id: 'evacuation', title: 'Эвакуация', roots: ['эвакуа', 'эвакуациялық', 'эвакуациялау'], color: '#f3b770' },
  { id: 'mall', title: 'Помещения ТРЦ', roots: ['торгов', 'торгово', 'магазин', 'трц', 'сауда'], color: '#ba9aef' },
  { id: 'fire', title: 'Пожарная безопасность', roots: ['пожар', 'огнестой', 'противопожар', 'өрт'], color: '#ee8998' },
  { id: 'accessibility', title: 'МГН и доступность', roots: ['маломобиль', 'инвалид', 'мгн', 'пандус', 'кресло-коляс', 'мүгедек'], color: '#8bbbe9' },
  { id: 'stairs', title: 'Лестницы и коридоры', roots: ['лестни', 'коридор', 'баспалдақ', 'дәліз'], color: '#7fcba2' },
  { id: 'sanitary', title: 'Санузлы и гигиена', roots: ['сануз', 'уборн', 'туалет', 'умываль', 'санитар', 'дәретхана'], color: '#d9c078' },
  { id: 'parking', title: 'Паркинг и проезды', roots: ['автостоян', 'паркин', 'парков', 'гараж', 'проезд'], color: '#b3baeb' },
  { id: 'light', title: 'Освещение и инсоляция', roots: ['освещ', 'инсоля', 'кео', 'жарық'], color: '#e8cf83' },
  { id: 'ventilation', title: 'Вентиляция и дымоудаление', roots: ['вентиля', 'дымоудал', 'воздухообмен', 'желдет'], color: '#8acddc' },
  { id: 'rooms', title: 'Площади и высоты помещений', roots: ['площад', 'высот', 'помещен', 'аудан', 'биіктік'], color: '#aab7c7' },
  { id: 'schools', title: 'Школы и детские сады', roots: ['школ', 'дошколь', 'детск', 'учебн', 'мектеп', 'балабақша'], color: '#d7a8c7' },
  { id: 'clinics', title: 'Медицина', roots: ['поликлини', 'больниц', 'медицин', 'здравоохран', 'емхана'], color: '#95cebb' },
  { id: 'food', title: 'Кафе и кухни', roots: ['кухн', 'столов', 'ресторан', 'кафе', 'пищеблок', 'асхана'], color: '#d3ad8a' },
  { id: 'structure', title: 'Конструкции и сейсмика', roots: ['сейсм', 'несущ', 'фундамент', 'железобетон', 'бетон'], color: '#a6b1bb' },
  { id: 'energy', title: 'Тепло и энергоэффективность', roots: ['тепло', 'энерго', 'отоплен', 'жылу'], color: '#e4ac85' },
  { id: 'site', title: 'Генплан и благоустройство', roots: ['генеральн', 'благоустрой', 'озелен', 'градостроит', 'участ'], color: '#a1c984' },
  { id: 'water', title: 'Вода и канализация', roots: ['водоснабж', 'канализа', 'водоотвед', 'су құбыр'], color: '#89b9dd' },
  { id: 'electric', title: 'Электрика', roots: ['электр', 'заземл', 'молниезащ'], color: '#cfbe85' },
  { id: 'noise', title: 'Шум и акустика', roots: ['шум', 'акуст', 'звукоизоля', 'дыбыс'], color: '#b5a5da' },
  { id: 'lifts', title: 'Лифты и эскалаторы', roots: ['лифт', 'эскалатор', 'подъемник'], color: '#86c4bc' },
  { id: 'waste', title: 'Отходы и хранение', roots: ['отход', 'мусор', 'кладов', 'склад', 'қалдық'], color: '#b7bd8d' },
];

export function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}.-]+/gu, ' ').trim();
}

export function topicMatches(text: string): string[] {
  const words = normalizeSearch(text).split(/\s+/);
  return TOPICS.filter((topic) => topic.roots.some((root) => words.some((word) => word.startsWith(root)))).map((topic) => topic.id);
}
