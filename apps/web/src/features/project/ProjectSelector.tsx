import { useProjects } from '@/features/azure/hooks';
import { SOURCE } from '@/features/azure/api';
import { useSelectedProject } from './ProjectContext';

/** Dropdown in the navbar that scopes every dashboard to one project or all. */
export function ProjectSelector() {
  const { data: projects, isLoading } = useProjects(SOURCE.devprojects);
  const { selectedProject, setSelectedProject } = useSelectedProject();

  return (
    <select
      className="form-select form-select-sm"
      style={{ minWidth: 200 }}
      value={selectedProject}
      onChange={(e) => setSelectedProject(e.target.value)}
      disabled={isLoading}
      aria-label="Seleccionar proyecto"
    >
      <option value="">Todos los proyectos</option>
      {projects?.map((p) => (
        <option key={p.id} value={p.name}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
