import { mountReferenceLibrary } from '../reference/library.js';
import { createApplicationData } from '../app/data.js';
import { getStandaloneCatalog } from './catalog.js';
export function createStandaloneData(options) {
  const result = createApplicationData({
    catalog: options?.catalog ?? getStandaloneCatalog(),
    ...options,
  });
  options.defer(mountReferenceLibrary({viewer: options.scene.viewer, dataManager: result.dataManager, layer: result.catalog.get('ground-motion')}));
  return result;
}
