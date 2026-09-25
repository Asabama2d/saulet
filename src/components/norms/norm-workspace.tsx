'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Focus, MoreHorizontal, Network, Search, SlidersHorizontal, X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Menu, MenuItem } from '@/components/ui/menu';
import { filterClauses, rankClause } from '@/lib/norms/search';
import { FACETS, focusFacets, relatedTopics, type FacetId } from '@/lib/norms/focus';
import type { CorpusSession } from '@/lib/norms/types';
import { FocusGraph, type FocusNode } from './focus-graph';

const NormGraph = dynamic(() => import('./norm-graph').then((m) => m.NormGraph), { loading: () => <p role="status" className="p-6 text-muted">Открываю общую карту…</p> });
const SourcePanel = dynamic(() => import('./source-panel').then((m) => m.SourcePanel), {
  loading: () => <aside aria-label="Текст нормы" className="norm-source-enter absolute inset-y-0 right-0 z-20 w-full border-l border-line bg-bg p-6 shadow-2xl md:w-[520px]"><p role="status" className="text-sm text-muted">Открываю источник…</p></aside>,
});
const number = (n: number) => n.toLocaleString('ru');
const field = 'w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm';

export function NormWorkspace({ session, onLock }: { session: CorpusSession; onLock: () => void }) {
  const { index } = session;
  const [topics, setTopics] = useState<string[]>([]);
  const [facet, setFacet] = useState<FacetId | null>(null);
  const [topicMode, setTopicMode] = useState<'any' | 'all'>('all');
  const [language, setLanguage] = useState('all');
  const [section, setSection] = useState('');
  const [docFilter, setDocFilter] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [result, setResult] = useState<{ signature: string; ids: Set<number> } | null>(null);
  const [searchError, setSearchError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<{ doc: number; clause: number | null } | null>(null);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<'focus' | 'overview'>('focus');
  const [resultsOpen, setResultsOpen] = useState(false);
  const [listing, setListing] = useState<'clauses' | 'documents'>('clauses');
  const [dialog, setDialog] = useState<'topics' | 'filters' | 'coverage' | null>(null);
  const [topicQuery, setTopicQuery] = useState('');
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const signature = JSON.stringify([searchQuery, facet, retry]);
  const needsSearch = !!searchQuery || !!facet;
  const pending = needsSearch && result?.signature !== signature && !searchError;
  const sections = useMemo(() => [...new Set(index.documents.map((d) => d.section))], [index]);

  useEffect(() => {
    const w = new Worker(new URL('../../lib/norms/search.worker.ts', import.meta.url));
    worker.current = w;
    w.postMessage({ type: 'init', key: session.key, manifest: session.manifest, documents: index.documents, clauseDocs: Uint16Array.from(index.clauses, (c) => c.doc) });
    return () => { w.terminate(); worker.current = null; };
  }, [session, index]);
  useEffect(() => {
    const w = worker.current;
    const id = ++requestId.current;
    if (!w || !needsSearch) return;
    w.onmessage = (event) => {
      if (event.data.id !== requestId.current) return;
      if (event.data.error) setSearchError(event.data.error);
      else { setSearchError(''); setResult({ signature, ids: new Set(event.data.ids) }); }
    };
    w.onerror = () => { if (id === requestId.current) setSearchError('Поиск не запустился. Закройте доступ и откройте базу снова.'); };
    w.postMessage({ type: 'search', id, query: searchQuery, facet });
  }, [signature, needsSearch, searchQuery, facet]);

  const visible = useMemo(() => filterClauses(index, { topics, topicMode, language, section, doc: docFilter,
    matches: needsSearch ? result?.signature === signature ? result.ids : new Set<number>() : undefined }),
  [index, topics, topicMode, language, section, docFilter, needsSearch, result, signature]);
  const filtered = topics.length > 0 || needsSearch || language !== 'all' || !!section || docFilter !== null;
  const documentIds = useMemo(() => filtered ? [...new Set(visible.map((id) => index.clauses[id].doc))] : index.documents.map((_, id) => id), [filtered, visible, index]);
  const ranked = useMemo(() => resultsOpen && listing === 'clauses' ? [...visible].sort((a, b) => rankClause(index, b, topics) - rankClause(index, a, topics)) : [], [resultsOpen, listing, visible, index, topics]);
  const items = listing === 'documents' ? documentIds : ranked;
  const totalPages = Math.max(1, Math.ceil(items.length / 12));
  const activePage = Math.min(page, totalPages - 1);
  const currentTopic = topics.at(-1);
  const title = (id: string) => index.topics.find((t) => t.id === id)?.title ?? id;
  // Keep navigation present while the encrypted full-text index is opening.
  const contextVisible = useMemo(() => filterClauses(index, { topics, topicMode, language, section, doc: docFilter }), [index, topics, topicMode, language, section, docFilter]);
  const neighbors = useMemo<FocusNode[]>(() => {
    if (!currentTopic) return index.topics.slice(0, 6).map((t) => ({ id: `topic:${t.id}`, label: t.title, kind: 'topic' }));
    const facets = focusFacets(currentTopic).filter((id) => id !== facet).map((id) => ({ id: `facet:${id}`, label: FACETS[id].title, detail: 'Уточнить', kind: 'facet' as const }));
    const linked = relatedTopics(index, contextVisible, topics, 6 - facets.length).map((t) => ({ id: `topic:${t.id}`, label: t.title, detail: 'Связанная тема', kind: 'topic' as const }));
    return [...facets, ...linked];
  }, [index, topics, currentTopic, facet, contextVisible]);
  const center = useMemo<FocusNode>(() => ({
    id: facet ? `facet:${facet}` : currentTopic ? `topic:${currentTopic}` : 'home',
    label: facet ? FACETS[facet].title : index.topics.find((t) => t.id === currentTopic)?.title ?? 'Выберите тему',
    detail: facet || currentTopic ? 'Показать пункты' : 'С чего начнём?', kind: facet ? 'facet' : 'topic',
  }), [facet, currentTopic, index]);

  function resetPage() { setPage(0); setSelected(null); }
  function changeContext(nextTopics: string[], nextFacet: FacetId | null = null) {
    setTopics(nextTopics); setFacet(nextFacet); setSearchError(''); resetPage(); setResultsOpen(false); setListing('clauses');
  }
  function selectNode(node: FocusNode) {
    if (node.kind === 'facet') changeContext(topics, node.id.slice(6) as FacetId);
    else changeContext([...topics, node.id.slice(6)]);
  }
  function reset() {
    changeContext([]); setLanguage('all'); setSection(''); setDocFilter(null); setQuery(''); setSearchQuery(''); setTopicMode('all');
  }
  function showResults() { if (!filtered) setListing('documents'); setResultsOpen(true); requestAnimationFrame(() => resultsHeading.current?.scrollIntoView({ block: 'nearest' })); }
  function submitSearch() { setSearchQuery(query.trim()); setSearchError(''); setRetry((r) => r + 1); resetPage(); setResultsOpen(true); setListing('clauses'); setView('focus'); }
  function selectDocument(id: number) { setDocFilter(id); resetPage(); setResultsOpen(true); setListing('clauses'); setView('focus'); }

  return <section aria-label="Нормативная база" className="norm-workspace flex h-full min-h-0 flex-col bg-bg">
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3 md:px-6">
      <form className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}>
        <Search size={17} className="shrink-0 text-muted" aria-hidden="true" />
        <input aria-label="Поиск по полным текстам" placeholder="Найти в нормах…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
        <button aria-label="Найти" className="norm-icon-button"><ArrowRight size={17} /></button>
      </form>
      <button onClick={() => setDialog('filters')} className="norm-icon-button" aria-label="Фильтры" title="Фильтры"><SlidersHorizontal size={17} />{(language !== 'all' || section || topicMode !== 'all') && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}</button>
      <div className="ml-auto flex items-center rounded-lg bg-panel p-1" aria-label="Вид норм">{([['focus', 'Фокус', Focus], ['overview', 'Обзор', Network]] as const).map(([id, label, Icon]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)} className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs ${view === id ? 'bg-bg text-fg shadow-sm' : 'text-muted'}`}><Icon size={14} />{label}</button>)}</div>
      <Menu trigger={({ open, toggle }) => <button className="norm-icon-button" aria-label="Меню базы" aria-expanded={open} onClick={toggle}><MoreHorizontal size={19} /></button>}>{(close) => <>
        <MenuItem onSelect={() => { setDialog('topics'); close(); }}>Все темы</MenuItem>
        <MenuItem onSelect={() => { setListing('documents'); setResultsOpen(true); setView('focus'); close(); }}>Документы</MenuItem>
        <MenuItem onSelect={() => { setDialog('coverage'); close(); }}>О базе и источниках</MenuItem>
        <MenuItem onSelect={() => { close(); onLock(); }}>Закрыть доступ</MenuItem>
      </>}</Menu>
    </header>
    <div className="relative flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-5 pb-2 pt-5 text-xs md:px-8">
          <button className="text-muted hover:text-fg" onClick={reset}>Все нормы</button>
          {topics.map((id, i) => <span key={id} className="flex items-center gap-2"><ChevronRight size={12} className="text-muted" /><button aria-current={!facet && i === topics.length - 1 ? 'location' : undefined} onClick={() => changeContext(topics.slice(0, i + 1))}>{title(id)}</button></span>)}
          {facet && <span className="flex items-center gap-2"><ChevronRight size={12} className="text-muted" /><span aria-current="location">{FACETS[facet].title}</span><button aria-label="Убрать уточнение" onClick={() => changeContext(topics)}><X size={13} /></button></span>}
          {searchQuery && <button className="norm-filter-chip" onClick={() => { setQuery(''); setSearchQuery(''); setSearchError(''); resetPage(); }}>«{searchQuery}»<X size={12} /></button>}
          {docFilter !== null && <button className="norm-filter-chip" onClick={() => { setDocFilter(null); resetPage(); }}>{index.documents[docFilter].code}<X size={12} /></button>}
          {language !== 'all' && <button className="norm-filter-chip" onClick={() => { setLanguage('all'); resetPage(); }}>{language === 'ru' ? 'Русский' : 'Қазақша'}<X size={12} /></button>}
          {section && <button className="norm-filter-chip" onClick={() => { setSection(''); resetPage(); }}>{section}<X size={12} /></button>}
          {topicMode === 'any' && topics.length > 1 && <span className="text-muted">Любая из тем</span>}
          <button className="ml-auto rounded-lg px-3 py-2 text-muted hover:bg-panel" onClick={() => setDialog('topics')}>Все темы</button>
        </div>
        {view === 'focus' ? <div className="mx-auto max-w-5xl px-3 pb-6 md:px-8">
          <FocusGraph center={center} neighbors={neighbors} onSelect={selectNode} onCenter={() => currentTopic || facet ? showResults() : setDialog('topics')} busy={pending} />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 px-3 pb-6">
            {topics.length > 0 && <button className="flex items-center gap-1.5 text-xs text-muted" onClick={() => changeContext(facet ? topics : topics.slice(0, -1))}><ArrowLeft size={14} />Назад</button>}
            <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white" onClick={showResults}>{resultsOpen ? 'К результатам' : currentTopic || filtered ? 'Показать пункты' : 'Открыть документы'}<span className="ml-2" aria-hidden="true">→</span></button>
            {filtered && !pending && !searchError && <span className="text-xs text-muted">{number(visible.length)} фрагментов</span>}
          </div>
          {pending && <p role="status" className="pb-5 text-center text-xs text-muted">Ищу по полным текстам… При первом запросе загружается индекс.</p>}
          {searchError && <p role="alert" className="pb-5 text-center text-xs text-err">{searchError} <button className="underline" onClick={() => { setSearchError(''); setRetry((r) => r + 1); }}>Повторить</button></p>}
          {resultsOpen && <section aria-label="Результаты поиска" className="norm-reveal mx-auto max-w-3xl border-t border-line pt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 ref={resultsHeading} className="text-base font-medium">{listing === 'documents' ? 'Документы' : 'Пункты и фрагменты'}</h2><div className="flex items-center gap-3 text-xs"><button onClick={() => { setListing(listing === 'clauses' ? 'documents' : 'clauses'); setPage(0); }} className="text-muted underline decoration-dotted underline-offset-4">{listing === 'clauses' ? 'По документам' : 'По пунктам'}</button><button aria-label="Свернуть результаты" onClick={() => setResultsOpen(false)} className="norm-icon-button"><X size={15} /></button></div></div>
            {!pending && !searchError && !items.length && <p className="py-8 text-sm text-muted">Совпадений нет. Уберите уточнение или часть фильтров.</p>}
            {!pending && !searchError && items.slice(activePage * 12, (activePage + 1) * 12).map((id) => {
              if (listing === 'documents') { const d = index.documents[id]; return <article key={d.id} className="border-b border-line py-5"><button onClick={() => selectDocument(id)} className="text-left"><p className="flex items-center gap-2 text-xs text-muted"><BookOpen size={14} />{d.code}</p><h3 className="mt-2 text-sm font-medium">{d.title}</h3></button><button onClick={() => setSelected({ doc: id, clause: null })} className="mt-3 block text-xs text-accent">Читать документ →</button></article>; }
              const c = index.clauses[id], d = index.documents[c.doc];
              return <button key={c.id} onClick={() => setSelected({ doc: c.doc, clause: id })} className="block w-full border-b border-line py-5 text-left hover:text-accent"><span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"><span>{d.code}</span><span>{c.label}</span><span>стр. {c.page || '—'}</span></span><p className="mt-2 line-clamp-3 text-sm leading-relaxed">{c.excerpt}</p><span className="mt-2 inline-flex items-center gap-1 text-xs text-accent">Открыть источник<ChevronRight size={12} /></span></button>;
            })}
            {!pending && !searchError && items.length > 0 && <nav aria-label="Страницы результатов" className="mt-5 flex items-center justify-between text-xs text-muted"><button aria-label="Предыдущие результаты" className="norm-icon-button" disabled={activePage === 0} onClick={() => { setPage(activePage - 1); resultsHeading.current?.scrollIntoView({ block: 'start' }); }}><ArrowLeft size={16} /></button><span>{activePage + 1} / {totalPages}</span><button aria-label="Следующие результаты" className="norm-icon-button" disabled={activePage >= totalPages - 1} onClick={() => { setPage(activePage + 1); resultsHeading.current?.scrollIntoView({ block: 'start' }); }}><ArrowRight size={16} /></button></nav>}
          </section>}
        </div> : <div className="m-4 h-[65vh] min-h-[360px] overflow-hidden rounded-2xl md:m-6"><NormGraph index={index} visible={visible} filtered={filtered} topics={topics} selected={selected?.clause ?? null} onClause={(id) => setSelected({ doc: index.clauses[id].doc, clause: id })} onDoc={selectDocument} onTopic={(id) => { changeContext(topics.includes(id) ? topics.filter((t) => t !== id) : [...topics, id]); setView('focus'); }} /></div>}
      </div>
      {selected && <SourcePanel key={`${selected.doc}:${selected.clause}`} session={session} docId={selected.doc} clauseId={selected.clause} onClose={() => setSelected(null)} onTopic={(id) => { setDocFilter(null); changeContext([id]); setView('focus'); }} />}
    </div>
    <Dialog open={dialog === 'topics'} onOpenChange={(open) => !open && setDialog(null)} title="Выберите тему" description="От темы — к уточнениям и источникам" width="w-[580px]">
      <input aria-label="Найти тему" placeholder="Название темы…" className={field} value={topicQuery} onChange={(e) => setTopicQuery(e.target.value)} />
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">{index.topics.filter((t) => t.title.toLocaleLowerCase('ru').includes(topicQuery.toLocaleLowerCase('ru'))).map((t) => <button className="rounded-lg px-3 py-3 text-left text-sm hover:bg-panel" key={t.id} onClick={() => { changeContext([t.id]); setDocFilter(null); setDialog(null); setView('focus'); }}>{t.title}</button>)}</div>
    </Dialog>
    <Dialog open={dialog === 'filters'} onOpenChange={(open) => !open && setDialog(null)} title="Фильтры" description="Уточните область поиска">
      <label className="space-y-2 text-xs">Язык<select aria-label="Язык фрагментов" className={field} value={language} onChange={(e) => { setLanguage(e.target.value); resetPage(); }}><option value="all">Все языки</option><option value="ru">Русский</option><option value="kk">Қазақша</option></select></label>
      <label className="space-y-2 text-xs">Раздел<select aria-label="Раздел нормативной базы" className={field} value={section} onChange={(e) => { setSection(e.target.value); resetPage(); }}><option value="">Все разделы</option>{sections.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="my-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={topicMode === 'all'} onChange={(e) => { setTopicMode(e.target.checked ? 'all' : 'any'); resetPage(); }} />Совпадают все выбранные темы</label>
      <button className="rounded-lg bg-accent px-4 py-2.5 text-sm text-white" onClick={() => setDialog(null)}>Готово</button>
    </Dialog>
    <Dialog open={dialog === 'coverage'} onOpenChange={(open) => !open && setDialog(null)} title="О базе и источниках" description="Происхождение и ограничения" width="w-[640px]">
      <div className="space-y-4 text-sm leading-relaxed"><p>{number(index.documents.length)} документов · {number(index.clauses.length)} пунктов и фрагментов · загружено {index.created.slice(0, 10)}.</p><p>Связи определены автоматически по тексту и тематике документа. Уточнения ищут слова и их формы в полном тексте, включая русскую и казахскую части. Совпадение помогает найти источник, но не подтверждает применимость нормы.</p><p>Полные тексты и таблицы сохранены. Нумерация и страницы распознаны автоматически; актуальность редакций не проверена. Атлас не изменяет расчётные правила планировщика.</p><details><summary className="cursor-pointer">Полнота преобразования исходной базы</summary><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-xs">{index.coverage}</pre></details></div>
    </Dialog>
  </section>;
}
