import playerCoachSource from '../../features/player-coach.js?raw';
import gameEngineSource from '../../game/engine.js?raw';
import adminSource from '../../admin/admin.js?raw';

const runtimeSources = [playerCoachSource, gameEngineSource, adminSource];

function loadClassicScript(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(
      new Blob([source], { type: 'text/javascript' }),
    );
    const script = document.createElement('script');
    script.src = objectUrl;
    script.async = false;
    script.dataset.diqRuntime = 'legacy-compatibility';
    script.addEventListener(
      'load',
      () => {
        URL.revokeObjectURL(objectUrl);
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Unable to load the Diamond IQ compatibility runtime.'));
      },
      { once: true },
    );
    document.body.appendChild(script);
  });
}

export async function loadLegacyRuntime(): Promise<void> {
  for (const source of runtimeSources) {
    await loadClassicScript(source);
  }
  document.documentElement.dataset.diqRuntime = 'loaded';
}
