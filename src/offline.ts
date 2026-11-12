export async function registerOffline(status: (message: string) => void, update: (apply: () => void) => void) {
  if (__PORTABLE__) {
    status('Lorax ticket tracker');
    return;
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status('No se pudo preparar Lorax ticket tracker para usar sin internet.');
    return;
  }
  if (import.meta.env.DEV) {
    status('Lorax ticket tracker · Vista de desarrollo');
    return;
  }
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) location.reload();
  });
  try {
    status('Preparando Lorax ticket tracker…');
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    const reportUpdate = () => update(() => {
      reloading = true;
      registration.waiting?.postMessage('SKIP_WAITING');
    });
    if (registration.waiting) reportUpdate();
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) reportUpdate();
        if (installing.state === 'redundant') status('No se pudo completar la preparación. Reabre con internet para reintentar.');
      });
    });
    await navigator.serviceWorker.ready;
    status('Lorax ticket tracker está listo');
  } catch {
    status('No se pudo completar la preparación. Reabre con internet para reintentar.');
  }
}
