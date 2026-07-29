import type { RoomGroup, Status } from '@/types/knowledge';
import type { DiagramNode } from '@/lib/diagram/build-graph';
import type { EdgeGeometry } from '@/components/diagram/edge-layer';
import { EDGE_STYLE, STATUS_STROKE, ZONE_STYLE, hexToRgba } from '@/lib/diagram/style';
import { formatArea } from '@/lib/format';

/**
 * Диаграмма в SVG.
 *
 * Файл собирается из данных графа, а не снимком с экрана: снимок DOM даёт
 * многомегабайтный `foreignObject`, который не растрируется и не правится
 * в редакторе. Здесь получаются настоящие окружности и линии — их можно
 * открыть в Illustrator, перекрасить и вставить в отчёт.
 */

const PAD = 60;
const LEGEND_WIDTH = 300;
const TITLE_HEIGHT = 96;
// Кавычки внутри стека шрифтов только одинарные: двойные ломают XML-атрибут.
const FONT = "Inter, 'Segoe UI', Arial, sans-serif";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Палитра выгрузки всегда светлая: файл идёт в печать и в отчёт. */
const INK = {
  fg: '#14181b',
  muted: '#5c656d',
  line: '#d5dade',
  strong: '#b3bbc2',
  err: '#b3261e',
  bg: '#ffffff',
  panel: '#f6f7f8',
};

export interface DiagramSvgInput {
  nodes: { node: DiagramNode; x: number; y: number }[];
  edges: EdgeGeometry[];
  groups: RoomGroup[];
  colorMode: 'group' | 'zone';
  /** дорожки этажей; пусто — свободная раскладка */
  bands?: { label: string; y: number }[];
  bandHeight?: number;
  title: string;
  subtitle: string;
  footer: string;
}

function edgePath(item: EdgeGeometry): string {
  const dx = item.to.x - item.from.x;
  const dy = item.to.y - item.from.y;
  const length = Math.hypot(dx, dy) || 1;
  if (length <= item.radiusFrom + item.radiusTo) return '';
  const ux = dx / length;
  const uy = dy / length;
  const start = { x: item.from.x + ux * item.radiusFrom, y: item.from.y + uy * item.radiusFrom };
  const end = { x: item.to.x - ux * item.radiusTo, y: item.to.y - uy * item.radiusTo };
  const style = EDGE_STYLE[item.edge.type];
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

  const stroke = style.tone === 'err' ? INK.err : style.tone === 'muted' ? INK.muted : INK.strong;
  const parts: string[] = [];

  if (style.gap) {
    const half = 18;
    parts.push(
      `<path d="M ${start.x} ${start.y} L ${mid.x - ux * half} ${mid.y - uy * half} M ${mid.x + ux * half} ${mid.y + uy * half} L ${end.x} ${end.y}" fill="none" stroke="${stroke}" stroke-width="${style.width}" stroke-dasharray="${style.dash ?? ''}" stroke-linecap="round"/>`,
    );
  } else {
    parts.push(
      `<path d="M ${start.x} ${start.y} L ${end.x} ${end.y}" fill="none" stroke="${stroke}" stroke-width="${style.width}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ''} stroke-linecap="round"/>`,
    );
  }

  if (style.double) {
    parts.push(
      `<path d="M ${start.x} ${start.y} L ${end.x} ${end.y}" fill="none" stroke="${INK.bg}" stroke-width="${style.width - 2}" stroke-linecap="round"/>`,
    );
  }
  if (style.square) {
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    parts.push(
      `<rect x="${mid.x - 5}" y="${mid.y - 5}" width="10" height="10" fill="${INK.bg}" stroke="${stroke}" stroke-width="1.4" transform="rotate(${angle} ${mid.x} ${mid.y})"/>`,
    );
  }
  if (style.cross) {
    parts.push(
      `<g stroke="${stroke}" stroke-width="2" stroke-linecap="round"><line x1="${mid.x - 6}" y1="${mid.y - 6}" x2="${mid.x + 6}" y2="${mid.y + 6}"/><line x1="${mid.x - 6}" y1="${mid.y + 6}" x2="${mid.x + 6}" y2="${mid.y - 6}"/></g>`,
    );
  }
  return parts.join('');
}

