// AccessLens design tokens.
// Aesthetic: "civic poster" — flat warm paper, one loud red, ink-black type,
// thick rules and big blocky headings. No blur, no gradients, no glass.
// Deep Red on Warm Cream measures about 4.6:1 contrast, which passes WCAG AA
// for body text; ink on cream is about 15:1 for everything small.

export const colors = {
  red: '#D62828', // Deep Red — primary
  cream: '#FFF3E0', // Warm Cream — background
  ink: '#1E1614', // warm near-black for text and rules
  paper: '#FBE6C8', // deeper cream for raised blocks
  redDark: '#A81E1E', // pressed state
  muted: '#5E4E48', // secondary text (7:1 on cream)
  line: '#1E1614',
  white: '#FFFFFF',
  done: '#1E1614',
};

export const fonts = {
  display: 'ArchivoBlack_400Regular',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const border = 2;

// Text size presets; "Standard" still respects the phone's own font scale.
export const TEXT_SCALES = [
  { key: 'standard', label: 'Standard', scale: 1 },
  { key: 'large', label: 'Large', scale: 1.2 },
  { key: 'xlarge', label: 'Extra large', scale: 1.4 },
];

// Minimum touch target heights. Large controls mode bumps everything up.
export const targets = { normal: 56, large: 68 };
