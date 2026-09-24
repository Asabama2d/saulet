'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, FileKey, LockKeyhole, Network, Search, X } from 'lucide-react';
import { deriveCorpusKey, fetchCorpusFile, validateManifest } from '@/lib/norms/crypto';
import { applyDocumentTopics, filterClauses, rankClause } from '@/lib/norms/search';
import { Dialog } from '@/components/ui/dialog';
import type { CorpusIndex, CorpusManifest, CorpusSession } from '@/lib/norms/types';
import { NormGraph } from './norm-graph';
import { SourcePanel } from './source-panel';

const number = (n: number) => n.toLocaleString('ru');
const field = 'min-w-0 rounded-md border border-line bg-bg px-2.5 py-2 text-xs outline-none focus:border-accent';

function Unlock({ onUnlock }: { onUnlock: (session: CorpusSession) => void }) {
  const [manifest, setManifest] = useState<CorpusManifest | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/corpus/manifest.json', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('База ещё не загружена на сайт.');
      return validateManifest(await response.json());
    }).then(setManifest).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [retry]);
  async function unlock(value: string) {
    if (!manifest || busy) return;
    setBusy(true); setError('');
    try {
      if (!globalThis.crypto?.subtle || typeof DecompressionStream === 'undefined') throw new Error('Для открытия базы нужен современный браузер и HTTPS.');
      const key = await deriveCorpusKey(value, manifest);
      const index = await fetchCorpusFile<CorpusIndex>(key, manifest, 'index');
      if (index.version !== 1 || index.documents.length !== manifest.documents || index.clauses.length !== manifest.clauses) throw new Error('Индекс базы повреждён.');
      setPassword(''); onUnlock({ key, manifest, index: applyDocumentTopics(index) });
    } catch (e) { setError(e instanceof DOMException ? 'Неверный пароль или повреждён файл базы.' : e instanceof Error ? e.message : 'Не удалось открыть базу. Повторите попытку.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Нормативная база" className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-[#0c1420] text-slate-100">
    <div className="relative mx-auto flex w-full max-w-6xl flex-1 items-center gap-12 px-6 py-12 lg:px-12">
      <div className="hidden flex-1 lg:block" aria-hidden="true"><svg viewBox="0 0 560 560" className="w-full">
        {Array.from({ length: 95 }, (_, i) => { const a = i * 2.39996, r = 30 + Math.sqrt(i) * 23, x = Math.round((280 + Math.cos(a) * r) * 100) / 100, y = Math.round((280 + Math.sin(a) * r) * 100) / 100; return <g key={i}><line x1="280" y1="280" x2={x} y2={y} stroke="#76a7b9" strokeOpacity="0.11" /><circle cx={x} cy={y} r={i % 9 === 0 ? 5 : 2.2} fill={['#67d5cf', '#ba9aef', '#f3b770'][i % 3]} opacity={i % 4 === 0 ? 1 : 0.5} /></g>; })}
        <circle cx="280" cy="280" r="12" fill="#67d5cf" /><text x="300" y="270" fill="#ddebf5" fontSize="15">Связи, которые помогают проектировать</text>
        <text x="72" y="215" fill="#8eb2c5" fontSize="12">Двери</text><text x="330" y="110" fill="#8eb2c5" fontSize="12">Эвакуация</text><text x="360" y="430" fill="#8eb2c5" fontSize="12">Помещения ТРЦ</text>
      </svg></div>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 inline-flex rounded-xl border border-teal-400/20 bg-teal-400/10 p-3 text-teal-300"><Network size={26} /></div>
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-400">SAULET / АТЛАС НОРМ</p>
        <h1 className="text-3xl font-semibold leading-tight">Вся база.<br />Связи между требованиями.</h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">Откройте граф, выберите тему и переходите от пункта к полному тексту документа.</p>
        <div className="my-6 flex gap-7 border-y border-slate-700/60 py-4"><div><div className="text-xl font-medium">{manifest ? number(manifest.documents) : '…'}</div><div className="mt-1 text-xs text-slate-400">документов</div></div><div><div className="text-xl font-medium">{manifest ? number(manifest.clauses) : '…'}</div><div className="mt-1 text-xs text-slate-400">пунктов и фрагментов</div></div></div>
        <form onSubmit={(e) => { e.preventDefault(); void unlock(password); }} className="space-y-3">
          <label htmlFor="corpus-password" className="block text-xs font-medium text-slate-300">Пароль доступа</label>
          <input id="corpus-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-3 text-sm outline-none focus:border-teal-400" placeholder="Введите пароль или выберите файл доступа" />
          <button disabled={busy || !manifest || !password.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40">{busy ? 'Открываю базу…' : 'Открыть граф'}<ArrowRight size={16} /></button>
        </form>
        <button disabled={busy || !manifest} onClick={() => file.current?.click()} className="mt-4 flex w-full items-center justify-center gap-2 text-xs text-slate-300 disabled:opacity-40"><FileKey size={15} />Выбрать файл доступа</button>
        <input ref={file} type="file" accept=".saulet-key,.txt" aria-label="Файл доступа" className="hidden" onChange={(e) => { const selected = e.target.files?.[0]; if (selected) { if (selected.size > 1024) setError('Выберите небольшой файл .saulet-key с паролем.'); else void selected.text().then(unlock).catch(() => setError('Не удалось прочитать файл доступа.')); } e.target.value = ''; }} />
        {busy && <p role="status" className="mt-4 text-xs leading-relaxed text-slate-400">Загружаю и открываю карту связей. При первом входе это может занять некоторое время.</p>}
        {error && <div role="alert" className="mt-4 text-sm text-rose-300">{error}{!manifest && <button className="ml-2 underline" onClick={() => { setError(''); setRetry((r) => r + 1); }}>Повторить</button>}</div>}
        <p className="mt-7 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500"><LockKeyhole size={14} className="mt-0.5 shrink-0" />Документы зашифрованы. Пароль открывает их только в этой вкладке и не отправляется на сервер.</p>
      </div>
    </div>
  </section>;
}

function Explorer({ session, onLock }: { session: CorpusSession; onLock: () => void }) {
  const { index } = session;
  const [topics, setTopics] = useState<string[]>([]);
  const [topicMode, setTopicMode] = useState<'any' | 'all'>('all');
  const [language, setLanguage] = useState('all');
  const [section, setSection] = useState('');
  const [docFilter, setDocFilter] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<{ query: string; ids: Set<number> } | null>(null);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ doc: number; clause: number | null } | null>(null);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<'auto' | 'documents' | 'clauses'>('auto');
  const [mobile, setMobile] = useState<'topics' | 'graph' | 'results'>('graph');
  const [coverage, setCoverage] = useState(false);
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const requestedQuery = useRef('');
  const topicsCount = useMemo(() => {
    const counts: Record<string, number> = {}; for (const clause of index.clauses) for (const t of clause.topics) counts[t] = (counts[t] || 0) + 1; return counts;
  }, [index]);
  const sections = useMemo(() => [...new Set(index.documents.map((d) => d.section))], [index]);
  useEffect(() => {
    const w = new Worker(new URL('../../lib/norms/search.worker.ts', import.meta.url));
    worker.current = w;
    w.postMessage({ type: 'init', key: session.key, manifest: session.manifest, documents: index.documents, clauseDocs: Uint16Array.from(index.clauses, (c) => c.doc) });
    w.onmessage = (event) => {
      if (event.data.id !== requestId.current) return;
      setSearching(false);
      if (event.data.error) setSearchError(event.data.error);
      else { setSearchError(''); setSearchResult({ query: requestedQuery.current, ids: new Set(event.data.ids) }); }
    };
    w.onerror = () => { setSearching(false); setSearchError('Поиск не запустился. Обновите страницу и откройте базу снова.'); };
    return () => { w.terminate(); worker.current = null; };
  }, [session, index]);
  const searchPending = !!searchQuery && searchResult?.query !== searchQuery;
  const visible = useMemo(() => filterClauses(index, { topics, topicMode, language, section, doc: docFilter,
    matches: searchQuery ? searchResult?.query === searchQuery ? searchResult.ids : new Set<number>() : undefined }),
  [index, topics, topicMode, language, section, docFilter, searchQuery, searchResult]);
  const filtered = topics.length > 0 || language !== 'all' || !!section || docFilter !== null || !!searchQuery;
  const documentIds = useMemo(() => filtered ? [...new Set(visible.map((id) => index.clauses[id].doc))] : index.documents.map((_, id) => id), [filtered, visible, index]);
  const listing = mode === 'auto' ? filtered ? 'clauses' : 'documents' : mode;
  const ranked = useMemo(() => filtered ? [...visible].sort((a, b) => rankClause(index, b, topics) - rankClause(index, a, topics)) : visible, [filtered, visible, index, topics]);
  const items = listing === 'documents' ? documentIds : ranked;
  const totalPages = Math.max(1, Math.ceil(items.length / 40));
  const activePage = Math.min(page, totalPages - 1);
  const resetPage = () => { setPage(0); setSelected(null); };
  function toggleTopic(id: string) { setTopics((previous) => previous.includes(id) ? previous.filter((t) => t !== id) : [...previous, id]); resetPage(); }
  function submitSearch() {
    const value = query.trim(); setSearchQuery(value); requestedQuery.current = value; requestId.current++; resetPage(); setSearchError('');
    if (!value) { setSearchResult(null); setSearching(false); return; }
    setSearching(true); setSearchResult(null); worker.current?.postMessage({ type: 'search', id: requestId.current, query: value });
  }
  function reset() { setTopics([]); setLanguage('all'); setSection(''); setDocFilter(null); setQuery(''); setSearchQuery(''); setSearchResult(null); requestId.current++; setSearching(false); setSearchError(''); resetPage(); }
  function selectClause(id: number) { setSelected({ doc: index.clauses[id].doc, clause: id }); }

  return <section aria-label="Нормативная база" className="flex h-full min-h-0 flex-col bg-bg">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-4 py-3">
      <h1 className="flex items-center gap-2 text-sm font-medium"><Network size={17} className="text-accent" />Атлас норм</h1>
      <span className="hidden text-xs text-muted sm:block">{number(index.documents.length)} документов · {index.created.slice(0, 10)}</span>
      <button onClick={() => setCoverage(true)} className="ml-auto text-xs text-muted underline decoration-dotted underline-offset-4">Состав базы</button><button onClick={onLock} className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs"><LockKeyhole size={13} />Закрыть доступ</button>
    </header>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel p-3">
      <form className="flex min-w-[200px] flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}><div className="relative flex-1"><Search size={15} className="absolute left-3 top-2.5 text-muted" /><input aria-label="Поиск по полным текстам" placeholder="Поиск по полным текстам, шифру, теме…" value={query} onChange={(e) => setQuery(e.target.value)} className={`${field} w-full pl-9`} /></div><button className="rounded-md bg-accent px-3 text-xs text-white">Найти</button></form>
      <select aria-label="Язык фрагментов" value={language} onChange={(e) => { setLanguage(e.target.value); resetPage(); }} className={field}><option value="all">Все языки</option><option value="ru">Русский</option><option value="kk">Қазақша</option></select>
      <select aria-label="Раздел нормативной базы" value={section} onChange={(e) => { setSection(e.target.value); resetPage(); }} className={`${field} max-w-[180px]`}><option value="">Все разделы</option>{sections.map((s) => <option key={s}>{s}</option>)}</select>
      {filtered && <button onClick={reset} className="flex items-center gap-1 p-1 text-xs text-muted"><X size={14} />Сбросить</button>}
    </div>
    {docFilter !== null && <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2 text-xs">Документ: {index.documents[docFilter].code}<button aria-label="Убрать фильтр документа" onClick={() => { setDocFilter(null); resetPage(); }}><X size={14} /></button></div>}
    <nav aria-label="Панели атласа" className="flex shrink-0 border-b border-line lg:hidden">{([['topics', 'Темы'], ['graph', 'Граф'], ['results', 'Результаты']] as const).map(([id, label]) => <button key={id} aria-pressed={mobile === id} onClick={() => setMobile(id)} className={`flex-1 px-3 py-2 text-xs ${mobile === id ? 'bg-accent-soft text-accent' : 'text-muted'}`}>{label}</button>)}</nav>
    <div className="relative flex min-h-0 flex-1">
      <aside aria-label="Темы норм" className={`${mobile === 'topics' ? 'flex' : 'hidden'} min-h-0 w-full shrink-0 flex-col border-r border-line bg-panel lg:flex lg:w-[226px]`}>
        <div className="px-4 pb-3 pt-4"><p className="text-xs font-semibold">Исследуйте по темам</p><p className="mt-1 text-[11px] text-muted">Выберите несколько тем, чтобы найти их пересечение.</p></div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">{index.topics.map((t) => <button key={t.id} aria-pressed={topics.includes(t.id)} onClick={() => toggleTopic(t.id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-xs ${topics.includes(t.id) ? 'bg-accent-soft font-medium text-accent' : 'hover:bg-raised'}`}><span style={{ background: t.color }} className="h-2 w-2 shrink-0 rounded-full" /><span className="flex-1">{t.title}</span><span className="text-[10px] text-muted">{number(topicsCount[t.id] || 0)}</span></button>)}</div>
        <div className="space-y-2 border-t border-line p-3 text-[11px] text-muted"><label className="flex items-center gap-2"><input type="checkbox" checked={topicMode === 'all'} onChange={(e) => { setTopicMode(e.target.checked ? 'all' : 'any'); resetPage(); }} />Совпадают все выбранные темы</label><p>Связи определены по словам в тексте. Применимость требования проверяется отдельно.</p></div>
      </aside>
      <section aria-label="Облако связей" className={`${mobile === 'graph' ? 'block' : 'hidden'} min-w-0 flex-1 lg:block`}>
        <NormGraph index={index} visible={visible} filtered={filtered} topics={topics} selected={selected?.clause ?? null} onClause={selectClause} onDoc={(id) => { setDocFilter(id); resetPage(); }} onTopic={toggleTopic} />
      </section>
      {!selected && <aside aria-label="Результаты поиска" className={`${mobile === 'results' ? 'flex' : 'hidden'} min-h-0 w-full shrink-0 flex-col border-l border-line lg:flex lg:w-[300px] xl:w-[340px]`}>
        <div className="border-b border-line p-3"><div className="flex items-center gap-1">{([['documents', 'Документы'], ['clauses', 'Пункты']] as const).map(([id, label]) => <button key={id} aria-pressed={listing === id} onClick={() => { setMode(id); setPage(0); }} className={`rounded px-3 py-1.5 text-xs ${listing === id ? 'bg-accent-soft text-accent' : 'text-muted'}`}>{label}</button>)}</div><p className="mt-2 text-[11px] text-muted">{number(items.length)} {listing === 'documents' ? 'документов' : 'пунктов и фрагментов'}{topics.length ? ` · ${topics.map((id) => index.topics.find((t) => t.id === id)?.title).join(' + ')}` : ''}</p></div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {searching && <p role="status" className="p-4 text-xs text-muted">Ищу по полным текстам. Первый запрос загружает поисковый индекс…</p>}
          {searchError && <p role="alert" className="p-4 text-xs text-err">{searchError}<button className="ml-1 underline" onClick={submitSearch}>Повторить</button></p>}
          {!items.length && !searchPending && <div className="p-6 text-center text-sm"><Search size={25} className="mx-auto mb-3 text-muted" /><p>Совпадений нет</p><p className="mt-2 text-xs text-muted">Попробуйте корень слова или уберите часть фильтров.</p><button className="mt-4 text-xs text-accent" onClick={reset}>Показать всю базу</button></div>}
          {items.slice(activePage * 40, (activePage + 1) * 40).map((id) => {
            if (listing === 'documents') { const d = index.documents[id]; return <div key={d.id} className="border-b border-line p-4"><button onClick={() => { setDocFilter(id); resetPage(); }} className="w-full text-left"><p className="flex items-center gap-2 text-xs font-semibold text-accent"><BookOpen size={14} />{d.code}</p><p className="mt-2 text-xs leading-relaxed">{d.title}</p></button><div className="mt-2 flex items-center justify-between text-[10px] text-muted"><span>{d.pages || '—'} стр. · {d.year || 'год не указан'}</span><button onClick={() => setSelected({ doc: id, clause: null })} className="text-accent">Читать документ →</button></div></div>; }
            const c = index.clauses[id], d = index.documents[c.doc];
            return <button key={c.id} onClick={() => selectClause(id)} className="block w-full border-b border-line p-4 text-left hover:bg-panel"><div className="flex items-center justify-between gap-2 text-[10px] text-muted"><span>{d.code}</span><span className="shrink-0">стр. {c.page || '—'}</span></div><p className="mt-2 text-xs font-semibold">{c.label}</p><p className="mt-1 line-clamp-4 text-xs leading-relaxed text-muted">{c.excerpt}</p><span className="mt-2 inline-block text-[10px] text-accent">Открыть источник →</span></button>;
          })}
        </div>
        <div className="flex items-center justify-between border-t border-line p-3 text-xs"><button disabled={activePage === 0} onClick={() => setPage(activePage - 1)} className="p-1 disabled:opacity-30" aria-label="Предыдущие результаты">←</button><span>{activePage + 1} / {totalPages}</span><button disabled={activePage >= totalPages - 1} onClick={() => setPage(activePage + 1)} className="p-1 disabled:opacity-30" aria-label="Следующие результаты">→</button></div>
      </aside>}
      {selected && <SourcePanel key={`${selected.doc}:${selected.clause}`} session={session} docId={selected.doc} clauseId={selected.clause} onClose={() => setSelected(null)} onTopic={(id) => { setTopics([id]); setDocFilter(null); resetPage(); }} />}
    </div>
    <Dialog open={coverage} onOpenChange={setCoverage} title="Состав нормативной базы" description="Полнота, происхождение и ограничения корпуса" width="w-[680px]"><div className="space-y-4 text-xs leading-relaxed"><p>Загружены все {index.documents.length} Markdown-документов из реестра. Полные тексты сохранены, включая таблицы, русскую и казахскую части. Год в шифре не подтверждает дату последней редакции.</p><p>Нумерация, границы фрагментов, языки и тематические связи распознаны автоматически. Импорт не изменяет расчётные правила планировщика. Поиск помогает найти источник для проверки; он не является автоматическим заключением о соответствии.</p><p>Некоторые исходники не были преобразованы в Markdown. Перечень из локальной базы:</p><pre className="whitespace-pre-wrap break-words font-sans">{index.coverage}</pre></div></Dialog>
  </section>;
}

export function NormExplorer() {
  const [session, setSession] = useState<CorpusSession | null>(null);
  useEffect(() => {
    if (!session) return;
    let activity = Date.now();
    const touch = () => { activity = Date.now(); };
    window.addEventListener('pointerdown', touch); window.addEventListener('keydown', touch); window.addEventListener('wheel', touch, { passive: true });
    const timer = window.setInterval(() => { if (Date.now() - activity > 30 * 60_000) setSession(null); }, 60_000);
    return () => { clearInterval(timer); window.removeEventListener('pointerdown', touch); window.removeEventListener('keydown', touch); window.removeEventListener('wheel', touch); };
  }, [session]);
  return session ? <Explorer session={session} onLock={() => setSession(null)} /> : <Unlock onUnlock={setSession} />;
}
