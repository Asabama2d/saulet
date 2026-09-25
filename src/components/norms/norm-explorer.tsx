'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileKey, LockKeyhole, Network } from 'lucide-react';
import { deriveCorpusKey, fetchCorpusFile, validateManifest } from '@/lib/norms/crypto';
import { applyDocumentTopics } from '@/lib/norms/search';
import type { CorpusIndex, CorpusManifest, CorpusSession } from '@/lib/norms/types';
import { NormWorkspace } from './norm-workspace';

const number = (n: number) => n.toLocaleString('ru');

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
        <h1 className="text-3xl font-semibold leading-tight">Нормы — по делу.</h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">Выберите тему, уточните контекст и откройте нужный пункт.</p>
        <div className="my-6 flex gap-7 border-y border-slate-700/60 py-4"><div><div className="text-xl font-medium">{manifest ? number(manifest.documents) : '…'}</div><div className="mt-1 text-xs text-slate-400">документов</div></div><div><div className="text-xl font-medium">{manifest ? number(manifest.clauses) : '…'}</div><div className="mt-1 text-xs text-slate-400">пунктов и фрагментов</div></div></div>
        <form onSubmit={(e) => { e.preventDefault(); void unlock(password); }} className="space-y-3">
          <label htmlFor="corpus-password" className="block text-xs font-medium text-slate-300">Пароль доступа</label>
          <input id="corpus-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-3 text-sm outline-none focus:border-teal-400" placeholder="Введите пароль или выберите файл доступа" />
          <button disabled={busy || !manifest || !password.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40">{busy ? 'Открываю базу…' : 'Открыть нормы'}<ArrowRight size={16} /></button>
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
  return session ? <NormWorkspace session={session} onLock={() => setSession(null)} /> : <Unlock onUnlock={setSession} />;
}
