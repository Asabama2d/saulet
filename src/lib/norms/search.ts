import { markContents, normalizeSearch } from './topics';
import type { CorpusDocument, CorpusIndex, CorpusSearchIndex } from './types';

function lowerBound(words: string[], query: string) {
  let low = 0, high = words.length;
  while (low < high) { const mid = (low + high) >>> 1; if (words[mid] < query) low = mid + 1; else high = mid; }
  return low;
}

/** AND between query tokens, prefix matching for Russian inflections. */
export function searchClauses(search: CorpusSearchIndex, index: CorpusIndex, query: string): Set<number> {
  return searchCorpus(search, index.documents, index.clauses.map((c) => c.doc), query);
}

export function searchCorpus(search: CorpusSearchIndex, documents: CorpusDocument[], clauseDocs: number[] | Uint16Array, query: string): Set<number> {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return new Set(Array.from(clauseDocs, (_, i) => i));
  const tokenSets = terms.map((term) => {
    const found = new Set<number>();
    for (let w = lowerBound(search.vocabulary, term); w < search.vocabulary.length && search.vocabulary[w].startsWith(term); w++) {
      for (const c of search.postings[w]) found.add(c);
    }
    const docs = new Set(documents.flatMap((doc, i) => normalizeSearch(`${doc.code} ${doc.title}`).includes(term) ? [i] : []));
    if (docs.size) clauseDocs.forEach((doc, i) => { if (docs.has(doc)) found.add(i); });
    return found;
  }).sort((a, b) => a.size - b.size);
  return new Set([...tokenSets[0]].filter((id) => tokenSets.every((set) => set.has(id))));
}

/** OR between alternative phrases; AND between words within each phrase. */
export function searchTextAlternatives(search: CorpusSearchIndex, alternatives: readonly string[]): Set<number> {
  const result = new Set<number>();
  for (const alternative of alternatives) {
    // Empty document metadata means a facet cannot match every clause merely
    // because its document title contains the word.
    for (const id of searchCorpus(search, [], [], alternative)) result.add(id);
  }
  return result;
}

export interface CorpusFilter { topics: string[]; topicMode: 'any' | 'all'; language: string; section: string; doc: number | null; matches?: Set<number> }
export function applyDocumentTopics(index: CorpusIndex): CorpusIndex {
  const context = index.documents.map((doc) => doc.topics.filter((t) => ['mall', 'schools', 'clinics', 'food'].includes(t)));
  for (const clause of index.clauses) {
    markContents(clause);
    if (context[clause.doc].length) clause.topics = [...new Set([...clause.topics, ...context[clause.doc]])];
  }
  return index;
}

export function rankClause(index: CorpusIndex, id: number, topics: string[] = []): number {
  const clause = index.clauses[id], section = index.documents[clause.doc].section;
  const context = topics.filter((t) => index.documents[clause.doc].topics.includes(t)).length;
  return context * 20 + (clause.kind === 'clause' ? 8 : clause.kind === 'table' ? 4 : 0) + (clause.language === 'ru' ? 3 : 0) + (/^(?:СП|СН|Тех\.|СанПин)/.test(section) ? 5 : 0);
}
export function filterClauses(index: CorpusIndex, filter: CorpusFilter): number[] {
  const result: number[] = [];
  index.clauses.forEach((clause, i) => {
    if (filter.matches && !filter.matches.has(i)) return;
    if (filter.doc !== null && clause.doc !== filter.doc) return;
    if (filter.language !== 'all' && clause.language !== filter.language) return;
    if (filter.section && index.documents[clause.doc].section !== filter.section) return;
    if (filter.topics.length) {
      const has = (topic: string) => clause.topics.includes(topic);
      if (!(filter.topicMode === 'all' ? filter.topics.every(has) : filter.topics.some(has))) return;
    }
    result.push(i);
  });
  return result;
}

export function citation(index: CorpusIndex, clauseId: number): string {
  const c = index.clauses[clauseId], d = index.documents[c.doc];
  return `${d.code} «${d.title}» · ${c.label} · стр. ${c.page || 'не указана'}${c.endPage > c.page ? `–${c.endPage}` : ''} · ${d.source || d.path}`;
}
