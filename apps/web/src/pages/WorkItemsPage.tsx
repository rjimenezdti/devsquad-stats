import { Layers, CheckCircle, Activity, AlertCircle } from 'react-feather';
import { useWorkItems } from '@/features/azure/hooks';
import { SOURCE } from '@/features/azure/api';
import { useSelectedProject } from '@/features/project/ProjectContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { StateBadge } from '@/components/ui/StateBadge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { DonutChart } from '@/components/charts/DonutChart';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { toErrorMessage } from '@/lib/apiClient';
import { colorForState, categorical } from '@/lib/theme';
import { formatNumber, formatPercent } from '@/lib/format';

const DONE_STATES = ['done', 'closed', 'completed', 'resolved'];
const ACTIVE_STATES = ['active', 'in progress', 'committed', 'doing'];

export function WorkItemsPage() {
  const { selectedProject } = useSelectedProject();
  const { data, isLoading, isError, error } = useWorkItems(SOURCE.devprojects, {
    project: selectedProject,
  });

  const scope = selectedProject || 'Todos los proyectos';

  return (
    <>
      <PageHeader title="Work Items" highlight="por estado">
        <span className="badge bg-primary-subtle text-primary fs-6">{scope}</span>
      </PageHeader>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message={toErrorMessage(error)} />}
      {data && data.total === 0 && <EmptyState message="No hay work items para el alcance seleccionado." />}
      {data && data.total > 0 && <WorkItemsContent data={data} allProjects={!selectedProject} />}
    </>
  );
}

function WorkItemsContent({
  data,
  allProjects,
}: {
  data: NonNullable<ReturnType<typeof useWorkItems>['data']>;
  allProjects: boolean;
}) {
  const done = data.byState
    .filter((b) => DONE_STATES.includes(b.key.toLowerCase()))
    .reduce((s, b) => s + b.count, 0);
  const active = data.byState
    .filter((b) => ACTIVE_STATES.includes(b.key.toLowerCase()))
    .reduce((s, b) => s + b.count, 0);
  const bugs = data.byType.find((b) => b.key.toLowerCase() === 'bug')?.count ?? 0;

  const stateLabels = data.byState.map((b) => b.key);
  const stateSeries = data.byState.map((b) => b.count);
  const stateColors = data.byState.map((b, i) => colorForState(b.key, i));

  const topAssignees = data.byAssignee.slice(0, 10);
  const topProjects = data.byProject.slice(0, 12);

  return (
    <>
      <div className="row">
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard title="Total work items" value={formatNumber(data.total)} icon={Layers} />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard
            title="Completados"
            value={formatNumber(done)}
            icon={CheckCircle}
            delta={{ value: formatPercent(data.total ? done / data.total : 0), direction: 'up', label: 'del total' }}
          />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard title="En progreso" value={formatNumber(active)} icon={Activity} />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard title="Bugs" value={formatNumber(bugs)} icon={AlertCircle} />
        </div>
      </div>

      <div className="row">
        <div className="col-12 col-lg-5 d-flex">
          <ChartCard title="Distribución por estado">
            <DonutChart labels={stateLabels} series={stateSeries} colors={stateColors} centerLabel="Total" />
          </ChartCard>
        </div>
        <div className="col-12 col-lg-7 d-flex">
          <ChartCard title="Carga por responsable" subtitle="Top 10 por número de work items">
            <ColumnChart
              categories={topAssignees.map((a) => a.key)}
              series={[{ name: 'Work items', data: topAssignees.map((a) => a.count) }]}
              colors={[categorical[0]]}
              horizontal
              height={340}
            />
          </ChartCard>
        </div>
      </div>

      {allProjects && topProjects.length > 1 && (
        <div className="row">
          <div className="col-12 d-flex">
            <ChartCard title="Work items por proyecto" subtitle="Distribución en toda la organización">
              <ColumnChart
                categories={topProjects.map((p) => p.key)}
                series={[{ name: 'Work items', data: topProjects.map((p) => p.count) }]}
                colors={[categorical[1]]}
                height={320}
              />
            </ChartCard>
          </div>
        </div>
      )}

      <div className="row">
        <div className="col-12 d-flex">
          <div className="card flex-fill">
            <div className="card-header">
              <h5 className="card-title mb-0">Detalle de work items</h5>
            </div>
            <div className="table-responsive">
              <table className="table table-hover my-0">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Título</th>
                    {allProjects && <th className="d-none d-lg-table-cell">Proyecto</th>}
                    <th className="d-none d-md-table-cell">Tipo</th>
                    <th>Estado</th>
                    <th className="d-none d-lg-table-cell">Responsable</th>
                    <th className="text-end">Story Points</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.slice(0, 50).map((item) => (
                    <tr key={item.id}>
                      <td className="text-muted">#{item.id}</td>
                      <td>{item.title}</td>
                      {allProjects && <td className="d-none d-lg-table-cell">{item.project}</td>}
                      <td className="d-none d-md-table-cell">{item.type}</td>
                      <td>
                        <StateBadge state={item.state} />
                      </td>
                      <td className="d-none d-lg-table-cell">{item.assignedTo}</td>
                      <td className="text-end">{item.storyPoints ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.items.length > 50 && (
              <div className="card-footer text-muted small">
                Mostrando 50 de {formatNumber(data.items.length)} work items.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
