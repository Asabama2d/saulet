import type { CorpusManifest } from './types';

export const CORPUS_ITERATIONS = 600_000;
export async function deriveCorpusKey(password: string, manifest: Pick<CorpusManifest, 'salt' | 'iterations'>) {
  const salt = Uint8Array.from(atob(manifest.salt), (char) => char.charCodeAt(0));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.trim()), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: manifest.iterations, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

export async function decryptCorpusFile(data: ArrayBuffer, key: CryptoKey, identity: string): Promise<string> {
  if (data.byteLength < 29) throw new Error('Повреждён файл базы');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12),
    additionalData: new TextEncoder().encode(identity), tagLength: 128 }, key, data.slice(12));
  return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

export async function fetchCorpusFile<T>(key: CryptoKey, manifest: CorpusManifest, file: string, signal?: AbortSignal): Promise<T> {
  const identity = `${manifest.release}/${file}`;
  const response = await fetch(`/corpus/${identity}.bin`, { signal });
  if (!response.ok) throw new Error(`Не удалось загрузить данные (${response.status}). Попробуйте ещё раз.`);
  return JSON.parse(await decryptCorpusFile(await response.arrayBuffer(), key, identity)) as T;
}

export function validateManifest(value: unknown): CorpusManifest {
  const m = value as Partial<CorpusManifest> | null;
  if (!m || m.version !== 1 || !/^[a-z0-9-]{8,64}$/.test(m.release || '') ||
    !/^[A-Za-z0-9+/]{22}==$/.test(m.salt || '') || m.iterations !== CORPUS_ITERATIONS ||
    !Number.isSafeInteger(m.documents) || !Number.isSafeInteger(m.clauses)) throw new Error('Версия базы не поддерживается. Обновите страницу.');
  return m as CorpusManifest;
}
