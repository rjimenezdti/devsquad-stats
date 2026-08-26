import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  highlight?: string;
  children?: ReactNode;
}

export function PageHeader({ title, highlight, children }: PageHeaderProps) {
  return (
    <div className="d-flex justify-content-between align-items-center flex-wrap mb-3">
      <h1 className="h3 mb-0">
        <strong>{title}</strong>
        {highlight ? ` ${highlight}` : ''}
      </h1>
      {children}
    </div>
  );
}
