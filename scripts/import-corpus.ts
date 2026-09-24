import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, relative, join, isAbsolute } from 'node:path';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { parseDocument } from './corpus-parser';
import { TOPICS, normalizeSearch } from '../src/lib/norms/topics';
import { CORPUS_ITERATIONS } from '../src/lib/norms/crypto';
import type { CorpusIndex, CorpusSearchIndex } from '../src/lib/norms/types';

async function main() {
const args = process.argv.slice(2);
const arg = (name: string) => args[args.indexOf(name) + 1];
if (!args.includes('--source') || !args.includes('--key-file')) throw new Error('Usage: npm run corpus:import -- --source <_MD> --key-file <outside-repo.saulet-key> [--output public/corpus]');
const root = resolve(arg('--source'));
const keyFile = resolve(arg('--key-file'));
const output = resolve(args.includes('--output') ? arg('--output') : 'public/corpus');
const keyRelative = relative(process.cwd(), keyFile);
if (!keyRelative.startsWith('..') && !isAbsolute(keyRelative)) throw new Error('Ключ должен храниться вне репозитория');
const allowed = new Set(['СП РК', 'СН РК', 'СНиП РК', 'МСН, ОНТП, НТП РК', 'РДС, УСН РК', 'СанПин РК', 'Тех. регламент РК', 'Правила РК', 'Приказы РК', 'ГОСТ, СТ РК', '# Методички, пособия, рекомендации']);
async function walk(dir: string): Promise<string[]> {
  const items = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(items.filter((e) => !e.isSymbolicLink()).map(async (e) => e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []))).flat();
}
const files = (await Promise.all([...allowed].map((section) => walk(join(root, section))))).flat().sort();
const registry = await readFile(join(root, 'INDEX.md'), 'utf8');
const expected = Number(registry.match(/Документов:\s*\*\*(\d+)/)?.[1]);
if (files.length !== expected) throw new Error(`Реестр: ${expected}, найдено: ${files.length}. Обновите INDEX.md или проверьте состав.`);
let password: string;
try { password = (await readFile(keyFile, 'utf8')).trim(); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  password = randomBytes(24).toString('base64url');
  await mkdir(resolve(keyFile, '..'), { recursive: true });
  await writeFile(keyFile, `${password}\n`, { flag: 'wx', mode: 0o600 });
}
if (password.length < 24) throw new Error('Для публичного шифрованного архива нужен случайный ключ длиной не менее 24 символов');
const salt = randomBytes(16);
const key = pbkdf2Sync(password, salt, CORPUS_ITERATIONS, 32, 'sha256');
password = '';
const release = `${new Date().toISOString().slice(0, 10)}-${randomBytes(6).toString('hex')}`;
const destination = join(output, release);
await mkdir(destination, { recursive: true });
let bytes = 0;
async function encrypt(file: string, value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${release}/${file}`));
  const plain = gzipSync(JSON.stringify(value), { level: 9 });
  const encrypted = Buffer.concat([iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  await writeFile(join(destination, `${file}.bin`), encrypted); bytes += encrypted.length;
}
const index: CorpusIndex = { version: 1, created: new Date().toISOString(), documents: [], clauses: [], topics: TOPICS,
  coverage: await readFile(join(root, '_НЕ СКОНВЕРТИРОВАНО.md'), 'utf8') };
const postings = new Map<string, number[]>();
for (const file of files) {
  const parsed = parseDocument(await readFile(file, 'utf8'), relative(root, file).replaceAll('\\', '/'), index.documents.length);
  index.documents.push(parsed.document);
  for (const clause of parsed.clauses) {
    const clauseIndex = index.clauses.length;
    const tokens = new Set(normalizeSearch(parsed.text.slice(clause.start, clause.end).replace(/<!--[\s\S]*?-->/g, '')).split(/\s+/).filter((word) => word.length > 1 && word.length <= 60));
    for (const token of tokens) {
      let ids = postings.get(token);
      if (!ids) { ids = []; postings.set(token, ids); }
      ids.push(clauseIndex);
    }
    index.clauses.push(clause);
  }
  await encrypt(parsed.document.id, { text: parsed.text });
  if (index.documents.length % 100 === 0) console.log(`${index.documents.length}/${files.length} documents, ${index.clauses.length} fragments`);
}
await encrypt('index', index);
const vocabulary = [...postings.keys()].sort();
const search: CorpusSearchIndex = { vocabulary, postings: vocabulary.map((word) => postings.get(word)!) };
await encrypt('search', search);
await writeFile(join(output, 'manifest.json'), JSON.stringify({ version: 1, release, salt: salt.toString('base64'), iterations: CORPUS_ITERATIONS,
  documents: index.documents.length, clauses: index.clauses.length, bytes }, null, 2));
key.fill(0);
console.log(JSON.stringify({ release, documents: index.documents.length, clauses: index.clauses.length, words: vocabulary.length, encryptedMB: Math.round(bytes / 1024 / 1024),
  indexMB: Math.round((await stat(join(destination, 'index.bin'))).size / 1024 / 1024), searchMB: Math.round((await stat(join(destination, 'search.bin'))).size / 1024 / 1024),
  topics: Object.fromEntries(TOPICS.map((t) => [t.title, index.clauses.filter((c) => c.topics.includes(t.id)).length])) }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Import failed'); process.exitCode = 1; });
