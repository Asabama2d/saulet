/**
 * Отдаёт готовый файл пользователю.
 *
 * Ссылка отзывается с задержкой: браузер читает blob асинхронно, и при
 * мгновенном `revokeObjectURL` крупные файлы (растр диаграммы — единицы
 * мегабайт) просто не скачиваются.
 */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Имя файла с датой: выгрузки копятся, дата в имени экономит время. */
export function stamped(base: string, extension: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
