export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-MX').format(value);
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    date,
  );
}

/** Short iteration label: last path segment (e.g. "Project\\Sprint 12" -> "Sprint 12"). */
export function shortIteration(pathOrName: string): string {
  const parts = pathOrName.split('\\');
  return parts[parts.length - 1] || pathOrName;
}

/** Formats an ISO month "YYYY-MM" as a short localized label, e.g. "ago 2026". */
export function formatMonth(isoMonth: string): string {
  const [year, month] = isoMonth.split('-').map(Number);
  if (!year || !month) return isoMonth;
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric' }).format(date);
}
