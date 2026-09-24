import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { decryptCorpusFile, deriveCorpusKey, validateManifest } from '../src/lib/norms/crypto';
import type { CorpusIndex } from '../src/lib/norms/types';

async function main() {
  const args = process.argv.slice(2), arg = (name: string) => args[args.indexOf(name) + 1];
  if (!args.includes('--key-file') || !args.includes('--source')) throw new Error('Usage: tsx scripts/verify-corpus.ts --key-file <outside-repo> --source <_MD>');
  const root = resolve('public/corpus');
  const manifest = validateManifest(JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')));
  const key = await deriveCorpusKey(await readFile(resolve(arg('--key-file')), 'utf8'), manifest);
  const decrypt = async (file: string) => JSON.parse(await decryptCorpusFile(Uint8Array.from(await readFile(join(root, manifest.release, `${file}.bin`))).buffer, key, `${manifest.release}/${file}`));
  const index = await decrypt('index') as CorpusIndex;
  if (index.documents.length !== manifest.documents || index.clauses.length !== manifest.clauses) throw new Error('Count mismatch');
  let verified = 0;
  for (let id = 0; id < index.documents.length; id++) {
    const doc = index.documents[id];
    const content = (await decrypt(doc.id)).text as string;
    const source = (await readFile(join(resolve(arg('--source')), doc.path), 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (content !== source || createHash('sha256').update(content).digest('hex') !== doc.hash) throw new Error(`Source mismatch: ${doc.id}`);
    for (const c of index.clauses.filter((c) => c.doc === id)) if (c.start < 0 || c.end > content.length || c.end <= c.start || !c.id.endsWith(`:${c.start}`)) throw new Error(`Invalid range: ${c.id}`);
    verified++;
  }
  const search = await decrypt('search');
  if (search.vocabulary.length !== search.postings.length || search.vocabulary.some((w: string, i: number) => i > 0 && search.vocabulary[i - 1] >= w)) throw new Error('Invalid search dictionary');
  for (const list of search.postings as number[][]) for (const id of list) if (id < 0 || id >= index.clauses.length) throw new Error('Invalid search posting');
  console.log(JSON.stringify({ verifiedDocuments: verified, verifiedRanges: index.clauses.length, searchTerms: search.vocabulary.length, ciphertextMB: Math.round(manifest.bytes / 1024 / 1024) }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Verification failed'); process.exitCode = 1; });
