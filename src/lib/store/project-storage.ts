import type { StateStorage } from 'zustand/middleware';
import { parseProject } from './project-file';

export interface StorageProblem { message: string; recovery: string | null }

/** Keep an unreadable original intact until the user explicitly resumes saving. */
export function createProjectStorage(
  getStorage: () => StateStorage,
  report: (problem: StorageProblem | null) => void,
) {
  let blocked = false;
  return {
    resume: () => { blocked = false; },
    storage: {
      async getItem(name: string) {
        let raw: string | null = null;
        try {
          raw = await getStorage().getItem(name);
          if (raw === null) return null;
          const saved = JSON.parse(raw);
          if (!saved || ![1, 2].includes(saved.version) || !saved.state) {
            throw new Error('Неизвестная версия автосохранения');
          }
          const state = parseProject({
            ...saved.state, app: 'bubble-diagram', version: saved.version,
          });
          return JSON.stringify({ state, version: 2 });
        } catch {
          blocked = true;
          report({
            message: raw === null
              ? 'Хранилище браузера недоступно. Сохраняйте проект в JSON.'
              : 'Автосохранение не удалось открыть. Исходные данные сохранены; автосохранение приостановлено.',
            recovery: raw,
          });
          return null;
        }
      },
      async setItem(name: string, value: string) {
        if (blocked) return;
        try {
          await getStorage().setItem(name, value);
          report(null);
        } catch {
          report({ message: 'Не удалось сохранить проект в браузере. Скачайте проект в JSON.', recovery: null });
        }
      },
      async removeItem(name: string) { await getStorage().removeItem(name); },
    } satisfies StateStorage,
  };
}
