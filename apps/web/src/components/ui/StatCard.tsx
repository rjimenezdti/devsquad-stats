import type { Icon } from 'react-feather';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: Icon;
  /** Optional trend, e.g. { value: '+5.2%', direction: 'up', label: 'vs sprint anterior' } */
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; label?: string };
}

export function StatCard({ title, value, icon: IconCmp, delta }: StatCardProps) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="row">
          <div className="col mt-0">
            <h5 className="card-title">{title}</h5>
          </div>
          <div className="col-auto">
            <div className="stat text-primary">
              <IconCmp className="align-middle" size={18} />
            </div>
          </div>
        </div>
        <div className="h1 mt-1 mb-3">{value}</div>
        {delta && (
          <div className="mb-0">
            <span
              className={
                delta.direction === 'up'
                  ? 'text-success'
                  : delta.direction === 'down'
                    ? 'text-danger'
                    : 'text-muted'
              }
            >
              {delta.value}
            </span>{' '}
            {delta.label && <span className="text-muted">{delta.label}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
