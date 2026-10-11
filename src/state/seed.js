// Demo data so the prototype opens with reports at different stages.
// Photos use built-in illustrations ("illustration:<kind>") instead of real
// images, so nothing third-party is bundled with the app.

export const DEMO_REGION = {
  latitude: 3.0738,
  longitude: 101.5183,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

const day = 24 * 3600 * 1000;
const t = (daysAgo, hour = 9) => {
  const d = new Date(Date.now() - daysAgo * day);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};

export const seedReports = [
  {
    id: 'seed1',
    code: 'AL-0139',
    createdAt: t(9, 8),
    photoUri: 'illustration:obstruction',
    location: { latitude: 3.0746, longitude: 101.5171, address: 'Covered walkway beside the community hall', confirmed: true },
    landmark: 'Next to the motorcycle bay',
    ai: { category: 'obstruction', confidence: 0.87, scores: { obstruction: 0.87, surface: 0.08, steps: 0.05 }, box: { x: 0.18, y: 0.38, w: 0.6, h: 0.42 }, uncertain: false },
    category: 'obstruction',
    categoryCorrected: false,
    affected: ['wheelchair', 'stroller'],
    impacts: ['road', 'cannot_pass'],
    severity: 'blocked',
    description: 'Motorcycles are parked across the pavement every morning. I had to go onto the road in my wheelchair.',
    voiceUri: null,
    voiceSeconds: 0,
    stage: 'confirmed',
    assignedTo: 'Enforcement & Facilities',
    completionPhotoUri: 'illustration:fixed',
    resolvedAt: t(6, 16),
    timeline: [
      { stage: 'report', at: t(9, 8), note: 'Photo and location submitted.' },
      { stage: 'ai', at: t(9, 8), note: 'AI flagged a possible obstruction; you confirmed it.' },
      { stage: 'review', at: t(8, 10), note: 'Staff checked AL-0139 and confirmed it is an obstruction.' },
      { stage: 'review', at: t(8, 11), note: 'AL-0139 has been assigned to the Enforcement & Facilities team.' },
      { stage: 'completion', at: t(6, 14), note: 'The Enforcement & Facilities team uploaded a completion photo.' },
      { stage: 'confirmed', at: t(6, 16), note: 'Staff confirmed AL-0139 is fixed. Bollards installed to keep the path clear.' },
    ],
  },
  {
    id: 'seed2',
    code: 'AL-0140',
    createdAt: t(3, 17),
    photoUri: 'illustration:steps',
    location: { latitude: 3.0729, longitude: 101.5196, address: 'Pedestrian path to the surau, near the junction', confirmed: true },
    landmark: 'Kerb at the crossing',
    ai: { category: 'surface', confidence: 0.52, scores: { surface: 0.52, steps: 0.41, obstruction: 0.07 }, box: { x: 0.25, y: 0.5, w: 0.5, h: 0.3 }, uncertain: true },
    category: 'steps',
    categoryCorrected: true,
    affected: ['older', 'walking_aid'],
    impacts: ['longer_route', 'risk_fall'],
    severity: 'difficult',
    description: 'The kerb at the crossing is too high and there is no ramp. My mother uses a walking frame and cannot step down.',
    voiceUri: null,
    voiceSeconds: 0,
    stage: 'review',
    assignedTo: 'Civil Maintenance',
    completionPhotoUri: null,
    timeline: [
      { stage: 'report', at: t(3, 17), note: 'Photo and location submitted.' },
      { stage: 'ai', at: t(3, 17), note: 'AI suggested Surface damage; you corrected it to Steps.' },
      { stage: 'review', at: t(2, 9), note: 'Staff checked AL-0140 and confirmed it is a step barrier.' },
      { stage: 'review', at: t(2, 10), note: 'AL-0140 has been assigned to the Civil Maintenance team for inspection and repair.' },
    ],
  },
  {
    id: 'seed3',
    code: 'AL-0141',
    createdAt: t(0, 8),
    photoUri: 'illustration:surface',
    location: { latitude: 3.0752, longitude: 101.5199, address: 'Walkway outside the shophouses, Block C', confirmed: true },
    landmark: 'Broken drain cover',
    ai: { category: 'surface', confidence: 0.81, scores: { surface: 0.81, obstruction: 0.11, steps: 0.08 }, box: { x: 0.3, y: 0.45, w: 0.42, h: 0.32 }, uncertain: false },
    category: 'surface',
    categoryCorrected: false,
    affected: ['wheelchair', 'stroller', 'older'],
    impacts: ['risk_fall'],
    severity: 'difficult',
    description: 'Drain cover is cracked and sinking. Stroller wheel got stuck.',
    voiceUri: null,
    voiceSeconds: 0,
    stage: 'ai',
    assignedTo: null,
    completionPhotoUri: null,
    timeline: [
      { stage: 'report', at: t(0, 8), note: 'Photo and location submitted.' },
      { stage: 'ai', at: t(0, 8), note: 'AI flagged possible surface damage; you confirmed it.' },
    ],
  },
];

export const seedUpdates = [
  { id: 'us4', reportId: 'seed3', title: 'AL-0141 received', body: 'Thanks. Township staff will review your report and assign the right team.', at: t(0, 8), read: false },
  { id: 'us3', reportId: 'seed2', title: 'Repair work assigned', body: 'AL-0140 has been assigned to the Civil Maintenance team for inspection and repair.', at: t(2, 10), read: false },
  { id: 'us2', reportId: 'seed1', title: 'Barrier resolved', body: 'Staff confirmed AL-0139 is fixed. Bollards installed to keep the path clear.', at: t(6, 16), read: true },
  { id: 'us1', reportId: 'seed1', title: 'Fix submitted', body: 'The Enforcement & Facilities team uploaded a completion photo for AL-0139.', at: t(6, 14), read: true },
];
