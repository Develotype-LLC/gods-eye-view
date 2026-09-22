/** Keep selection facts first; layer controls remain available without clearing selection. */
export function inspectorSections(panel, selectedNodes) {
  const selection = document.createElement('div');
  selection.className = 'lm-selection';
  const settings = document.createElement('details');
  settings.className = 'lm-layer-settings';
  settings.open = true;
  const summary = document.createElement('summary');
  summary.textContent = 'Layer settings, search & coverage';
  settings.append(summary);
  for (const child of [...panel.children]) {
    if (selectedNodes.includes(child)) selection.append(child);
    else if (child.tagName !== 'HEADER') settings.append(child);
  }
  panel.append(selection, settings);
  let key;
  return {
    show(next) {
      selection.hidden = !next;
      if (next && next !== key) {
        settings.open = false;
        const inspector = panel.closest('.lm-inspector');
        if (inspector) inspector.scrollTop = 0;
        const heading = selection.querySelector('h3');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      }
      if (!next) settings.open = true;
      key = next;
    },
    settings,
  };
}
