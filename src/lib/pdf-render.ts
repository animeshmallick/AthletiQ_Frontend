/**
 * Renders a PDF into canvases with pdf.js. Loaded on demand (it's large), so phones that never
 * open a PDF never download it. Works the same in browsers, the iPhone home-screen app and the
 * Android app, none of which can reliably show a PDF in a new tab.
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPdf {
  pages: number;
  destroy: () => void;
}

/** Draws every page of the PDF into `container`, each `width` CSS pixels wide. */
export async function renderPdf(
  data: ArrayBuffer,
  container: HTMLElement,
  width: number,
  isCancelled: () => boolean,
): Promise<RenderedPdf> {
  const task = getDocument({ data });
  const doc = await task.promise;
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  container.replaceChildren();
  for (let n = 1; n <= doc.numPages && !isCancelled(); n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
    canvas.className = 'mx-auto block rounded-md bg-white shadow-e2';
    canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
    canvas.setAttribute('role', 'img');
    container.appendChild(canvas);
    const context = canvas.getContext('2d');
    if (context) await page.render({ canvas, canvasContext: context, viewport }).promise;
  }
  return { pages: doc.numPages, destroy: () => void task.destroy() };
}
