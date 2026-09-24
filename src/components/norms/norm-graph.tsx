'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { CorpusIndex } from '@/lib/norms/types';

interface Props {
  index: CorpusIndex; visible: number[]; filtered: boolean; topics: string[];
  selected: number | null; onClause: (id: number) => void; onDoc: (id: number) => void; onTopic: (id: string) => void;
}
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const COLORS = ['#8acddc', '#ba9aef', '#7fcba2', '#f3b770', '#ee8998', '#8bbbe9', '#d9c078', '#d7a8c7', '#a1c984', '#d3ad8a', '#b3baeb'];
export function NormGraph({ index, visible, filtered, topics, selected, onClause, onDoc, onTopic }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const camera = useRef({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [frame, setFrame] = useState(0);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hover, setHover] = useState('');
  const references = useMemo(() => {
    const code = (value: string) => value.toUpperCase().replace(/\s+/g, '');
    const known = new Map(index.documents.map((d, id) => [code(d.code), id]));
    const links = new Set<string>();
    for (const clause of index.clauses) {
      for (const match of clause.excerpt.matchAll(/(?:СП|СН|СНиП|ГОСТ|СТ|РДС|МСН)\s+(?:РК\s+)?\d[\d.-]*\d/gi)) {
        const target = known.get(code(match[0]));
        if (target !== undefined && target !== clause.doc) links.add([Math.min(target, clause.doc), Math.max(target, clause.doc)].join(':'));
      }
    }
    return [...links].map((link) => link.split(':').map(Number));
  }, [index]);
  const model = useMemo(() => {
    const groups = new Map<number, number[]>();
    if (!filtered) index.documents.forEach((_, id) => groups.set(id, []));
    for (const id of visible) { const doc = index.clauses[id].doc; const group = groups.get(doc) || []; group.push(id); groups.set(doc, group); }
    const sections = [...new Set(index.documents.map((d) => d.section))];
    const docs = [...groups].map(([id, clauses], order) => {
      const angle = order * GOLDEN;
      const radius = 180 + Math.sqrt(order) * 62;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      const color = COLORS[sections.indexOf(index.documents[id].section) % COLORS.length];
      return { id, clauses, x, y, color };
    });
    const x = new Float32Array(index.clauses.length), y = new Float32Array(index.clauses.length);
    for (const doc of docs) doc.clauses.forEach((id, i) => {
      const radius = 7 + Math.sqrt((i + 1) / (doc.clauses.length + 1)) * 36;
      x[id] = doc.x + Math.cos(i * GOLDEN) * radius; y[id] = doc.y + Math.sin(i * GOLDEN) * radius;
    });
    const topicNodes = index.topics.map((t, i) => ({ ...t, x: Math.cos(i * Math.PI * 2 / index.topics.length) * 100, y: Math.sin(i * Math.PI * 2 / index.topics.length) * 100 }));
    const locations = new Map(docs.map((d) => [d.id, d]));
    const links = references.flatMap(([a, b]) => { const from = locations.get(a), to = locations.get(b); return from && to ? [{ from, to }] : []; });
    return { docs, x, y, topicNodes, links, extent: Math.max(280, 240 + Math.sqrt(docs.length) * 62) };
  }, [index, visible, filtered, references]);

  useEffect(() => {
    if (!wrap.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(wrap.current); return () => observer.disconnect();
  }, []);

  // The entire overview is rasterized once; pan and zoom stay responsive even
  // for hundreds of thousands of points. At close range every node is hit-tested.
  const overview = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const buffer = document.createElement('canvas'); buffer.width = 2200; buffer.height = 2200;
    const ctx = buffer.getContext('2d')!;
    const scale = 1100 / model.extent;
    ctx.translate(1100, 1100); ctx.scale(scale, scale);
    ctx.strokeStyle = '#8ca0b5'; ctx.globalAlpha = 0.08; ctx.lineWidth = 0.8 / scale; ctx.beginPath();
    for (const { from, to } of model.links) { ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); }
    ctx.stroke();
    for (const doc of model.docs) {
      ctx.fillStyle = doc.color; ctx.globalAlpha = 0.6; ctx.beginPath();
      for (const id of doc.clauses) ctx.rect(model.x[id], model.y[id], 1.7 / scale, 1.7 / scale);
      ctx.fill();
    }
    return buffer;
  }, [model]);

  useEffect(() => {
    camera.current = { x: size.width / 2, y: size.height / 2, scale: Math.min(size.width, size.height) / (2.2 * model.extent) };
    // Canvas drawing occurs in the next effect in the same commit.
  }, [model.extent, size.width, size.height, model]);

  useEffect(() => {
    if (selected === null) return;
    const doc = model.docs.find((d) => d.id === index.clauses[selected].doc);
    if (doc) camera.current = { x: size.width / 2 - model.x[selected] * 4, y: size.height / 2 - model.y[selected] * 4, scale: 4 };
  }, [selected, model, index, size]);

  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx || !overview) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(size.width * ratio); el.height = Math.round(size.height * ratio);
    ctx.scale(ratio, ratio); ctx.clearRect(0, 0, size.width, size.height);
    const cam = camera.current;
    ctx.save(); ctx.translate(cam.x, cam.y); ctx.scale(cam.scale, cam.scale);
    if (cam.scale < 1.2) ctx.drawImage(overview, -model.extent, -model.extent, 2 * model.extent, 2 * model.extent);
    else { ctx.globalAlpha = 0.1; ctx.strokeStyle = '#8ca0b5'; ctx.lineWidth = 0.5 / cam.scale; ctx.beginPath(); for (const { from, to } of model.links) { ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); } ctx.stroke(); }
    const selectedDoc = selected === null ? null : index.clauses[selected].doc;
    for (const doc of model.docs) {
      const sx = doc.x * cam.scale + cam.x, sy = doc.y * cam.scale + cam.y;
      if (sx < -80 * cam.scale || sy < -80 * cam.scale || sx > size.width + 80 * cam.scale || sy > size.height + 80 * cam.scale) continue;
      if (cam.scale >= 1.2) {
        ctx.strokeStyle = doc.color; ctx.globalAlpha = 0.12; ctx.lineWidth = 0.5 / cam.scale; ctx.beginPath();
        for (const id of doc.clauses) { ctx.moveTo(doc.x, doc.y); ctx.lineTo(model.x[id], model.y[id]); }
        ctx.stroke(); ctx.globalAlpha = 0.85; ctx.fillStyle = doc.color; ctx.beginPath();
        for (const id of doc.clauses) ctx.rect(model.x[id] - 0.6, model.y[id] - 0.6, 1.2, 1.2);
        ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.fillStyle = doc.color; ctx.beginPath(); ctx.arc(doc.x, doc.y, 3.6 / Math.sqrt(cam.scale), 0, Math.PI * 2); ctx.fill();
      if (cam.scale > 0.6 || selectedDoc === doc.id) {
        ctx.font = `${11 / cam.scale}px sans-serif`; ctx.fillStyle = '#dce6ee';
        ctx.fillText(index.documents[doc.id].code.slice(0, 45), doc.x + 7 / cam.scale, doc.y - 7 / cam.scale);
      }
    }
    for (const t of model.topicNodes) {
      const active = topics.includes(t.id);
      if (active) {
        ctx.globalAlpha = 0.2; ctx.strokeStyle = t.color; ctx.lineWidth = 1 / cam.scale; ctx.beginPath();
        for (const doc of model.docs) if (doc.clauses.some((id) => index.clauses[id].topics.includes(t.id))) { ctx.moveTo(t.x, t.y); ctx.lineTo(doc.x, doc.y); }
        ctx.stroke();
      }
      ctx.globalAlpha = active ? 1 : 0.7; ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(t.x, t.y, (active ? 8 : 5) / Math.sqrt(cam.scale), 0, Math.PI * 2); ctx.fill();
      if (cam.scale > 0.9 || active) { ctx.font = `${12 / cam.scale}px sans-serif`; ctx.fillStyle = '#e5edf5'; ctx.fillText(t.title, t.x + 10 / cam.scale, t.y); }
    }
    if (selected !== null && visible.includes(selected)) {
      ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / cam.scale; ctx.beginPath(); ctx.arc(model.x[selected], model.y[selected], 7 / cam.scale, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }, [frame, index, model, overview, selected, size, topics, visible]);

  function zoom(factor: number, x = size.width / 2, y = size.height / 2) {
    const old = camera.current, scale = Math.max(0.05, Math.min(18, old.scale * factor));
    camera.current = { x: x - (x - old.x) * scale / old.scale, y: y - (y - old.y) * scale / old.scale, scale }; setFrame((f) => f + 1);
  }
  function fit() { camera.current = { x: size.width / 2, y: size.height / 2, scale: Math.min(size.width, size.height) / (2.2 * model.extent) }; setFrame((f) => f + 1); }
  function hit(x: number, y: number) {
    const cam = camera.current, wx = (x - cam.x) / cam.scale, wy = (y - cam.y) / cam.scale;
    const distance = (px: number, py: number) => Math.hypot(px - wx, py - wy) * cam.scale;
    let best = 10;
    let result: { type: 'topic' | 'doc' | 'clause'; id: string | number; label: string } | null = null;
    for (const t of model.topicNodes) { const d = distance(t.x, t.y); if (d < best) { best = d; result = { type: 'topic', id: t.id, label: t.title }; } }
    for (const doc of model.docs) {
      const d = distance(doc.x, doc.y);
      if (d < best) { best = d; result = { type: 'doc', id: doc.id, label: `${index.documents[doc.id].code} · ${index.documents[doc.id].title}` }; }
      if (cam.scale > 1 && d < 55 * cam.scale) for (const id of doc.clauses) {
        const c = distance(model.x[id], model.y[id]); if (c < best) { best = c; result = { type: 'clause', id, label: `${index.clauses[id].label} · ${index.clauses[id].excerpt.slice(0, 90)}` }; }
      }
    }
    return result;
  }
  return <div ref={wrap} className="relative h-full min-h-[260px] overflow-hidden bg-[#0c1420] text-slate-200">
    <canvas ref={canvas} aria-label="Граф документов и пунктов. Колесо или плюс и минус — масштаб, перетаскивание — перемещение. Все пункты также доступны в списке." tabIndex={0} className="h-full w-full touch-none outline-none"
      onWheel={(e) => { const box = e.currentTarget.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.002), e.clientX - box.left, e.clientY - box.top); }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, moved: false }; }}
      onPointerMove={(e) => {
        if (drag.current) { const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true; camera.current.x += dx; camera.current.y += dy; drag.current.x = e.clientX; drag.current.y = e.clientY; setFrame((f) => f + 1); }
        else { const box = e.currentTarget.getBoundingClientRect(); setHover(hit(e.clientX - box.left, e.clientY - box.top)?.label || ''); }
      }}
      onPointerUp={(e) => { if (drag.current && !drag.current.moved) { const box = e.currentTarget.getBoundingClientRect(), target = hit(e.clientX - box.left, e.clientY - box.top); if (target?.type === 'topic') onTopic(String(target.id)); else if (target?.type === 'doc') onDoc(Number(target.id)); else if (target) onClause(Number(target.id)); } drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(e) => { if (e.key === '+' || e.key === '=') zoom(1.4); else if (e.key === '-') zoom(1 / 1.4); else if (e.key === 'Home') fit(); else if (e.key.startsWith('Arrow')) { e.preventDefault(); camera.current.x += e.key === 'ArrowLeft' ? 50 : e.key === 'ArrowRight' ? -50 : 0; camera.current.y += e.key === 'ArrowUp' ? 50 : e.key === 'ArrowDown' ? -50 : 0; setFrame((f) => f + 1); } }} />
    <div className="pointer-events-none absolute left-5 top-5 max-w-[70%]">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Атлас нормативов</p>
      <p className="mt-1 text-lg font-medium">{filtered ? 'Связанные требования' : 'Вся нормативная база'}</p>
      <p className="mt-1 text-xs text-slate-400">{model.docs.length.toLocaleString('ru')} документов · {visible.length.toLocaleString('ru')} пунктов и фрагментов</p>
    </div>
    <div className="absolute right-4 top-4 flex flex-col gap-1 rounded-lg border border-slate-600/50 bg-[#141e2c] p-1">
      <button aria-label="Приблизить" title="Приблизить" onClick={() => zoom(1.5)} className="rounded p-2 hover:bg-slate-700"><Plus size={17} /></button>
      <button aria-label="Отдалить" title="Отдалить" onClick={() => zoom(1 / 1.5)} className="rounded p-2 hover:bg-slate-700"><Minus size={17} /></button>
      <button aria-label="Показать весь граф" title="Показать весь граф" onClick={fit} className="rounded p-2 hover:bg-slate-700"><Maximize size={17} /></button>
    </div>
    <div className="pointer-events-none absolute bottom-4 left-5 right-5 text-xs text-slate-400">{hover || 'Точки — пункты · центры облаков — документы · цвет — раздел базы. Приближайте и выбирайте.'}</div>
  </div>;
}
