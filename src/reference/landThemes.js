export const OWNER_CLASSES = {
  upstream: ['Upstream', '#e6bd76'],
  midstream: ['Midstream', '#ba94e7'],
  holdco: ['Holding company', '#67bcd3'],
  minerals: ['Minerals / royalties', '#e599bc'],
  'data-centers': ['Data centers', '#62b5f1'],
  power: ['Power / utilities', '#ef9b54'],
  agriculture: ['Agriculture', '#89c57b'],
  public: ['Public land', '#a7b8df'],
  other: ['Other', '#d5c5ad'],
  unclassified: ['Unclassified', '#a5adb4'],
  mixed: ['Multiple classes', '#e7d5f0'],
};
export const RESEARCH_STATES = {
  unknown: ['Missing owner name', '#a5adb4'],
  partial: ['Some owner names missing', '#ef9b54'],
  named: ['Named; class not assessed', '#6ebdd0'],
  candidate: ['Name-match class only', '#dac56f'],
  reviewed: ['Class reviewed; title unverified', '#91c891'],
};
export function parcelTheme(feature, theme = 'neutral') {
  const owners = feature.ownership || [];
  const known = owners.filter((o) => o.key && o.key !== 'OWNER NOT SUPPLIED');
  const missing = !owners.length || known.length !== owners.length;
  const roles = [...new Set(known.flatMap((o) => o.roles || []))];
  const candidate = known.some((o) => !o.reviewed && o.roles?.length);
  const research = !known.length
    ? 'unknown'
    : missing
      ? 'partial'
      : candidate
        ? 'candidate'
        : known.every((o) => o.reviewed)
          ? 'reviewed'
          : 'named';
  const role = roles.length > 1 ? 'mixed' : roles[0] || 'unclassified';
  const [label, color] =
    theme === 'class'
      ? OWNER_CLASSES[role] || OWNER_CLASSES.unclassified
      : theme === 'research'
        ? RESEARCH_STATES[research]
        : ['Parcel boundaries', '#c1c6c9'];
  return {
    label,
    color,
    research,
    role,
    missing,
    candidate,
    dashed: theme !== 'neutral' && (missing || candidate),
    alpha: theme === 'neutral' ? 0.06 : 0.35,
  };
}
export function themeLegend(theme) {
  return Object.values(
    theme === 'class'
      ? OWNER_CLASSES
      : theme === 'research'
        ? RESEARCH_STATES
        : { neutral: ['Parcel boundaries', '#c1c6c9'] },
  );
}
