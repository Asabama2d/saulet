import { fetchCorpusFile } from './crypto';
import { searchCorpus } from './search';
import type { CorpusDocument, CorpusManifest, CorpusSearchIndex } from './types';

let search: Promise<CorpusSearchIndex> | null = null;
let config: { key: CryptoKey; manifest: CorpusManifest; documents: CorpusDocument[]; clauseDocs: Uint16Array };
self.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  if (message.type === 'init') { config = message; return; }
  if (message.type !== 'search' || !config) return;
  try {
    search ??= fetchCorpusFile<CorpusSearchIndex>(config.key, config.manifest, 'search');
    const data = await search;
    const ids = [...searchCorpus(data, config.documents, config.clauseDocs, message.query)];
    self.postMessage({ id: message.id, ids });
  } catch {
    search = null;
    self.postMessage({ id: message.id, error: 'Поисковый индекс не загрузился. Проверьте соединение и повторите поиск.' });
  }
};
