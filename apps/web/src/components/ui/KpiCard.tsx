import type { CSSProperties } from 'react';
import type { Icon } from 'react-feather';
import { palette } from '@/lib/theme';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: Icon;
  /** Accent color (hex). Defaults to the theme primary. */
  accent?: string;
  /** Optional small pill under the value. */
  hint?: { text: string; tone?: 'up' | 'down' | 'neutral' };
}

/** Professional KPI tile: label, big value, tinted icon badge and an accent strip. */
export function KpiCard({ label, value, icon: IconCmp, accent = palette.primary, hint }: KpiCardProps) {
  const style = { '--kpi-accent': accent } as CSSProperties;
  const hintClass =
    hint?.tone === 'up' ? 'kpi-hint is-up' : hint?.tone === 'down' ? 'kpi-hint is-down' : 'kpi-hint';

  return (
    <div className="card kpi-card w-100" style={style}>
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start">
          <div className="me-2">
            <div className="kpi-label mb-2">{label}</div>
            <div className="kpi-value">{value}</div>
          </div>
          <div className="kpi-icon">
            <IconCmp size={22} />
          </div>
        </div>
        {hint && (
          <div className="mt-3">
            <span className={hintClass}>{hint.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}
