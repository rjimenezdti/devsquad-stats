import { AlertTriangle, Inbox } from 'react-feather';

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="state-center">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">{label}</span>
      </div>
      <div>{label}</div>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state-center">
      <AlertTriangle size={28} className="text-danger" />
      <div>
        <div className="fw-bold text-dark">No se pudieron cargar los datos</div>
        <div className="small text-muted">{message}</div>
      </div>
    </div>
  );
}

export function EmptyState({ message = 'Sin datos para mostrar' }: { message?: string }) {
  return (
    <div className="state-center">
      <Inbox size={28} className="text-muted" />
      <div>{message}</div>
    </div>
  );
}
