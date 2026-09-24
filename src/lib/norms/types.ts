export interface NormTopic { id: string; title: string; roots: string[]; color: string }
export interface CorpusDocument {
  id: string; code: string; year: string; title: string; section: string;
  source: string; path: string; pages: number; hash: string; topics: string[];
}
export interface CorpusClause {
  id: string; doc: number; label: string; kind: 'clause' | 'table' | 'section' | 'fragment';
  page: number; endPage: number; start: number; end: number;
  excerpt: string; topics: string[]; language: 'ru' | 'kk' | 'other';
}
export interface CorpusIndex {
  version: 1; created: string; documents: CorpusDocument[]; clauses: CorpusClause[];
  topics: NormTopic[]; coverage: string;
}
export interface CorpusManifest {
  version: 1; release: string; salt: string; iterations: number;
  documents: number; clauses: number; bytes: number;
}
export interface CorpusSearchIndex { vocabulary: string[]; postings: number[][] }
export interface CorpusSession { key: CryptoKey; manifest: CorpusManifest; index: CorpusIndex }