function nodeMarkup(
  entry: { node: DiagramNode; x: number; y: number },
  colorMode: 'group' | 'zone',
): string {
  const { node, x, y } = entry;
  const stroke = STATUS_STROKE[node.status];
  const tint = colorMode === 'zone' ? ZONE_STYLE[node.zone].color : node.group.color;
  const unresolved = node.areaEach === null;
  const r = node.radius;

  const circle = `<circle cx="${x}" cy="${y}" r="${r - stroke.width}" fill="${
    unresolved ? INK.panel : hexToRgba(tint, node.isGroupBubble ? 0.14 : 0.22)
  }" stroke="${unresolved ? INK.strong : tint}" stroke-width="${stroke.width}"${
    unresolved ? ' stroke-dasharray="4 4"' : stroke.dash ? ` stroke-dasharray="${stroke.dash}"` : ''
  }/>`;

  const inner = node.isGroupBubble
    ? `<circle cx="${x}" cy="${y}" r="${r - stroke.width - 5}" fill="none" stroke="${tint}" stroke-width="1" opacity="0.6"/>`
    : '';

  const marker =
    node.status === 'conditional' && !node.isGroupBubble
      ? `<path d="M ${x + r * 0.55} ${y - r * 0.66} l 10 0 l 0 10" fill="none" stroke="${tint}" stroke-width="2" stroke-linecap="square"/>`
      : '';

  const label =
    r >= 42
      ? `<text x="${x}" y="${y - 2}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="500" fill="${INK.fg}">${escapeXml(
          node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label,
        )}</text><text x="${x}" y="${y + 12}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${INK.muted}">${
          unresolved ? '— м²' : `${formatArea(node.areaEach)} м²`
        }</text>`
      : `<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="600" fill="${INK.fg}">${escapeXml(node.code)}</text>`;

  const count =
    node.count > 1
      ? `<text x="${x + r - 2}" y="${y - r + 4}" text-anchor="start" font-family="${FONT}" font-size="10" fill="${INK.muted}">×${node.count}</text>`
      : '';

  return `${circle}${inner}${marker}${label}${count}`;
}

function legendMarkup(
  groups: RoomGroup[],
  colorMode: 'group' | 'zone',
  x: number,
  y: number,
  height: number,
): string {
  const rows: string[] = [];
  let cursor = y + 26;

  const heading = (text: string) => {
    cursor += 8;
    rows.push(
      `<text x="${x + 14}" y="${cursor}" font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="0.06em" fill="${INK.muted}">${escapeXml(text.toUpperCase())}</text>`,
    );
    cursor += 14;
  };

  if (colorMode === 'zone') {
    heading('Санитарные зоны');
    for (const zone of ['clean', 'dirty', 'neutral'] as const) {
      rows.push(
        `<circle cx="${x + 20}" cy="${cursor - 4}" r="5" fill="${hexToRgba(ZONE_STYLE[zone].color, 0.35)}" stroke="${ZONE_STYLE[zone].color}" stroke-width="1.4"/>` +
          `<text x="${x + 32}" y="${cursor}" font-family="${FONT}" font-size="11" fill="${INK.fg}">${escapeXml(ZONE_STYLE[zone].label)}</text>`,
      );
      cursor += 16;
    }
  } else {
    heading('Функциональные группы');
    for (const group of groups) {
      rows.push(
        `<circle cx="${x + 20}" cy="${cursor - 4}" r="5" fill="${hexToRgba(group.color, 0.35)}" stroke="${group.color}" stroke-width="1.4"/>` +
          `<text x="${x + 32}" y="${cursor}" font-family="${FONT}" font-size="11" fill="${INK.fg}">${escapeXml(group.name)}</text>`,
      );
      cursor += 16;
    }
  }

  heading('Статус помещения');
  for (const status of ['required', 'conditional', 'recommended', 'optional'] as Status[]) {
    const s = STATUS_STROKE[status];
    rows.push(
      `<circle cx="${x + 20}" cy="${cursor - 4}" r="6" fill="none" stroke="${INK.fg}" stroke-width="${s.width}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>` +
        `<text x="${x + 32}" y="${cursor}" font-family="${FONT}" font-size="11" fill="${INK.fg}">${escapeXml(s.label)}</text>`,
    );
    cursor += 16;
  }

  heading('Типы связей');
  for (const type of Object.keys(EDGE_STYLE) as (keyof typeof EDGE_STYLE)[]) {
    const style = EDGE_STYLE[type];
    const stroke = style.tone === 'err' ? INK.err : style.tone === 'muted' ? INK.muted : INK.strong;
    const cy = cursor - 4;
    let sample = style.gap
      ? `<line x1="${x + 12}" y1="${cy}" x2="${x + 24}" y2="${cy}" stroke="${stroke}" stroke-width="${style.width}" stroke-dasharray="${style.dash ?? ''}"/><line x1="${x + 34}" y1="${cy}" x2="${x + 46}" y2="${cy}" stroke="${stroke}" stroke-width="${style.width}" stroke-dasharray="${style.dash ?? ''}"/>`
      : `<line x1="${x + 12}" y1="${cy}" x2="${x + 46}" y2="${cy}" stroke="${stroke}" stroke-width="${style.width}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ''}/>`;
    if (style.double) {
      sample += `<line x1="${x + 12}" y1="${cy}" x2="${x + 46}" y2="${cy}" stroke="${INK.bg}" stroke-width="${style.width - 2}"/>`;
    }
    if (style.square) {
      sample += `<rect x="${x + 24}" y="${cy - 5}" width="10" height="10" fill="${INK.bg}" stroke="${stroke}" stroke-width="1.4"/>`;
    }
    if (style.cross) {
      sample += `<g stroke="${stroke}" stroke-width="2"><line x1="${x + 23}" y1="${cy - 5}" x2="${x + 35}" y2="${cy + 5}"/><line x1="${x + 23}" y1="${cy + 5}" x2="${x + 35}" y2="${cy - 5}"/></g>`;
    }
    rows.push(
      `${sample}<text x="${x + 54}" y="${cursor}" font-family="${FONT}" font-size="11" fill="${INK.fg}">${escapeXml(style.label)}</text>`,
    );
    cursor += 16;
  }

  cursor += 8;
  rows.push(
    `<text x="${x + 14}" y="${cursor}" font-family="${FONT}" font-size="10" fill="${INK.muted}">Радиус ∝ √площади помещения.</text>`,
  );
  cursor += 13;
  rows.push(
    `<text x="${x + 14}" y="${cursor}" font-family="${FONT}" font-size="10" fill="${INK.muted}">Серый пунктир — площадь не определена.</text>`,
  );

  return (
    `<rect x="${x}" y="${y}" width="${LEGEND_WIDTH}" height="${height}" fill="${INK.bg}" stroke="${INK.line}" stroke-width="1"/>` +
    `<text x="${x + 14}" y="${y + 18}" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="0.06em" fill="${INK.fg}">ЛЕГЕНДА</text>` +
    rows.join('')
  );
}

