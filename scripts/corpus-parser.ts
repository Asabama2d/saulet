import { createHash } from 'node:crypto';
import { topicMatches } from '../src/lib/norms/topics';
import type { CorpusClause, CorpusDocument } from '../src/lib/norms/types';

export function parseDocument(raw: string, path: string, doc: number) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const header = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!header) throw new Error(`Отсутствует шапка документа: ${path}`);
  const meta: Record<string, string> = {};
  for (const line of header[1].split('\n')) {
    const field = line.match(/^(\w+):\s*(.*?)\s*$/);
    if (field) {
      try { meta[field[1]] = JSON.parse(field[2]); } catch { meta[field[1]] = field[2].replace(/^["']|["']$/g, ''); }
    }
  }
  const id = createHash('sha256').update(path).digest('hex').slice(0, 20);
  const document: CorpusDocument = {
    id, code: meta.code || path.split('/').at(-1)!.replace(/\.md$/, ''), year: String(meta.year || ''),
    title: meta.title || meta.code || path, section: meta.section || path.split('/')[0],
    source: meta.source || '', path, pages: Number(meta.pages) || 0,
    hash: createHash('sha256').update(text).digest('hex'), topics: topicMatches(meta.title || ''),
  };
  const clauses: CorpusClause[] = [];
  let start = header[0].length, offset = start, page = 0, startPage = 0;
  let label = 'Начало документа', kind: CorpusClause['kind'] = 'fragment';
  const flush = (end: number) => {
    const body = text.slice(start, end).replace(/<!--[\s\S]*?-->/g, '').replace(/[#|*_]/g, ' ').replace(/\s+/g, ' ').trim();
    if (body.length >= 12) {
      const kk = (body.match(/[әғқңөұүһі]/gi) || []).length;
      const ru = (body.match(/[а-яё]/gi) || []).length;
      clauses.push({ id: `${id}:${start}`, doc, label, kind, page: startPage, endPage: page, start, end,
        excerpt: body.slice(0, 360), topics: topicMatches(body), language: kk > ru * 0.012 ? 'kk' : ru > 20 ? 'ru' : 'other' });
    }
    start = end; startPage = page;
  };
  for (const line of text.slice(offset).split(/(?<=\n)/)) {
    const marker = line.match(/^<!-- стр\. (\d+) -->/);
    const clean = line.replace(/^#{1,6}\s+/, '').trim();
    const number = clean.match(/^((?:[А-ЯA-Z]\.)?\d+(?:\.\d+){1,6}|\d{1,3}\.)\s+\S/i);
    const table = clean.match(/^(Таблица|Кесте)\s+([А-ЯA-Z]?\.?\d+(?:\.\d+)*)/i);
    const heading = /^#{1,6}\s/.test(line) && !/\.{4}|…{2}/.test(clean);
    const isClause = number && !/^\d{1,2}\.\d{1,2}\.\d{4}\b/.test(clean) && !/\.{4}|…{2}/.test(clean);
    if (isClause || table || heading) {
      flush(offset);
      kind = table ? 'table' : isClause ? 'clause' : 'section';
      label = table ? `${table[1]} ${table[2]}` : isClause ? `п. ${number![1].replace(/\.$/, '')}` : clean.slice(0, 100);
    } else if ((marker && offset - start > 1200) || (line.trim() === '' && offset - start > 3000)) {
      flush(offset);
      kind = 'fragment'; label = `Фрагмент · стр. ${page || '—'}`;
    }
    if (marker) {
      page = Number(marker[1]);
      if (text.slice(start, offset).trim().length === 0) { startPage = page; if (kind === 'fragment') label = `Фрагмент · стр. ${page}`; }
    }
    offset += line.length;
  }
  flush(text.length);
  return { text, document, clauses };
}
