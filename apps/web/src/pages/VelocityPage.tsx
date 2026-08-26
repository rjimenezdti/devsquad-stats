import { TrendingUp, Target, CheckSquare, Percent, Grid } from 'react-feather';
import { useVelocity, useVelocityOverview } from '@/features/azure/hooks';
import { SOURCE } from '@/features/azure/api';
import { useSelectedProject } from '@/features/project/ProjectContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { toErrorMessage } from '@/lib/apiClient';
import { palette, categorical } from '@/lib/theme';
import { formatNumber, formatPercent, formatDate, shortIteration } from '@/lib/format';
import type { VelocityOverview, VelocityReport } from '@/types/azure';

export function VelocityPage() {
  const { selectedProject } = useSelectedProject();
  const allProjects = !selectedProject;

  return (
    <>
      <PageHeader title="Velocity" highlight="& Burndown">
        <span className="badge bg-primary-subtle text-primary fs-6">
          {selectedProject || 'Todos los proyectos'}
        </span>
      </PageHeader>

      {allProjects ? <OverviewView /> : <ProjectView project={selectedProject} />}
    </>
  );
}

/* ------------------------------ Org-wide view ------------------------------ */

function OverviewView() {
  const { data, isLoading, isError, error } = useVelocityOverview(SOURCE.devprojects);

  if (isLoading) return <LoadingState label="Calculando velocity por proyecto…" />;
  if (isError) return <ErrorState message={toErrorMessage(error)} />;
  if (!data || data.projects.length === 0)
    return <EmptyState message="Ningún proyecto tiene sprints con datos de velocity." />;

  return <OverviewContent data={data} />;
}

function OverviewContent({ data }: { data: VelocityOverview }) {
  const totalAvg = data.projects.reduce((s, p) => s + p.averageVelocity, 0);
  const topProjects = data.projects.slice(0, 15);

  return (
    <>
      <div className="row">
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard title="Proyectos con velocity" value={formatNumber(data.projects.length)} icon={Grid} />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard
            title="Velocity total (org)"
            value={`${formatNumber(totalAvg)} pts`}
            icon={TrendingUp}
            delta={{ value: 'promedio combinado por sprint', direction: 'flat' }}
          />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard
            title="Mejor proyecto"
            value={`${formatNumber(data.projects[0]?.averageVelocity ?? 0)} pts`}
            icon={CheckSquare}
            delta={{ value: data.projects[0]?.project ?? '—', direction: 'up' }}
          />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard title="Sin datos" value={formatNumber(data.skipped.length)} icon={Target} />
        </div>
      </div>

      <div className="row">
        <div className="col-12 d-flex">
          <ChartCard
            title="Velocity promedio por proyecto"
            subtitle="Story points completados (promedio de los últimos sprints)"
          >
            <ColumnChart
              categories={topProjects.map((p) => p.project)}
              series={[{ name: 'Velocity promedio', data: topProjects.map((p) => p.averageVelocity) }]}
              colors={[categorical[0]]}
              horizontal
              height={Math.max(280, topProjects.length * 34)}
              yTitle="Story Points"
            />
          </ChartCard>
        </div>
      </div>

      <div className="row">
        <div className="col-12 d-flex">
          <div className="card flex-fill">
            <div className="card-header">
              <h5 className="card-title mb-0">Detalle por proyecto</h5>
            </div>
            <div className="table-responsive">
              <table className="table table-hover my-0">
                <thead>
                  <tr>
                    <th>Proyecto</th>
                    <th className="text-end">Velocity promedio</th>
                    <th className="d-none d-md-table-cell">Último sprint</th>
                    <th className="text-end">Completado</th>
                    <th className="text-end">Planificado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((p) => (
                    <tr key={p.project}>
                      <td>{p.project}</td>
                      <td className="text-end">{formatNumber(p.averageVelocity)}</td>
                      <td className="d-none d-md-table-cell">
                        {p.lastSprintName ? shortIteration(p.lastSprintName) : '—'}
                      </td>
                      <td className="text-end">{formatNumber(p.lastSprintCompleted)}</td>
                      <td className="text-end">{formatNumber(p.lastSprintPlanned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.skipped.length > 0 && (
              <div className="card-footer text-muted small">
                Sin sprints/velocity: {data.skipped.join(', ')}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------- Single-project view --------------------------- */

function ProjectView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useVelocity(SOURCE.devprojects, project);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={toErrorMessage(error)} />;
  if (!data || data.sprints.length === 0)
    return (
      <EmptyState message="No hay sprints con datos. Verifica que el equipo tenga iteraciones configuradas." />
    );

  return <ProjectContent data={data} />;
}

function ProjectContent({ data }: { data: VelocityReport }) {
  const last = data.sprints[data.sprints.length - 1];
  const completionRate = last && last.planned > 0 ? last.completed / last.planned : 0;
  const categories = data.sprints.map((s) => shortIteration(s.iterationName));

  return (
    <>
      <div className="row">
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard title="Velocity promedio" value={`${formatNumber(data.averageVelocity)} pts`} icon={TrendingUp} />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard title="Planificado (último)" value={`${formatNumber(last.planned)} pts`} icon={Target} />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard title="Completado (último)" value={`${formatNumber(last.completed)} pts`} icon={CheckSquare} />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard
            title="% Cumplimiento"
            value={formatPercent(completionRate)}
            icon={Percent}
            delta={{
              value: `${formatNumber(last.incomplete)} pts`,
              direction: last.incomplete > 0 ? 'down' : 'up',
              label: 'sin completar',
            }}
          />
        </div>
      </div>

      <div className="row">
        <div className="col-12 d-flex">
          <ChartCard title="Velocity por sprint" subtitle="Story points planificados vs. completados">
            <ColumnChart
              categories={categories}
              series={[
                { name: 'Planificado', data: data.sprints.map((s) => s.planned) },
                { name: 'Completado', data: data.sprints.map((s) => s.completed) },
              ]}
              colors={[palette.gray300, palette.primary]}
              height={340}
              yTitle="Story Points"
            />
          </ChartCard>
        </div>
      </div>

      <div className="row">
        <div className="col-12 d-flex">
          <div className="card flex-fill">
            <div className="card-header">
              <h5 className="card-title mb-0">Detalle por sprint</h5>
            </div>
            <div className="table-responsive">
              <table className="table table-hover my-0">
                <thead>
                  <tr>
                    <th>Sprint</th>
                    <th className="d-none d-md-table-cell">Inicio</th>
                    <th className="d-none d-md-table-cell">Fin</th>
                    <th className="text-end">Planificado</th>
                    <th className="text-end">Completado</th>
                    <th className="text-end">% Cumplimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.sprints].reverse().map((s) => (
                    <tr key={s.iterationPath}>
                      <td>{shortIteration(s.iterationName)}</td>
                      <td className="d-none d-md-table-cell">{formatDate(s.startDate)}</td>
                      <td className="d-none d-md-table-cell">{formatDate(s.finishDate)}</td>
                      <td className="text-end">{formatNumber(s.planned)}</td>
                      <td className="text-end">{formatNumber(s.completed)}</td>
                      <td className="text-end">{formatPercent(s.planned > 0 ? s.completed / s.planned : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
