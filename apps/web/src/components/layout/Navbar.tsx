import { RefreshCw } from 'react-feather';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useMeta } from '@/features/azure/hooks';
import { SOURCE } from '@/features/azure/api';
import { ProjectSelector } from '@/features/project/ProjectSelector';

interface NavbarProps {
  onToggleSidebar: () => void;
}

export function Navbar({ onToggleSidebar }: NavbarProps) {
  const { data: meta } = useMeta(SOURCE.devprojects);
  const queryClient = useQueryClient();
  const location = useLocation();
  // The project selector scopes the team-projects dashboards; hide it on Keytia
  // and on "Todos los proyectos" (that dashboard is always org-wide).
  const showProjectSelector =
    !location.pathname.startsWith('/keytia') &&
    !location.pathname.startsWith('/all-projects');

  return (
    <nav className="navbar navbar-expand navbar-light navbar-bg">
      <button
        type="button"
        className="sidebar-toggle js-sidebar-toggle btn btn-link p-0 border-0"
        onClick={onToggleSidebar}
        aria-label="Alternar menú"
      >
        <i className="hamburger align-self-center" />
      </button>

      <div className="navbar-collapse collapse">
        <ul className="navbar-nav navbar-align align-items-center gap-2">
          {meta && (
            <li className="nav-item d-none d-md-block">
              <span className="text-muted small">
                Organización: <strong className="text-dark">{meta.org}</strong>
              </span>
            </li>
          )}
          {showProjectSelector && (
            <li className="nav-item">
              <ProjectSelector />
            </li>
          )}
          <li className="nav-item">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary d-inline-flex align-items-center"
              onClick={() => queryClient.invalidateQueries()}
            >
              <RefreshCw size={14} className="me-1" /> Actualizar
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
