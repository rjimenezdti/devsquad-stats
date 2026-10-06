import { useMemo } from 'react';
import { useProjects, useWorkItems } from '@/features/azure/hooks';
import { SOURCE } from '@/features/azure/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { OverviewContent, DONE_STATES } from '@/pages/OverviewPage';
import { toErrorMessage } from '@/lib/apiClient';
import { palette } from '@/lib/theme';
import type { WorkItemSummary } from '@/types/azure';

/** Tipos considerados para el avance por proyecto (incluye User Story además de PBI/Bug). */
const PROGRESS_TYPES = ['product backlog item', 'bug', 'user story'];

interface ProjectProgress {
  project: string;
  pct: number;
  color: string;
}

/** Color tipo semáforo según el porcentaje de avance. */
function progressColor(pct: number): string {
  if (pct >= 67) return palette.success; // verde
  if (pct >= 34) return palette.warning; // amarillo
  return palette.danger; // rojo
}

/**
 * Avance por proyecto: % = (elementos en estado "done") / total, contando PBI/Bug/
 * User Story. Se listan TODOS los proyectos de la organización (los que no tienen
 * elementos en el alcance quedan en 0%). Orden por nombre ascendente.
 */
function projectProgress(items: WorkItemSummary[], projects: string[]): ProjectProgress[] {
  const byProject = new Map<string, { done: number; total: number }>();
  for (const it of items) {
    if (!PROGRESS_TYPES.includes(it.type.toLowerCase())) continue;
    const acc = byProject.get(it.project) ?? { done: 0, total: 0 };
    acc.total += 1;
    if (DONE_STATES.includes(it.state.toLowerCase())) acc.done += 1;
    byProject.set(it.project, acc);
  }
  return [...projects]
    .sort((a, b) => a.localeCompare(b))
    .map((project) => {
      const { done, total } = byProject.get(project) ?? { done: 0, total: 0 };
      const pct = total ? Math.round((done / total) * 100) : 0;
      return { project, pct, color: progressColor(pct) };
    });
}

function ProjectProgressTable({
  items,
  projects,
}: {
  items: WorkItemSummary[];
  projects: string[];
}) {
  const rows = projectProgress(items, projects);

  return (
    <div className="card flex-fill">
      <div className="card-header">
        <h5 className="card-title mb-0">Avance por proyecto</h5>
      </div>
      {/* overflow:auto habilita scroll lateral y vertical; maxHeight deja ~5 filas visibles. */}
      <div style={{ maxHeight: 285, overflow: 'auto' }}>
        <table className="table table-hover my-0" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              {['Proyecto', 'Avance'].map((h) => (
                <th
                  key={h}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    background: 'var(--bs-body-bg, #fff)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
              <th
                className="text-end"
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  background: 'var(--bs-body-bg, #fff)',
                  whiteSpace: 'nowrap',
                }}
              >
                % Avance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-muted py-3">
                  Sin proyectos.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.project}>
                  <td>{r.project}</td>
                  <td style={{ minWidth: 200 }}>
                    <div className="progress" style={{ height: 8 }}>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        aria-valuenow={r.pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        style={{ width: `${r.pct}%`, backgroundColor: r.color }}
                      />
                    </div>
                  </td>
                  <td className="text-end fw-bold" style={{ color: r.color }}>
                    {r.pct}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * "Todos los proyectos": los mismos reportes que el Resumen pero SIEMPRE
 * consolidados sobre toda la organización (ignora el proyecto del navbar).
 */
export function AllProjectsPage() {
  // Consolidado org-wide (sin filtro de iteración en el backend).
  const workItems = useWorkItems(SOURCE.devprojects, { project: '' });
  // Todos los proyectos de la org (para listarlos aunque no tengan elementos).
  const projects = useProjects(SOURCE.devprojects);

  const projectNames = useMemo(
    () => (projects.data ?? []).map((p) => p.name),
    [projects.data],
  );

  const isLoading = workItems.isLoading || projects.isLoading;
  const isError = workItems.isError || projects.isError;

  return (
    <>
      <PageHeader title="Todos los proyectos" highlight="· Consolidado de la organización" />

      {isLoading && <LoadingState />}
      {isError && <ErrorState message={toErrorMessage(workItems.error ?? projects.error)} />}

      {!isLoading && !isError && workItems.data && (
        <OverviewContent
          wi={workItems.data}
          afterKpis={
            <div className="row">
              <div className="col-12 d-flex">
                <ProjectProgressTable items={workItems.data.items} projects={projectNames} />
              </div>
            </div>
          }
        />
      )}
    </>
  );
}
