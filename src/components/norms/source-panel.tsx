'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, X } from 'lucide-react';
import { fetchCorpusFile } from '@/lib/norms/crypto';
import { citation } from '@/lib/norms/search';
import type { CorpusSession } from '@/lib/norms/types';
import { download } from '@/lib/export/download';

// Source text is escaped by React. No source HTML or links are executed.
function SourceText({ text }: { text: string }) {
  const blocks = text.replace(/<!--\s*стр\. (\d+)\s*-->/g, '\n\nСтраница $1\n\n').split(/\n\s*\n/);
  return <div className="space-y-4 text-[13px] leading-relaxed">{blocks.map((block, i) => {
    const lines = block.trim().split('\n');
    if (lines.length > 1 && lines.every((line) => line.trim().startsWith('|'))) {
      const rows = lines.filter((line) => !/^\|[\s:|\-]+\|$/.test(line.trim())).map((line) => line.trim().replace(/^\||\|$/g, '').split('|'));
      return <div key={i} className="overflow-x-auto rounded border border-line"><table className="w-full text-left text-xs"><tbody>{rows.map((cells, row) => <tr key={row}>{cells.map((cell, col) => row === 0 ? <th key={col} className="border border-line bg-panel p-2 font-medium">{cell.trim()}</th> : <td key={col} className="border border-line p-2 align-top">{cell.trim()}</td>)}</tr>)}</tbody></table></div>;
    }
    if (/^#{1,6}\s/.test(block)) return <p key={i} className="whitespace-pre-wrap font-semibold">{block.replace(/^#{1,6}\s/, '')}</p>;
    return <p key={i} className="whitespace-pre-wrap break-words">{block}</p>;
  })}</div>;
}

export function SourcePanel({ session, docId, clauseId, onClose, onTopic }: {
  session: CorpusSession; docId: number; clauseId: number | null; onClose: () => void; onTopic: (id: string) => void;
}) {
  const doc = session.index.documents[docId];
  const clause = clauseId === null ? null : session.index.clauses[clauseId];
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<'clause' | 'page'>(clause ? 'clause' : 'page');
  const [page, setPage] = useState(clause?.page || 1);
  const [copied, setCopied] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current(); };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetchCorpusFile<{ text: string }>(session.key, session.manifest, doc.id, controller.signal)
      .then((value) => { if (!controller.signal.aborted) { setText(value.text); setError(''); } })
      .catch(() => { if (!controller.signal.aborted) setError('Документ не загрузился. Проверьте соединение.'); });
    return () => controller.abort();
  }, [session, doc.id, retry]);
  const pages = useMemo(() => {
    if (!text) return [];
    const markers = [...text.matchAll(/<!-- стр\. (\d+) -->/g)];
    if (!markers.length) return [{ number: 1, start: 0, end: text.length }];
    return markers.map((m, i) => ({ number: Number(m[1]), start: m.index!, end: markers[i + 1]?.index ?? text.length }));
  }, [text]);
  const current = pages.findIndex((p) => p.number === page);
  const actual = Math.max(0, current);
  const rendered = text ? mode === 'clause' && clause ? text.slice(clause.start, clause.end) : text.slice(pages[actual]?.start || 0, pages[actual]?.end ?? text.length) : '';
  const reference = clauseId === null || mode === 'page' ? `${doc.code} «${doc.title}» · стр. ${pages[actual]?.number || 1} · ${doc.source}` : citation(session.index, clauseId);
  return <aside aria-label="Текст нормы" className="norm-source-enter absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-line bg-bg shadow-2xl md:w-[520px]">
    <div className="border-b border-line p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><span className="text-xs font-medium text-accent">Источник · {doc.section}</span><button ref={closeButton} onClick={onClose} aria-label="Закрыть документ" className="norm-icon-button"><X size={18} /></button></div>
      <h2 className="text-base font-semibold">{doc.code}</h2><p className="mt-1 text-sm text-muted">{doc.title}</p>
      <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer">Актуальность не проверена</summary><p className="mt-2 leading-relaxed">Год в шифре: {doc.year || 'не указан'}. Текст распознан из исходника. Для заключения проверьте редакцию, область применения и числовые значения.</p></details>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-xs">
      {clause && <button className={`rounded px-2 py-1 ${mode === 'clause' ? 'bg-accent-soft text-accent' : 'hover:bg-raised'}`} onClick={() => setMode('clause')}>{clause.label}</button>}
      <button className={`rounded px-2 py-1 ${mode === 'page' ? 'bg-accent-soft text-accent' : 'hover:bg-raised'}`} onClick={() => setMode('page')}>Страница целиком</button>
      <span className="ml-auto text-muted">{clause && mode === 'clause' ? `стр. ${clause.page || '—'}` : `стр. ${pages[actual]?.number || '—'}`}</span>
    </div>
    {mode === 'page' && pages.length > 0 && <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs">
      <button aria-label="Предыдущая страница" disabled={actual === 0} onClick={() => setPage(pages[actual - 1].number)} className="p-1 disabled:opacity-30"><ChevronLeft size={18} /></button>
      <label>Страница <select aria-label="Страница документа" value={pages[actual].number} onChange={(e) => setPage(Number(e.target.value))} className="rounded border border-line bg-panel px-2 py-1">{pages.map((p) => <option key={p.number} value={p.number}>{p.number}</option>)}</select></label>
      <span className="text-muted">из {pages.length}</span>
      <button aria-label="Следующая страница" disabled={actual === pages.length - 1} onClick={() => setPage(pages[actual + 1].number)} className="p-1 disabled:opacity-30"><ChevronRight size={18} /></button>
    </div>}
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {error ? <div role="alert">{error} <button className="text-accent" onClick={() => { setError(''); setRetry((r) => r + 1); }}>Повторить</button></div> : text === null ? <p role="status" className="text-muted">Загружаю документ…</p> : <SourceText text={rendered} />}
      {clause && <div className="mt-6 border-t border-line pt-4"><p className="mb-2 text-xs text-muted">Связанные темы по тексту фрагмента и названию документа</p><div className="flex flex-wrap gap-2">{clause.topics.map((id) => <button key={id} onClick={() => onTopic(id)} className="rounded-full border border-line px-2 py-1 text-xs hover:bg-raised">{session.index.topics.find((t) => t.id === id)?.title}</button>)}</div></div>}
    </div>
    <div className="space-y-3 border-t border-line p-4">
      <p className="break-words text-[11px] text-muted">Исходник: {doc.source || doc.path}</p>
      <div className="flex flex-wrap gap-3 text-xs">
        <button className="flex items-center gap-1.5 text-accent" onClick={() => { void navigator.clipboard.writeText(`${reference}\n\n${rendered}`).then(() => setCopied('Ссылка и текст скопированы')).catch(() => setCopied('Браузер не разрешил копирование')); }} disabled={!text}><Copy size={14} />Копировать цитату</button>
        <button className="flex items-center gap-1.5 text-accent" disabled={!text} onClick={() => text && download(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${doc.code.replace(/[<>:"/\\|?*]/g, '_')}.md`)}><Download size={14} />Полный текст .md</button>
      </div>{copied && <p role="status" className="text-xs text-muted">{copied}</p>}
    </div>
  </aside>;
}
