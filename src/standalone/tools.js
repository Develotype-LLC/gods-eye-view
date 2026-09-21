import { createAssetDirectorySource } from '../director/packs/source.js';
import { createApplicationTools } from '../app/tools.js';
import { mountLandmanWorkspace } from '../reference/landmanWorkspace.js';
import {
  initialLandmanMode,
  LANDMAN_MODE_KEY,
} from '../reference/landmanModel.js';
import { startStandaloneChrome } from './startupChrome.js';
export function createStandaloneTools(options) {
  let preference = null;
  try {
    preference = localStorage.getItem(LANDMAN_MODE_KEY);
  } catch {}
  const landman = initialLandmanMode({
    search: location.search,
    hasShareState: options.controls.styleManager.hasShareState,
    preference,
  });
  const result = createApplicationTools({
    startChrome: (chrome) =>
      startStandaloneChrome({
        ...chrome,
        ...(landman ? { initializeWelcome: () => ({ destroy() {} }) } : {}),
      }),
    sceneDataPacks: {
      sources: {
        assets: createAssetDirectorySource({
          baseUrl: new URL('/scene-assets/', window.location.href).href,
        }),
      },
    },
    ...options,
  });
  options.defer(mountLandmanWorkspace(options));
  return result;
}
