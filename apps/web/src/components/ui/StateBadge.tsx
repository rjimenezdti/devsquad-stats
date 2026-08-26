interface StateBadgeProps {
  state: string;
}

function badgeClass(state: string): string {
  const key = state.toLowerCase();
  if (['done', 'closed', 'completed', 'resolved'].includes(key)) return 'bg-success';
  if (['active', 'in progress', 'committed', 'doing'].includes(key)) return 'bg-primary';
  if (['new', 'proposed', 'to do', 'approved'].includes(key)) return 'bg-secondary';
  if (['blocked', 'removed'].includes(key)) return 'bg-danger';
  return 'bg-info';
}

export function StateBadge({ state }: StateBadgeProps) {
  return <span className={`badge ${badgeClass(state)}`}>{state}</span>;
}