export function buildDiagramSvg(input: DiagramSvgInput): string {
  const { nodes, edges, groups, colorMode, bands, bandHeight, title, subtitle, footer } = input;
  if (nodes.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';

  const minX = Math.min(...nodes.map((n) => n.x - n.node.radius));
  const maxX = Math.max(...nodes.map((n) => n.x + n.node.radius));
  const minY = Math.min(...nodes.map((n) => n.y - n.node.radius));
  const maxY = Math.max(...nodes.map((n) => n.y + n.node.radius));

  const graphWidth = maxX - minX;
  const graphHeight = maxY - minY;
  const width = Math.round(graphWidth + PAD * 2 + LEGEND_WIDTH + 24);
  const height = Math.round(Math.max(graphHeight + PAD * 2 + TITLE_HEIGHT, 560));

  // Сдвиг графа в систему координат листа.
  const dx = PAD - minX;
  const dy = PAD + TITLE_HEIGHT - minY;

  const shiftedEdges = edges
    .filter((item) => !item.dimmed)
    .map((item) => ({
      ...item,
      from: { x: item.from.x + dx, y: item.from.y + dy },
      to: { x: item.to.x + dx, y: item.to.y + dy },
    }));

  // Дорожки этажей идут подложкой: без них раскладка по уровням нечитаема.
  const bandMarkup =
    bands && bandHeight
      ? bands.map((band, index) => {
          const top = band.y + dy - bandHeight / 2;
          return (
            `<rect x="${PAD - 20}" y="${top}" width="${graphWidth + 40}" height="${bandHeight}" fill="${index % 2 === 0 ? INK.panel : INK.bg}"/>` +
            `<line x1="${PAD - 20}" y1="${top}" x2="${PAD + graphWidth + 20}" y2="${top}" stroke="${INK.line}"/>` +
            `<text x="${PAD - 8}" y="${top + 20}" font-family="${FONT}" font-size="12" font-weight="700" letter-spacing="0.06em" fill="${INK.muted}">${escapeXml(band.label.toUpperCase())}</text>`
          );
        })
      : [];

  const body = [
    `<rect width="${width}" height="${height}" fill="${INK.bg}"/>`,
    ...bandMarkup,
    `<text x="${PAD}" y="40" font-family="${FONT}" font-size="18" font-weight="700" fill="${INK.fg}">${escapeXml(title)}</text>`,
    `<text x="${PAD}" y="62" font-family="${FONT}" font-size="12" fill="${INK.muted}">${escapeXml(subtitle)}</text>`,
    `<line x1="${PAD}" y1="${TITLE_HEIGHT - 12}" x2="${width - PAD}" y2="${TITLE_HEIGHT - 12}" stroke="${INK.line}"/>`,
    ...shiftedEdges.map(edgePath),
    ...nodes.map((entry) =>
      nodeMarkup({ ...entry, x: entry.x + dx, y: entry.y + dy }, colorMode),
    ),
    legendMarkup(
      groups,
      colorMode,
      width - LEGEND_WIDTH - PAD + 24,
      TITLE_HEIGHT,
      height - TITLE_HEIGHT - PAD,
    ),
    `<text x="${PAD}" y="${height - 20}" font-family="${FONT}" font-size="10" fill="${INK.muted}">${escapeXml(footer)}</text>`,
  ].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${body}\n</svg>`;
}
