import * as situationAuthoring from '../plays/authoring.js';
import * as playAnimation from '../plays/animation.js';
import { fromSituation, newBoard } from '../plays/board.js';
import * as tokenPresentation from '../plays/token-presentation.js';
import { throwRoute, paintThrowFrame } from '../plays/throws.js';
import * as fieldGeometry from '../plays/field.js';
import { BALL_LOCATIONS, suggestSituationName, audienceLabel, normalizeAudience } from '../domain/situation-identity';
import { openCoachReview } from '../review/coach-review.js';
import playerCoachSource from '../../features/player-coach.js?raw';
import gameEngineSource from '../../game/engine.js?raw';
import adminSource from '../../admin/admin-tools.js?raw';

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
  Object.assign(window, { _diqSituationAuthoring: situationAuthoring, _diqPlayAnimation: playAnimation, _diqFromSituation: fromSituation, _diqNewBoard: newBoard, _diqPaintThrowFrame: paintThrowFrame, _diqFieldGeometry: fieldGeometry, _diqTokenPresentation: tokenPresentation, _diqThrowRoute: throwRoute, _diqOpenCoachReview: openCoachReview, _diqBallLocations: BALL_LOCATIONS, _diqSuggestSituationName: suggestSituationName, _diqAudienceLabel: audienceLabel, _diqNormalizeAudience: normalizeAudience });
  for (const source of runtimeSources) {
    await loadClassicScript(source);
  }
  document.documentElement.dataset.diqRuntime = 'loaded';
  await window.__DIQ_READY__;
  window._diqRestoreAuthoringDraft?.();
}
