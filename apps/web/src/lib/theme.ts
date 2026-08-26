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
  palette.primary,
  palette.success,
  palette.warning,
  palette.danger,
  palette.info,
  palette.purple,
  palette.orange,
  palette.pink,
  palette.teal,
  palette.gray500,
] as const;

/**
 * Stable categorical colors for a list of clients (color follows the entity's
 * position in the sorted list, not its rank). Capped at the palette length.
 */
export function clientColors(clients: string[]): string[] {
  return clients.map((_, i) => categorical[i % categorical.length]);
}

/**
 * Best-effort mapping from common Azure DevOps states to a semantic color so
 * "Done" is green, "Active" blue, etc. Falls back to the categorical palette.
 */
export function colorForState(state: string, index: number): string {
  const key = state.toLowerCase();
  if (['done', 'closed', 'completed', 'resolved'].includes(key)) return palette.success;
  if (['active', 'in progress', 'committed', 'doing'].includes(key)) return palette.primary;
  if (['new', 'proposed', 'to do', 'approved'].includes(key)) return palette.gray500;
  if (['blocked', 'removed'].includes(key)) return palette.danger;
  return categorical[index % categorical.length];
}
