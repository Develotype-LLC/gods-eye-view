/** Newest shading request wins, including requests made outside the sidebar.
 * Do not await the other layer inside a visibility guard: simultaneous requests
 * could otherwise wait on each other's lifecycle queues.
 */
export function mountSurfacePolicy(manager, isActive, onError = () => {}) {
  return manager.subscribeVisibilityRequests(({ layerId, enabled }) => {
    if (!isActive() || !enabled) return;
    const other =
      layerId === 'ground-motion'
        ? 'terrain-difference'
        : layerId === 'terrain-difference'
          ? 'ground-motion'
          : null;
    if (other)
      void manager
        .setEnabled(other, false, { origin: 'programmatic' })
        .catch(onError);
  });
}
