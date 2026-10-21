// Everything the app says about barriers, impacts and the report lifecycle.
// Category names and descriptions mirror the "What AI does?" slide.

export const CATEGORIES = {
  obstruction: {
    key: 'obstruction',
    label: 'Obstruction',
    noun: 'an obstruction',
    short: 'Something is blocking the path',
    description: 'An object may be blocking the path — a parked motorcycle, bins, signboards or overgrown plants.',
    team: 'Enforcement & Facilities',
  },
  surface: {
    key: 'surface',
    label: 'Surface damage',
    noun: 'surface damage',
    short: 'Hole, crack or broken section',
    description: 'A visible hole, crack or damaged section of the walkway, kerb or drain cover.',
    team: 'Civil Maintenance',
  },
  steps: {
    key: 'steps',
    label: 'Steps',
    noun: 'a step barrier',
    short: 'Interrupts step-free access',
    description: 'A step, high kerb or level change that may interrupt step-free access, with no usable ramp.',
    team: 'Civil Maintenance',
  },
};
export const CATEGORY_KEYS = ['obstruction', 'surface', 'steps'];

// Who the barrier affects — the four groups on the problem-statement slide.
export const AFFECTED = [
  { key: 'wheelchair', label: 'Wheelchair users' },
  { key: 'older', label: 'Older residents' },
  { key: 'walking_aid', label: 'People using walking aids' },
  { key: 'stroller', label: 'Parents with strollers' },
];

// How the barrier affects the journey.
export const IMPACTS = [
  { key: 'cannot_pass', label: "Couldn't get past at all" },
  { key: 'road', label: 'Had to go onto the road' },
  { key: 'turn_back', label: 'Had to turn back' },
  { key: 'longer_route', label: 'Took a longer route' },
  { key: 'needed_help', label: 'Needed someone to help' },
  { key: 'risk_fall', label: 'Risk of tripping or falling' },
];

export const SEVERITY = [
  { key: 'blocked', label: 'Blocks the journey', hint: 'I could not reach where I was going' },
  { key: 'difficult', label: 'Makes it difficult', hint: 'I got through, but it was hard or unsafe' },
  { key: 'minor', label: 'Minor inconvenience', hint: 'Worth fixing, but passable' },
];

// The five stages from the "Example user journey" slide.
export const STAGES = [
  { key: 'report', label: 'Report', detail: 'You submitted a photo and location.' },
  { key: 'ai', label: 'AI assessment', detail: 'AI flagged the likely barrier type.' },
  { key: 'review', label: 'Staff review', detail: 'Staff verify the report and assign action.' },
  { key: 'completion', label: 'Completion photo', detail: 'The maintenance team submits a photo after the fix.' },
  { key: 'confirmed', label: 'Confirmation', detail: 'Staff confirm completion and update you.' },
];

export function stageIndex(report) {
  return STAGES.findIndex((s) => s.key === report.stage);
}

export function statusLabel(report) {
  if (report.synced === false) return 'Waiting to upload';
  switch (report.stage) {
    case 'closed':
      return report.rejected ? 'Not accepted' : 'Closed';
    case 'report':
      return 'Submitted';
    case 'ai':
      return 'Awaiting review';
    case 'review':
      return report.assignedTo ? 'Repair assigned' : 'Under review';
    case 'completion':
      return 'Fix submitted, checking';
    case 'confirmed':
      return 'Resolved';
    default:
      return '';
  }
}
