import * as Cesium from 'cesium';
const node = (tag, text) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
};
const defaults = {
  name: '',
  relationship: 'not-assessed',
  sponsor: '',
  contact: '',
  notes: '',
  transaction: 'pipeline-easement',
  willingness: 'unknown',
  confidence: 'low',
  scope: '',
  basis: '',
  assessedOn: '',
  nextAction: '',
  followupOn: '',
};
const options = {
  relationship: [
    ['not-assessed', 'Not assessed'],
    ['no-known-relationship', 'No known relationship'],
    ['introduction-available', 'Introduction available'],
    ['existing-relationship', 'Existing relationship'],
  ],
  transaction: [
    ['pipeline-easement', 'Pipeline easement'],
    ['surface-sale', 'Surface sale'],
    ['temporary-access', 'Temporary construction access'],
    ['lease', 'Lease'],
    ['commercial-agreement', 'Commercial agreement'],
  ],
  willingness: [
    ['unknown', 'Unknown'],
    ['unlikely', 'Unlikely'],
    ['possible', 'Possible'],
    ['likely', 'Likely'],
    ['declined', 'Declined this proposal'],
  ],
  confidence: [
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
  ],
};
const fields = [
  ['name', 'Profile name', 200],
  ['relationship', 'Relationship'],
  ['sponsor', 'Who on our team knows them?', 120],
  ['contact', 'Contact name, role and contact details', 500],
  ['notes', 'Relationship notes', 4000],
  ['transaction', 'Proposed transaction'],
  ['scope', 'Project / proposal and parcel scope', 1000],
  ['willingness', 'Willingness for this proposal'],
  ['confidence', 'Assessment confidence'],
  [
    'basis',
    'Evidence or rationale · distinguish our judgment from their statement',
    2000,
  ],
  ['assessedOn', 'Assessment date', 10],
  ['nextAction', 'Next action and assigned person', 500],
  ['followupOn', 'Follow-up date', 10],
];
export function mountOwnerWorkspace({ viewer, openInspector }) {
  const panel = node('section');
  panel.id = 'owner-workspace-panel';
  panel.setAttribute('aria-label', 'Owner relationship workspace');
  panel.innerHTML = `<p>Private relationship records · shared only with this project’s members. Appraisal names remain unverified identity groups.</p><label>Relationship project<select data-project></select></label><details><summary>Create a separate private project</summary><form data-new-project><label>Project or client name<input data-project-name maxlength="120" required></label><p>Only your login will have access. Sharing additional projects requires a membership change.</p><button>Create private project</button></form></details><div class="ow-actions"><button data-directory>Saved owners and research</button><button data-back>Back to route or land</button></div><form data-search><label>Find recorded owners<input data-query minlength="2" maxlength="100" placeholder="Owner name"></label><button>Search owners</button><button type="button" data-new>Add owner we already know</button></form><div data-matches></div><p data-message role="status" aria-live="polite"></p><div data-profile hidden><h3 data-title></h3><p data-identity></p><div class="ow-actions"><button data-highlight>Highlight listed parcels</button><button data-clear-highlight>Clear highlight</button><button data-all>Show other mapped parcels</button></div><p data-parcel-count></p><div data-parcels></div><form data-edit>${fields.map(([key, label, max]) => `<label>${label}${options[key] ? `<select data-field="${key}">${options[key].map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select>` : ['notes', 'basis', 'scope', 'contact', 'nextAction'].includes(key) ? `<textarea data-field="${key}" maxlength="${max}" rows="3"></textarea>` : `<input data-field="${key}" type="${key.endsWith('On') ? 'date' : 'text'}" ${max ? `maxlength="${max}"` : ''} ${key === 'name' ? 'required' : ''}>`}</label>`).join('')}<p>Willingness is a dated team assessment for the selected transaction and scope, not a probability or permission. Save each transaction before switching. Follow-up dates are a worklist, not automatic reminders.</p><button data-save>Save owner record</button><button type="button" data-reload>Discard edits / reload saved record</button></form><p data-saved></p><p data-assessment-author></p><details><summary>Assessment and edit history</summary><div data-history></div></details></div>`;
  document.body.append(panel);
  const abort = new AbortController(),
    highlight = new Cesium.CustomDataSource('Owner profile parcel highlights');
  void viewer.dataSources.add(highlight);
  let originCamera = null;
  let selectedTransaction = 'pipeline-easement',
    project = '',
    context = null,
    profile = null,
    parcels = [],
    dirty = false,
    loading = false,
    sequence = 0,
    disposed = false,
    previous = 'land-panel';
  const get = (s) => panel.querySelector(s),
    message = (text) => (get('[data-message]').textContent = text);
  const on = (s, type, fn) =>
    get(s).addEventListener(type, fn, { signal: abort.signal });
  async function api(path, body) {
    const r = await fetch('/api/reference/land/' + path, {
      signal: abort.signal,
      ...(body
        ? {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Landman-Write': '1',
            },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || 'Owner workspace unavailable');
    return data;
  }
  function mayLeave() {
    if (loading) {
      message('Please wait for the current request.');
      return false;
    }
    if (dirty) {
      message(
        'Save this record or use Discard edits before changing owners or projects.',
      );
      return false;
    }
    return true;
  }
  function open() {
    const current =
      document.getElementById('landman-workspace')?.dataset.inspector;
    if (current !== panel.id) {
      originCamera = {
        destination: viewer.camera.positionWC.clone(),
        orientation: {
          direction: viewer.camera.directionWC.clone(),
          up: viewer.camera.upWC.clone(),
        },
      };
      if (['land-panel', 'pipeline-panel'].includes(current))
        previous = current;
    }
    openInspector({ inspector: panel.id, name: 'Owners & relationships' });
  }
  async function initialize() {
    if (project) return;
    const d = await api('owner-projects');
    get('[data-project]').replaceChildren(
      ...d.projects.map((p) => new Option(p.name, p.id)),
    );
    project = String(d.projects[0]?.id || '');
    if (!project)
      throw Error('No relationship project is assigned to your login.');
  }
  function draw(list) {
    highlight.entities.removeAll();
    for (const p of list)
      for (const polygon of p.geometry.type === 'Polygon'
        ? [p.geometry.coordinates]
        : p.geometry.coordinates) {
        const ring = (r) =>
          new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(r.flat()),
          );
        highlight.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              Cesium.Cartesian3.fromDegreesArray(polygon[0].flat()),
              polygon.slice(1).map(ring),
            ),
            material: Cesium.Color.CYAN.withAlpha(0.35),
            classificationType: Cesium.ClassificationType.BOTH,
          },
        });
        for (const r of polygon)
          highlight.entities.add({
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(r.flat()),
              clampToGround: true,
              width: 3,
              material: Cesium.Color.CYAN,
            },
          });
      }
    viewer.scene.requestRender();
  }
  function formValues() {
    return Object.fromEntries(
      fields.map(([k]) => [k, get(`[data-field="${k}"]`).value]),
    );
  }
  function fill(data) {
    selectedTransaction = data.transaction;
    for (const [k] of fields)
      get(`[data-field="${k}"]`).value = data[k] ?? defaults[k];
  }
  function render(d) {
    profile = d.profile;
    parcels = d.parcels;
    dirty = false;
    get('[data-profile]').hidden = false;
    const values = {
      ...defaults,
      ...profile?.data,
      name: profile?.data.name || d.sourceName || context.name || '',
    };
    fill(values);
    assessmentAuthor(values.transaction);
    get('[data-title]').textContent = values.name || 'New owner';
    get('[data-identity]').textContent = context.subject.startsWith('parcel:')
      ? 'Parcel-specific ownership research. This record is not an identified owner.'
      : context.subject.startsWith('manual:')
        ? 'Manually entered owner · not linked to appraisal parcels.'
        : 'Source appraisal-name group · aliases and legal identity have not been verified. Source label: ' +
          d.sourceName;
    get('[data-parcel-count]').textContent =
      `${d.total} ${context.parcels?.length ? 'route-intersecting' : 'mapped'} parcels in imported coverage. ${d.truncated ? 'First 100 listed and highlightable; narrow the route for a smaller set.' : 'Listed boundaries can be highlighted.'} Display geometry is simplified.`;
    get('[data-all]').hidden = !context.parcels?.length;
    get('[data-highlight]').disabled = !parcels.length;
    const list = get('[data-parcels]');
    list.replaceChildren();
    for (const p of parcels) {
      const row = node('div'),
        button = node(
          'button',
          `${p.county} · parcel ${p.source_key} · ${Number(p.area_acres).toFixed(1)} acres`,
        );
      button.type = 'button';
      button.addEventListener('click', () => {
        draw([p]);
        void viewer.flyTo(highlight, { duration: 1 });
      });
      row.append(button);
      const url = p.source?.sourceUrl;
      if (url && /^https?:\/\//.test(url)) {
        const link = node(
          'a',
          'County source · ' + (p.source.sourceDates || []).join(', '),
        );
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        row.append(link);
      }
      list.append(row);
    }
    get('[data-saved]').textContent = profile
      ? `Saved by ${profile.updated_by} · ${new Date(profile.updated_at).toLocaleString()} · revision ${profile.revision}`
      : 'Not saved yet. Saving stores this record in the selected shared project.';
    const history = get('[data-history]');
    history.replaceChildren();
    for (const h of d.history || []) {
      const detail = node('details');
      detail.append(
        node(
          'summary',
          `Revision ${h.revision} · ${h.actor} · ${new Date(h.recorded_at).toLocaleString()}`,
        ),
      );
      detail.append(
        node(
          'p',
          `${h.data.transaction}: ${h.data.willingness} · ${h.data.assessedOn || 'No assessment date'} · ${h.data.scope || 'No scope'}`,
        ),
        node('p', h.data.basis || 'No assessment basis'),
        node('p', h.data.notes || 'No relationship notes'),
      );
      history.append(detail);
    }
    message(
      'Owner profile ready. Relationship records are excluded from standard route exports.',
    );
  }
  function assessmentAuthor(transaction) {
    const a = profile?.data?.assessments?.[transaction];
    get('[data-assessment-author]').textContent = a
      ? `Saved ${transaction} assessment by ${a.actor} · ${new Date(a.recordedAt).toLocaleString()}. Any edits above are unsaved until saved again.`
      : 'No saved assessment for this transaction.';
  }
  async function load(next) {
    if (!mayLeave()) return;
    loading = true;
    const intent = ++sequence;
    get('[data-save]').disabled = true;
    try {
      await initialize();
      context = next;
      highlight.entities.removeAll();
      get('[data-profile]').hidden = true;
      get('[data-matches]').replaceChildren();
      message('Loading owner profile…');
      const d = await api('owner-profile-query', {
        project,
        subject: next.subject,
        ...(next.parcels?.length ? { parcels: next.parcels.join(',') } : {}),
      });
      if (disposed || intent !== sequence) return;
      render(d);
    } catch (e) {
      message(e.message);
    } finally {
      loading = false;
      get('[data-save]').disabled = false;
    }
  }
  async function directory() {
    if (!mayLeave()) return;
    loading = true;
    try {
      await initialize();
      get('[data-profile]').hidden = true;
      highlight.entities.removeAll();
      const d = await api(
        'owner-directory?' + new URLSearchParams({ project }),
      );
      const list = get('[data-matches]');
      list.replaceChildren();
      for (const p of d.profiles.slice(0, 200)) {
        const b = node(
          'button',
          `${p.name} · ${p.relationship} · ${p.transaction}: ${p.willingness}${p.followup ? ' · follow-up ' + p.followup : ''}`,
        );
        b.type = 'button';
        b.addEventListener('click', () => void load({ subject: p.subject }));
        list.append(b);
      }
      message(
        d.profiles.length > 200
          ? 'Showing 200 most recently updated records.'
          : `${d.profiles.length} saved records. Search recorded owners or add an owner you already know.`,
      );
    } catch (e) {
      message(e.message);
    } finally {
      loading = false;
    }
  }
  on('[data-edit]', 'input', (e) => {
    if (e.target.dataset.field === 'transaction') return;
    dirty = true;
    message('Unsaved changes.');
  });
  on('[data-field="transaction"]', 'change', (e) => {
    if (dirty) {
      e.target.value = selectedTransaction;
      message('Save or discard current edits before switching transactions.');
      return;
    }
    const transaction = e.target.value;
    selectedTransaction = transaction;
    assessmentAuthor(transaction);
    const a = profile?.data?.assessments?.[transaction] || defaults;
    for (const k of [
      'willingness',
      'confidence',
      'scope',
      'basis',
      'assessedOn',
    ])
      get(`[data-field="${k}"]`).value = a[k] ?? defaults[k];
    dirty = true;
    message('Transaction selected. Save to record this assessment.');
  });
  on('[data-edit]', 'submit', async (e) => {
    e.preventDefault();
    if (loading || !context) return;
    loading = true;
    get('[data-save]').disabled = true;
    try {
      const d = await api('owner-profile', {
        project,
        subject: context.subject,
        revision: profile?.revision || 0,
        data: formValues(),
      });
      profile = d.profile;
      dirty = false;
      loading = false;
      await load(context);
      message('Saved to the shared project.');
    } catch (e) {
      message(e.message);
    } finally {
      loading = false;
      get('[data-save]').disabled = false;
    }
  });
  on('[data-reload]', 'click', () => {
    if (loading) return;
    dirty = false;
    void load(context);
  });
  on('[data-project]', 'change', (e) => {
    if (!mayLeave()) {
      e.target.value = project;
      return;
    }
    project = e.target.value;
    void directory();
  });
  on('[data-new-project]', 'submit', async (e) => {
    e.preventDefault();
    if (!mayLeave()) return;
    loading = true;
    try {
      const d = await api('owner-projects', {
        name: get('[data-project-name]').value,
      });
      project = String(d.project.id);
      get('[data-project]').append(new Option(d.project.name, project));
      get('[data-project]').value = project;
      context = null;
      profile = null;
      loading = false;
      await directory();
    } catch (e) {
      message(e.message);
    } finally {
      loading = false;
    }
  });
  on('[data-directory]', 'click', () => void directory());
  on('[data-back]', 'click', () => {
    if (!mayLeave()) return;
    highlight.entities.removeAll();
    if (originCamera) viewer.camera.setView(originCamera);
    openInspector({
      inspector: previous,
      name: previous === 'pipeline-panel' ? 'LONG-Haul' : 'Land ownership',
    });
  });
  on('[data-highlight]', 'click', () => {
    draw(parcels);
    void viewer.flyTo(highlight, { duration: 1 });
  });
  on('[data-clear-highlight]', 'click', () => highlight.entities.removeAll());
  on(
    '[data-all]',
    'click',
    () => void load({ ...context, parcels: undefined }),
  );
  on(
    '[data-new]',
    'click',
    () => void load({ subject: 'manual:' + crypto.randomUUID() }),
  );
  on('[data-search]', 'submit', async (e) => {
    e.preventDefault();
    if (!mayLeave()) return;
    loading = true;
    try {
      await initialize();
      const d = await api(
        'owners?' + new URLSearchParams({ q: get('[data-query]').value }),
      );
      get('[data-profile]').hidden = true;
      const list = get('[data-matches]');
      list.replaceChildren();
      for (const o of d.owners.filter(
        (o) => o.owner_key !== 'OWNER NOT SUPPLIED',
      )) {
        const b = node('button', `${o.name} · ${o.parcels} mapped parcels`);
        b.type = 'button';
        b.addEventListener(
          'click',
          () => void load({ subject: 'owner:' + o.owner_key }),
        );
        list.append(b);
      }
      message('Select an owner to open their profile. Up to 50 matches shown.');
    } catch (e) {
      message(e.message);
    } finally {
      loading = false;
    }
  });
  document.addEventListener(
    'landman:owner',
    (e) => {
      if (!mayLeave()) return;
      previous = e.detail.from || 'land-panel';
      open();
      void load(e.detail);
    },
    { signal: abort.signal },
  );
  return {
    open: () => {
      open();
      if (!context) void directory();
    },
    destroy: () => {
      disposed = true;
      abort.abort();
      void viewer.dataSources.remove(highlight, true);
      panel.remove();
    },
  };
}
