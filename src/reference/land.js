import { inspectorSections } from './inspectorSections.js';
import * as Cesium from 'cesium';
import { parcelTheme, themeLegend } from './landThemes.js';
const ROLE_NAMES = {
  upstream: 'Upstream',
  midstream: 'Midstream',
  holdco: 'Holding company',
  minerals: 'Minerals / royalties',
  'data-centers': 'Data centers',
  power: 'Power / utilities',
  agriculture: 'Agriculture',
  public: 'Public land',
  other: 'Other',
  unclassified: 'Unclassified',
};
const node = (tag, text) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = String(text);
  return n;
};
export function createLandLayer() {
  let viewer,
    enabled = false,
    theme = 'neutral',
    disposed = false,
    panel,
    source,
    metadata,
    result,
    detail,
    request,
    timer,
    offMove,
    picker,
    error,
    loading = false,
    sequence = 0,
    detailSequence = 0;
  const selectedOwners = new Map(),
    picks = new Map(),
    listeners = new Set();
  const filters = {
    basin: 'both',
    role: '',
    client: '',
    owners: '[]',
    candidates: 'true',
    interest: 'appraisal',
  };
  const abort = new AbortController();
  const notify = () => listeners.forEach((fn) => fn());
  const get = async (path, signal) => {
    const r = await fetch('/api/reference/land/' + path, { signal });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || 'Land data unavailable');
    return d;
  };
  const post = async (path, data) => {
    const r = await fetch('/api/reference/land/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Landman-Write': '1' },
      body: JSON.stringify(data),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || 'Could not save');
    return d;
  };
  function message(text) {
    panel.querySelector('[data-status]').textContent = text;
  }
  function bounds() {
    const r = viewer.camera.computeViewRectangle();
    return r && r.west < r.east
      ? [r.west, r.south, r.east, r.north].map(Cesium.Math.toDegrees)
      : [-107, 25, -93, 37];
  }
  function fly(b) {
    if (!b || b.length !== 4 || !b.every(Number.isFinite)) return;
    const dx = Math.max((b[2] - b[0]) * 0.05, 0.002),
      dy = Math.max((b[3] - b[1]) * 0.05, 0.002);
    const rectangle = Cesium.Rectangle.fromDegrees(
      b[0] - dx,
      b[1] - dy,
      b[2] + dx,
      b[3] + dy,
    );
    const position = viewer.camera.getRectangleCameraCoordinates(rectangle);
    if (!position) return;
    const destination = Cesium.Cartographic.fromCartesian(position);
    const terrainHeight = viewer.scene.globe.getHeight(destination);
    destination.height = Math.max(
      destination.height,
      (Number.isFinite(terrainHeight) ? terrainHeight : 3000) + 1200,
    );
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(
        destination.longitude,
        destination.latitude,
        destination.height,
      ),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: 1.2,
    });
  }
  async function refresh() {
    if (!enabled) return;
    request?.abort();
    request = new AbortController();
    const signal = request.signal,
      intent = ++sequence;
    loading = true;
    message('Reading parcels…');
    notify();
    try {
      const data = await get(
        'viewport?' +
          new URLSearchParams({ ...filters, bbox: bounds().join(',') }),
        signal,
      );
      if (signal.aborted || intent !== sequence || !enabled) return;
      result = data;
      source.entities.removeAll();
      picks.clear();
      const color = Cesium.Color.fromCssColorString('#c1c6c9');
      if (data.mode === 'clusters')
        for (const [i, f] of data.features.entries()) {
          const id = 'land:cluster:' + i;
          picks.set(id, f);
          source.entities.add({
            id,
            position: Cesium.Cartesian3.fromDegrees(f.longitude, f.latitude),
            point: {
              pixelSize: Math.min(32, 12 + Math.log10(f.count) * 4),
              color,
              outlineWidth: 2,
              outlineColor: Cesium.Color.BLACK,
              disableDepthTestDistance: Infinity,
            },
            label: {
              text: f.count.toLocaleString(),
              font: '12px sans-serif',
              pixelOffset: new Cesium.Cartesian2(0, -22),
              showBackground: true,
              disableDepthTestDistance: Infinity,
            },
          });
        }
      else
        for (const f of data.features) {
          const style = parcelTheme(f, theme);
          const color = Cesium.Color.fromCssColorString(style.color);
          const polygons =
            f.geometry.type === 'Polygon'
              ? [f.geometry.coordinates]
              : f.geometry.coordinates;
          for (const [i, rings] of polygons.entries()) {
            const id = `land:parcel:${f.id}:${i}`;
            picks.set(id, f);
            const ring = (r) =>
              new Cesium.PolygonHierarchy(
                Cesium.Cartesian3.fromDegreesArray(r.flat()),
              );
            source.entities.add({
              id,
              polygon: {
                hierarchy: new Cesium.PolygonHierarchy(
                  Cesium.Cartesian3.fromDegreesArray(rings[0].flat()),
                  rings.slice(1).map(ring),
                ),
                material: color.withAlpha(style.alpha),
                classificationType: Cesium.ClassificationType.BOTH,
              },
            });
            for (const [j, r] of rings.entries()) {
              const line = id + ':line:' + j;
              picks.set(line, f);
              source.entities.add({
                id: line,
                polyline: {
                  positions: Cesium.Cartesian3.fromDegreesArray(r.flat()),
                  width: 1.5,
                  material: style.dashed
                    ? new Cesium.PolylineDashMaterialProperty({
                        color,
                        dashLength: 12,
                      })
                    : color,
                  clampToGround: true,
                },
              });
            }
          }
        }
      renderThemeLegend();
      panel.querySelector('[data-totals]').textContent =
        `${data.summary.total.toLocaleString()} matching parcels · ${Math.round(data.summary.acres).toLocaleString()} geometric acres. ${data.count.toLocaleString()} in this view.`;
      const list = panel.querySelector('[data-results]');
      list.replaceChildren();
      if (data.mode === 'clusters')
        list.append(
          node(
            'p',
            'Zoom in or narrow the owner filters to see parcel boundaries.',
          ),
        );
      else
        for (const f of data.features.slice(0, 50)) {
          const b = node(
            'button',
            `${!f.owner ? 'Owner not supplied · parcel ' + f.id : f.owner.length > 100 ? f.owner.slice(0, 97) + '…' : f.owner} · ${Number(f.area_acres).toFixed(1)} ac · ${f.county}`,
          );
          b.type = 'button';
          b.title = f.owner || 'Owner not supplied';
          if (theme !== 'neutral')
            b.append(node('small', parcelTheme(f, theme).label));
          b.addEventListener('click', () => void inspect(f.id));
          list.append(b);
        }
      if (data.mode === 'parcels' && data.count > 50)
        list.append(
          node(
            'small',
            'First 50 listed; all returned parcels remain selectable on the map.',
          ),
        );
      error = null;
      panel.querySelector('[data-retry]').hidden = true;
      message(
        data.count
          ? 'Click a parcel for appraisal owners and evidence.'
          : 'No matching parcels here. Check county coverage or use Fit results.',
      );
      viewer.scene.requestRender();
    } catch (e) {
      if (!signal.aborted) {
        source.entities.removeAll();
        picks.clear();
        result = null;
        panel.querySelector('[data-results]')?.replaceChildren();
        panel.querySelector('[data-totals]').textContent =
          'Results unavailable.';
        viewer.scene.requestRender();
        error =
          'Could not load parcels for this map area. Retry the parcel display; other land queries may still work.';
        panel.querySelector('[data-retry]').hidden = false;
        message(error);
      }
    } finally {
      if (intent === sequence) {
        loading = false;
        notify();
      }
    }
  }
  async function catalog() {
    metadata = await get('catalog');
    if (disposed) return metadata;
    const select = panel.querySelector('[data-client]');
    select.replaceChildren(
      new Option('Choose a saved client…', ''),
      ...metadata.clients.map(
        (c) => new Option(`${c.name} (${c.owners} owners)`, c.id),
      ),
    );
    select.value = filters.client;
    const coverage = panel.querySelector('[data-coverage]');
    coverage.replaceChildren(
      node(
        'summary',
        `${metadata.counties.length} county snapshots · source dates and coverage`,
      ),
    );
    for (const c of metadata.counties) {
      const a = node(
        'a',
        `${c.name}: ${c.metadata.sourceDates.join(', ')} · ${Number(c.metadata.parcels).toLocaleString()} county parcels`,
      );
      a.href = c.metadata.sourceUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      coverage.append(a);
    }
    return metadata;
  }
  function chips() {
    const list = panel.querySelector('[data-selected]');
    list.replaceChildren();
    for (const [key, name] of selectedOwners) {
      const b = node('button', 'Remove ' + name);
      b.addEventListener('click', () => {
        selectedOwners.delete(key);
        chips();
        pendingFilters();
      });
      list.append(b);
    }
  }
  let sections;
  function pendingFilters() {
    panel.querySelector('[data-pending]').textContent =
      'Filter changes not applied. Choose Apply filters.';
  }
  function chooseOwner(key, name) {
    if (key === 'OWNER NOT SUPPLIED') return;
    selectedOwners.set(key, name);
    panel.querySelector('[data-mode]').value = 'owner';
    panel.querySelector('[data-owner-tools]').hidden = false;
    panel.querySelector('[data-client-tools]').hidden = true;
    panel.querySelector('[data-class-tools]').hidden = true;
    panel.querySelector('[data-owner-matches]').replaceChildren();
    chips();
    pendingFilters();
    sections.settings.open = true;
  }
  async function searchOwners() {
    const input = panel.querySelector('[data-owner-search]').value.trim();
    if (input.length < 2) {
      message('Enter at least two characters.');
      return;
    }
    try {
      const data = await get('owners?' + new URLSearchParams({ q: input }));
      const list = panel.querySelector('[data-owner-matches]');
      list.replaceChildren();
      for (const o of data.owners) {
        const b = node(
          'button',
          `${o.name} · ${o.parcels.toLocaleString()} parcels`,
        );
        b.addEventListener('click', () => {
          chooseOwner(o.owner_key, o.name);
        });
        const profile = node('button', 'Open profile · ' + o.name);
        profile.addEventListener('click', () =>
          document.dispatchEvent(
            new CustomEvent('landman:owner', {
              detail: { subject: 'owner:' + o.owner_key, from: 'land-panel' },
            }),
          ),
        );
        list.append(b, profile);
      }
      if (!data.owners.length)
        list.append(node('p', 'No owner names matched.'));
    } catch (e) {
      message(e.message);
    }
  }
  async function inspect(id) {
    const intent = ++detailSequence;
    const box = panel.querySelector('[data-detail]');
    box.replaceChildren(node('p', 'Reading parcel…'));
    document.dispatchEvent(
      new CustomEvent('landman:inspect', {
        detail: { layerId: 'land-parcels', name: 'Land ownership' },
      }),
    );
    sections.show('parcel:' + id);
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    try {
      const data = await get('detail?' + new URLSearchParams({ id }));
      if (intent !== detailSequence || !enabled) return;
      detail = data;
      box.replaceChildren();
      if (!data.parcel) {
        box.append(node('p', 'Parcel unavailable'));
        return;
      }
      const p = data.parcel;
      const zoom = node('button', 'Zoom to this parcel');
      zoom.addEventListener('click', () => fly(p.bounds));
      box.append(zoom);
      box.append(
        node('h3', `${p.county} · parcel ${p.source_key || p.id}`),
        node(
          'p',
          `${Number(p.area_acres).toFixed(2)} geometric acres · ${p.basins.join(', ')}`,
        ),
        node(
          'p',
          'Whole-parcel geometric area; not surveyed acreage or net mineral acres. Basin membership is an intersection, not a clipped acreage calculation.',
        ),
      );
      const link = node(
        'a',
        'Source county file · ' + p.source.sourceDates.join(', '),
      );
      link.href = p.source.sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      box.append(link);
      if (!data.accounts.length) {
        const research = node('button', 'Research this parcel');
        research.addEventListener('click', () =>
          document.dispatchEvent(
            new CustomEvent('landman:owner', {
              detail: { subject: 'parcel:' + id, from: 'land-panel' },
            }),
          ),
        );
        box.append(research);
      }
      for (const a of data.accounts) {
        const card = node('section');
        card.className = 'land-account';
        card.append(node('h4', a.raw_owner));
        const profile = node(
          'button',
          a.owner_key === 'OWNER NOT SUPPLIED'
            ? 'Research this parcel'
            : 'Open owner profile',
        );
        profile.addEventListener('click', () =>
          document.dispatchEvent(
            new CustomEvent('landman:owner', {
              detail: {
                subject:
                  a.owner_key === 'OWNER NOT SUPPLIED'
                    ? 'parcel:' + id
                    : 'owner:' + a.owner_key,
                from: 'land-panel',
              },
            }),
          ),
        );
        card.append(profile);
        const add = node('button', 'Add this owner to selection');
        add.addEventListener('click', () => {
          chooseOwner(a.owner_key, a.raw_owner);
        });
        if (a.owner_key !== 'OWNER NOT SUPPLIED') card.append(add);
        const raw = node('details');
        raw.append(node('summary', 'Original appraisal fields'));
        for (const [k, v] of Object.entries(a.properties))
          if (v != null && v !== '') raw.append(node('p', `${k}: ${v}`));
        card.append(raw);
        card.append(
          node(
            'p',
            a.reviewed_at
              ? `User-classified: ${a.reviewed_roles.map((r) => ROLE_NAMES[r]).join(', ') || 'Unclassified'} · ${a.review_note}`
              : 'No reviewed owner classification.',
          ),
        );
        for (const match of a.candidates) {
          const d = node('details');
          d.append(
            node(
              'summary',
              `Research name-match candidate: ${match.rawLegalName} · ${match.family}`,
            ),
            node(
              'p',
              `Identity/jurisdiction and parcel affiliation need review. ${match.relationshipType || ''} · as of ${match.relationshipAsOf || 'unknown'}`,
            ),
          );
          for (const s of match.sources) {
            const l = node('a', `${s.title} · ${s.sourceDate}`);
            l.href = s.url;
            l.target = '_blank';
            l.rel = 'noopener';
            d.append(l);
          }
          card.append(d);
        }
        const edit = node('details');
        edit.append(node('summary', 'Classify this owner'));
        const select = node('select');
        select.multiple = true;
        select.setAttribute('aria-label', 'Owner classes for ' + a.raw_owner);
        for (const [k, v] of Object.entries(ROLE_NAMES))
          if (k !== 'unclassified') {
            const option = new Option(v, k);
            option.selected = a.reviewed_roles.includes(k);
            select.append(option);
          }
        const note = node('textarea');
        note.placeholder =
          'Evidence source or classification rationale (required)';
        note.setAttribute(
          'aria-label',
          'Classification evidence for ' + a.raw_owner,
        );
        const save = node('button', 'Save classification');
        save.addEventListener('click', async () => {
          save.disabled = true;
          try {
            await post('classify', {
              owner: a.owner_key,
              roles: [...select.selectedOptions].map((o) => o.value),
              note: note.value,
            });
            message('Owner classification saved.');
            await inspect(id);
            await refresh();
          } catch (e) {
            message(e.message);
          } finally {
            save.disabled = false;
          }
        });
        edit.append(select, note, save);
        if (a.owner_key !== 'OWNER NOT SUPPLIED') card.append(edit);
        box.append(card);
      }
      box.append(node('h3', 'Mineral rights and other interests'));
      if (!data.interests.length)
        box.append(
          node(
            'p',
            'Unknown. No recorded mineral, leasehold, easement or option instruments are linked to this parcel. Appraisal names and nearby wells do not establish these rights.',
          ),
        );
      else
        for (const i of data.interests)
          box.append(node('p', `${i.kind}: ${i.party} · ${i.instrument}`));
      box.append(
        node(
          'p',
          'Nearby infrastructure layers show context, not proof that a company wants this parcel.',
        ),
      );
      notify();
    } catch (e) {
      if (intent === detailSequence) box.replaceChildren(node('p', e.message));
    }
  }
  function renderThemeLegend() {
    const box = panel.querySelector('[data-theme-legend]');
    box.replaceChildren();
    if (result?.mode === 'clusters') {
      box.append(
        node(
          'p',
          'Zoom in for parcel colors. Regional circles show parcel counts, not owner identity or class.',
        ),
      );
      return;
    }
    for (const [label, color] of themeLegend(theme)) {
      const key = node('span', '■ ' + label);
      key.style.color = color;
      box.append(key);
    }
    if (theme !== 'neutral')
      box.append(
        node(
          'p',
          'Dashed borders: missing owner name or unverified name-match class. Each unknown parcel is a separate research item. Class review is not title verification.',
        ),
      );
  }
  function mount() {
    panel = node('section');
    panel.id = 'land-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Land ownership');
    panel.innerHTML = `<p>Appraisal-reported parcel ownership · Texas portions of the Permian and Palo Duro basins</p>
 <label>Map coloring<select data-theme><option value="neutral">Parcel boundaries</option><option value="class">Owner class</option><option value="research">Ownership research status</option></select></label><div data-theme-legend></div><label>Basin<select data-basin><option value="both">Both basins</option><option value="permian">Permian</option><option value="palo-duro">Palo Duro</option></select></label>
 <label>Select by<select data-mode><option value="all">All owners</option><option value="owner">Specific owner</option><option value="client">Client portfolio</option><option value="class">Owner class</option></select></label>
 <div data-owner-tools><form data-search-form><label>Find an owner<input data-owner-search placeholder="Company or owner name" minlength="2" maxlength="100"></label><button>Search names</button></form><div data-owner-matches></div><div data-selected></div><small>Select multiple owners, then Apply filters.</small></div>
 <label data-client-tools hidden>Client portfolio<select data-client><option value="">Choose a saved client…</option></select></label>
 <label data-class-tools hidden>Owner class<select data-role><option value="">All classes</option>${Object.entries(
   ROLE_NAMES,
 )
   .map(([k, v]) => `<option value="${k}">${v}</option>`)
   .join('')}</select></label>
 <label><input data-candidates type="checkbox" checked>Include research name-match candidates</label><small>Candidate company roles are unverified name matches. Client portfolios contain only the appraisal names you explicitly add. Identical names may represent different parties; verify legal identity.</small>
 <label>Interest evidence<select data-interest><option value="appraisal">Appraisal-reported ownership</option><option value="surface">Documented surface interest</option><option value="mineral">Documented mineral interest</option><option value="leasehold">Documented leasehold</option><option value="easement">Documented easement</option><option value="option">Documented option</option></select></label>
 <div class="land-actions"><button data-apply>Apply filters</button><button data-fit>Fit results</button><button data-clear>Clear filters</button></div>
 <p data-applied>Applied: all owners · both basins · appraisal ownership</p><p data-pending role="status"></p><button data-retry hidden>Retry parcel display</button><p data-status role="status"></p><p data-totals></p>
 <details><summary>Save selected owners as a client portfolio</summary><label>Shared client name<input data-client-name maxlength="100"></label><button data-save-client>Save / add selected owners</button><p>Saved on the server and shared with signed-in users. Existing client names add these owners without removing current members.</p></details>
 <details data-coverage></details><div data-detail></div><div data-results></div>`;
    sections = inspectorSections(panel, [panel.querySelector('[data-detail]')]);
    sections.show(null);
    document.body.append(panel);
    const on = (s, e, f) =>
      panel.querySelector(s).addEventListener(e, f, { signal: abort.signal });
    on('[data-retry]', 'click', () => void refresh());
    for (const selector of [
      '[data-basin]',
      '[data-mode]',
      '[data-client]',
      '[data-role]',
      '[data-interest]',
      '[data-candidates]',
    ])
      on(selector, 'change', pendingFilters);
    on('[data-theme]', 'change', (e) => {
      theme = e.target.value;
      void refresh();
    });
    on('[data-mode]', 'change', () => {
      const mode = panel.querySelector('[data-mode]').value;
      panel.querySelector('[data-client-tools]').hidden = mode !== 'client';
      panel.querySelector('[data-class-tools]').hidden = mode !== 'class';
      panel.querySelector('[data-owner-tools]').hidden =
        mode === 'client' || mode === 'class';
    });
    on('[data-search-form]', 'submit', (e) => {
      e.preventDefault();
      void searchOwners();
    });
    on('[data-apply]', 'click', () => {
      const mode = panel.querySelector('[data-mode]').value;
      if (mode === 'owner' && !selectedOwners.size) {
        message('Select at least one owner from the search results.');
        return;
      }
      if (mode === 'client' && !panel.querySelector('[data-client]').value) {
        message('Choose a saved client portfolio.');
        return;
      }
      Object.assign(filters, {
        basin: panel.querySelector('[data-basin]').value,
        role: mode === 'class' ? panel.querySelector('[data-role]').value : '',
        client:
          mode === 'client' ? panel.querySelector('[data-client]').value : '',
        owners: JSON.stringify(
          mode === 'owner' ? [...selectedOwners.keys()] : [],
        ),
        candidates: String(panel.querySelector('[data-candidates]').checked),
        interest: panel.querySelector('[data-interest]').value,
      });
      panel.querySelector('[data-pending]').textContent = '';
      panel.querySelector('[data-applied]').textContent =
        `Applied: ${mode === 'owner' ? [...selectedOwners.values()].join(' · ') : mode === 'class' ? ROLE_NAMES[filters.role] || 'All classes' : mode === 'client' ? panel.querySelector('[data-client]').selectedOptions[0].textContent : 'All owners'} · ${filters.basin} · ${filters.interest}`;
      detailSequence++;
      panel.querySelector('[data-detail]').replaceChildren();
      sections.show(null);
      void refresh();
    });
    on('[data-fit]', 'click', () => fly(result?.summary.bounds));
    on('[data-clear]', 'click', () => {
      selectedOwners.clear();
      chips();
      Object.assign(filters, {
        basin: 'both',
        role: '',
        client: '',
        owners: '[]',
        candidates: 'true',
        interest: 'appraisal',
      });
      for (const [key, value] of [
        ['basin', 'both'],
        ['mode', 'all'],
        ['role', ''],
        ['client', ''],
        ['interest', 'appraisal'],
      ])
        panel.querySelector(`[data-${key}]`).value = value;
      panel.querySelector('[data-candidates]').checked = true;
      panel.querySelector('[data-owner-tools]').hidden = false;
      panel.querySelector('[data-client-tools]').hidden = panel.querySelector(
        '[data-class-tools]',
      ).hidden = true;
      panel.querySelector('[data-pending]').textContent = '';
      panel.querySelector('[data-applied]').textContent =
        'Applied: all owners · both basins · appraisal ownership';
      panel.querySelector('[data-owner-matches]').replaceChildren();
      panel.querySelector('[data-detail]').replaceChildren();
      sections.show(null);
      detailSequence++;
      void refresh();
    });
    on('[data-save-client]', 'click', async () => {
      try {
        if (!selectedOwners.size) throw Error('Select owner names first.');
        const saved = await post('clients', {
          name: panel.querySelector('[data-client-name]').value,
          owners: [...selectedOwners.keys()],
        });
        await catalog();
        message('Saved client portfolio: ' + saved.name);
      } catch (e) {
        message(e.message);
      }
    });
  }
  return {
    id: 'land-parcels',
    name: 'Land ownership',
    icon: '▧',
    source: 'TxGIO · county appraisal snapshots',
    updateInterval: 0,
    init(v) {
      viewer = v;
      mount();
      source = new Cesium.CustomDataSource('Land parcels');
      void viewer.dataSources.add(source);
      offMove = viewer.camera.moveEnd.addEventListener(() => {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 200);
      });
      picker = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      picker.setInputAction((event) => {
        if (!enabled || document.body.dataset.locationPicking) return;
        const hit = viewer.scene.pick(event.position);
        const f = picks.get(hit?.id?.id);
        if (!f) return;
        if (f.count) fly([f.west, f.south, f.east, f.north]);
        else void inspect(f.id);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      return true;
    },
    async enable() {
      enabled = true;
      panel.hidden = false;
      await catalog();
      await refresh();
      return true;
    },
    disable() {
      enabled = false;
      sequence++;
      detailSequence++;
      request?.abort();
      clearTimeout(timer);
      source.entities.removeAll();
      picks.clear();
      panel.hidden = true;
      notify();
      return true;
    },
    destroy() {
      this.disable();
      disposed = true;
      abort.abort();
      offMove?.();
      picker.destroy();
      if (!viewer.isDestroyed()) viewer.dataSources.remove(source, true);
      panel.remove();
      listeners.clear();
      return true;
    },
    update() {
      return true;
    },
    inspectId(id) {
      return inspect(id);
    },
    flyTo() {
      fly(result?.summary.bounds || [-106.7, 29, -99, 36]);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getState() {
      return { enabled, loading, error, result, detail, theme };
    },
    getStats() {
      return {
        count: result?.count || 0,
        source: 'TxGIO 2025 · appraisal records',
        error,
      };
    },
  };
}
