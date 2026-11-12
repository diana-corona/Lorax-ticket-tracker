import { createWorker, OEM, PSM } from 'tesseract.js';
import { embeddedWorkerUrl } from './portable';
import { parseReceipt } from './receipt';

export async function readReceipt(photo: Blob, progress: (value: string) => void): Promise<string> {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let localWorker: string | undefined;
  try {
    progress('Preparando lectura…');
    if (__PORTABLE__) localWorker = embeddedWorkerUrl();
    worker = await createWorker('spa', OEM.LSTM_ONLY, {
      workerPath: localWorker ?? '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: __PORTABLE__ ? 'file:///mis-tickets-embedded' : '/ocr',
      cacheMethod: __PORTABLE__ ? 'none' : 'write',
      workerBlobURL: false,
      gzip: true,
      errorHandler: () => {},
      logger: message => {
        if (message.status === 'recognizing text') {
          progress(`Leyendo ticket… ${Math.round(message.progress * 100)} %`);
        }
      },
    });
    let best = { text: '', confidence: 0 };
    const score = (result: typeof best) => {
      const fields = parseReceipt(result.text);
      return result.confidence + (fields.amount ? 100 : 0) + (fields.date ? 50 : 0);
    };
    const bitmap = await createImageBitmap(photo);
    const orientations = bitmap.width > bitmap.height ? [1, 3, 0, 2] : [0, 2, 1, 3];
    bitmap.close();
    for (const quarterTurns of orientations) {
      if (quarterTurns) progress('Ajustando la orientación del ticket…');
      const image = quarterTurns ? await rotatePhoto(photo, quarterTurns) : photo;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      let candidate = (await worker.recognize(image)).data;
      let fields = parseReceipt(candidate.text);
      if (Boolean(fields.amount) !== Boolean(fields.date)) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
        const alternate = (await worker.recognize(image)).data;
        const extra = parseReceipt(alternate.text);
        // Keep the readable total; a second layout pass can recover a missing date.
        if (fields.amount && !fields.date && extra.date) {
          candidate = { ...candidate, text: `${candidate.text}\n${extra.date}` };
        } else if (!fields.amount && extra.amount) {
          candidate = { ...alternate, text: `${alternate.text}\n${fields.date ?? ''}` };
        }
        fields = parseReceipt(candidate.text);
      }
      if (score(candidate) > score(best)) best = candidate;
      if (fields.amount && fields.date) break;
    }

    async function rotatePhoto(photo: Blob, quarterTurns: number): Promise<Blob> {
      const url = URL.createObjectURL(photo);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        const sideways = quarterTurns % 2 !== 0;
        canvas.width = sideways ? image.naturalHeight : image.naturalWidth;
        canvas.height = sideways ? image.naturalWidth : image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No se pudo ajustar la foto.');
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate(quarterTurns * Math.PI / 2);
        context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('No se pudo ajustar la foto.')),
          'image/png',
        ));
      } finally { URL.revokeObjectURL(url); }
    }
    return best.text;
  } finally {
    await worker?.terminate();
    if (localWorker) URL.revokeObjectURL(localWorker);
  }
}
