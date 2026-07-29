/**
 * Растрирование готового SVG диаграммы.
 *
 * SVG собирается в `diagram-svg.ts` из данных графа, поэтому он лёгкий:
 * растрируется мгновенно и не вешает вкладку, в отличие от снимка DOM.
 */

/** Разрешение растра относительно листа SVG. */
const PNG_SCALE = 2;

export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('SVG диаграммы не удалось загрузить в растр'));
      element.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * PNG_SCALE);
    canvas.height = Math.round(height * PNG_SCALE);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось создать растровый контекст');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Растр не сформирован'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Габарит листа из заголовка SVG — нужен для размера растра. */
export function svgSize(svg: string): { width: number; height: number } {
  const width = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 1200);
  const height = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 800);
  return { width, height };
}
