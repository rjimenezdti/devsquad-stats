/** AdminKit palette, mirrored so ApexCharts renders in the same colors as the SCSS. */
export const palette = {
  primary: '#3B7DDD',
  secondary: '#6c757d',
  success: '#1cbb8c',
  info: '#17a2b8',
  warning: '#fcb92c',
  danger: '#dc3545',
  purple: '#6f42c1',
  pink: '#e83e8c',
  orange: '#fd7e14',
  teal: '#20c997',
  gray300: '#dee2e6',
  gray500: '#adb5bd',
  gray600: '#6c757d',
  gray700: '#495057',
} as const;

/** A qualitative sequence for categorical series (states, types, assignees). */
export const categorical = [
  '#012a4a',
  '#013a63',
  '#01497c',
  '#014f86',
  '#2a6f97',
  '#2c7da0',
  '#468faf',
  '#61a5c2',
  '#89c2d9',
  '#a9d6e5',
] as const;

/**
 * Two-tone split from the blue ramp for the open-vs-resolved / finished series.
 * Resolved reuses the same dark blue that `colorForState` assigns to "done".
 */
export const openResolved = {
  open: '#61a5c2',
  resolved: '#013a63',
} as const;

/**
 * Stable categorical colors for a list of clients (color follows the entity's
 * position in the sorted list, not its rank). Capped at the palette length.
 */
export function clientColors(clients: string[]): string[] {
  return clients.map((_, i) => categorical[i % categorical.length]);
}

/**
 * Maps common Azure DevOps states onto the blue ramp so the same state keeps a
 * stable shade (Done darkest → New lightest). Falls back to the ramp by index.
 */
export function colorForState(state: string, index: number): string {
  const key = state.toLowerCase();
  if (['done', 'closed', 'completed', 'resolved'].includes(key)) return categorical[1]; // #013a63
  if (['active', 'in progress', 'committed', 'doing'].includes(key)) return categorical[4]; // #2a6f97
  if (['new', 'proposed', 'to do', 'approved'].includes(key)) return categorical[8]; // #89c2d9
  if (['blocked', 'removed'].includes(key)) return categorical[6]; // #468faf
  return categorical[index % categorical.length];
}
