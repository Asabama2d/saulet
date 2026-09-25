import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { parseDocument } from '../scripts/corpus-parser';
import { CORPUS_ITERATIONS, decryptCorpusFile, deriveCorpusKey, validateManifest } from '../src/lib/norms/crypto';
import { applyDocumentTopics, filterClauses, searchClauses, searchTextAlternatives } from '../src/lib/norms/search';
import { relatedTopics } from '../src/lib/norms/focus';
import { TOPICS, topicMatches } from '../src/lib/norms/topics';
import type { CorpusIndex } from '../src/lib/norms/types';

const source = `---
code: "СП РК test-2026"
year: "2026"
title: "Учебный документ"
section: "СП РК"
source: "test.pdf"
pages: 3
---
# Проверочный текст
<!-- стр. 1 -->
### 4.1 Двери ....................................... 2
<!-- стр. 2 -->
### 4.1 Двери на путях эвакуации
Текст для тестирования сохранения ссылок. Дверной проём.

### 4.2 Помещения торгового центра
Тестовая таблица без нормативных значений.
| Помещение | Значение |
|---|---|
| Тест | — |
<!-- стр. 3 -->
### 4.3 Есік туралы қазақша мәтін
Қазақ тіліндегі мәтін. Ғимараттың есігі.
`;
const parsed = parseDocument(source, 'СП РК/test.md', 0);
const index: CorpusIndex = { version: 1, created: '', documents: [parsed.document], clauses: parsed.clauses, topics: TOPICS, coverage: '' };

test('context search combines bilingual alternatives and phrase words without matching document metadata', () => {
  const search = { vocabulary: ['двери', 'ені', 'отқа', 'төзімді', 'ширина'], postings: [[0], [1], [2, 3], [2], [4]] };
  // Includes a synonym appearing deep in the full text, regardless of excerpt.
  assert.deepEqual([...searchTextAlternatives(search, ['ширин', 'ені'])].sort(), [1, 4]);
  assert.deepEqual([...searchTextAlternatives(search, ['отқа төзімді'])], [2]);
  assert.equal(searchTextAlternatives(search, ['учебный']).size, 0, 'document title must not satisfy a text facet');
});

test('focus links only contain co-occurring topics from the current scope', () => {
  const visible = filterClauses(index, { topics: ['doors'], topicMode: 'all', language: 'ru', section: '', doc: null });
  const linked = relatedTopics(index, visible, ['doors'], 6);
  assert.ok(linked.some((t) => t.id === 'evacuation'));
  assert.ok(!linked.some((t) => t.id === 'mall' || t.id === 'doors'));
  assert.deepEqual(relatedTopics(index, [], ['doors']), []);
});

test('parser preserves full text, offsets, original page and distinct bilingual occurrences', () => {
  assert.equal(parsed.text, source);
  const clause = parsed.clauses.find((c) => c.label === 'п. 4.1')!;
  assert.ok(clause); assert.equal(clause.page, 2);
  assert.equal(clause.language, 'ru');
  assert.match(parsed.text.slice(clause.start, clause.end), /Двери на путях эвакуации/);
  assert.equal(parsed.clauses.filter((c) => c.label === 'п. 4.1').length, 1, 'TOC is not a numbered clause');
  assert.equal(parsed.clauses.find((c) => c.label === 'п. 4.3')?.language, 'kk');
  assert.match(parsed.text.slice(parsed.clauses.find((c) => c.label === 'п. 4.2')!.start), /\| Помещение \|/);
});

test('topic roots match word beginnings and intersections only include matching fragments', () => {
  assert.ok(topicMatches('Ширина дверного проема').includes('doors'));
  assert.ok(!topicMatches('Подтверждение').includes('doors'));
  const found = filterClauses(index, { topics: ['doors', 'evacuation'], topicMode: 'all', language: 'ru', section: '', doc: null });
  assert.equal(found.length, 1); assert.equal(index.clauses[found[0]].label, 'п. 4.1');
  assert.deepEqual(filterClauses(index, { topics: ['mall', 'doors'], topicMode: 'all', language: 'all', section: '', doc: null }), []);
});

test('dates are not misrepresented as clause numbers', () => {
  const result = parseDocument(source + '\n06.06.2006 № 511 Тестовая дата документа\n', 'test.md', 0);
  assert.ok(!result.clauses.some((c) => c.label === 'п. 06.06.2006'));
});

test('wrapped table-of-contents lines are labelled as contents, not requirements', () => {
  const result = parseDocument(source + '\n### 6.1 Требования из оглавления\n............................. 15\n', 'test.md', 0);
  assert.ok(!result.clauses.some((c) => c.label === 'п. 6.1'));
  assert.ok(result.clauses.some((c) => c.label.startsWith('Оглавление')));
});

test('full-text prefix search intersects terms; document metadata matches all of its clauses', () => {
  const search = { vocabulary: ['двери', 'дверных', 'торгового', 'эвакуации'], postings: [[1], [2], [3], [1, 4]] };
  assert.deepEqual([...searchClauses(search, index, 'двер эвакуа')], [1]);
  assert.equal(searchClauses(search, index, 'Учебный').size, index.clauses.length);
  assert.equal(searchClauses(search, index, 'нетсовпадения').size, 0);
});

test('building topics include clauses from a relevant document even without repeating its title', () => {
  const mallIndex = structuredClone(index);
  mallIndex.documents[0].topics = ['mall'];
  applyDocumentTopics(mallIndex);
  const found = filterClauses(mallIndex, { topics: ['mall', 'doors', 'evacuation'], topicMode: 'all', language: 'ru', section: '', doc: null });
  assert.equal(found.length, 1);
  assert.equal(mallIndex.clauses[found[0]].label, 'п. 4.1');
});

test('encrypted gzip round-trips through browser WebCrypto; wrong password, tampering and asset swapping fail', async () => {
  const password = 'test-only-password-never-used-for-the-corpus';
  const salt = randomBytes(16), iv = randomBytes(12);
  const manifest = { salt: salt.toString('base64'), iterations: CORPUS_ITERATIONS };
  const encryptionKey = pbkdf2Sync(password, salt, CORPUS_ITERATIONS, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv); cipher.setAAD(Buffer.from('release/index'));
  const encrypted = Buffer.concat([iv, cipher.update(gzipSync(JSON.stringify(index))), cipher.final(), cipher.getAuthTag()]);
  const data = Uint8Array.from(encrypted).buffer;
  const key = await deriveCorpusKey(password, manifest);
  assert.equal(key.extractable, false);
  assert.deepEqual(JSON.parse(await decryptCorpusFile(data, key, 'release/index')), index);
  await assert.rejects(decryptCorpusFile(data, await deriveCorpusKey('wrong password', manifest), 'release/index'));
  await assert.rejects(decryptCorpusFile(data, key, 'release/another-document'));
  const corrupt = data.slice(0); new Uint8Array(corrupt)[20] ^= 1;
  await assert.rejects(decryptCorpusFile(corrupt, key, 'release/index'));
});

test('manifest rejects unsupported derivation parameters and paths outside the corpus', () => {
  const valid = { version: 1, release: '2026-09-24-abcdef', salt: randomBytes(16).toString('base64'), iterations: CORPUS_ITERATIONS, documents: 1, clauses: 1, bytes: 20 };
  assert.equal(validateManifest(valid), valid);
  assert.throws(() => validateManifest({ ...valid, release: '../../somewhere' }));
  assert.throws(() => validateManifest({ ...valid, iterations: 1 }));
});
