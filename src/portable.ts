interface EmbeddedResources {
  worker: string;
  core: string;
  model: string;
}
export function embeddedWorkerUrl(): string {
  const resources: EmbeddedResources = JSON.parse(document.querySelector('#portable-ocr')!.textContent!);
  const modelFetch = `
    const localFetch = self.fetch.bind(self);
    self.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === 'file:///mis-tickets-embedded/spa.traineddata.gz') {
        const binary = atob(${JSON.stringify(resources.model)});
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return new Response(bytes);
      }
      if (url.startsWith('data:') || url.startsWith('blob:')) return localFetch(input, init);
      throw new Error('La versión portátil no permite peticiones de red.');
    };
  `;
  return URL.createObjectURL(new Blob([
    resources.core, '\n;self.TesseractCore = TesseractCore;\n',
    modelFetch, '\n', resources.worker,
  ], { type: 'application/javascript' }));
}
