import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, action, children, className }: ChartCardProps) {
  return (
    <div className={`card flex-fill w-100${className ? ` ${className}` : ''}`}>
      <div className="card-header d-flex justify-content-between align-items-start">
        <div>
          <h5 className="card-title mb-0">{title}</h5>
          {subtitle && <p className="card-subtitle text-muted mt-1 mb-0 small">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="card-body py-3">{children}</div>
    </div>
  );
}
