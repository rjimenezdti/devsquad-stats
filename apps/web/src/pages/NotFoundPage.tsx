import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="text-center py-6">
      <h1 className="display-1 fw-bold text-primary">404</h1>
      <p className="h3 fw-normal mt-3 mb-4">Página no encontrada</p>
      <Link to="/" className="btn btn-primary">
        Volver al resumen
      </Link>
    </div>
  );
}
