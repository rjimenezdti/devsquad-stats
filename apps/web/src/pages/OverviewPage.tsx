import { Link } from 'react-router-dom';
import { Layers, CheckCircle, TrendingUp, AlertCircle } from 'react-feather';
import { useVelocity, useVelocityOverview, useWorkItems } from '@/features/azure/hooks';
import { SOURCE } from '@/features/azure/api';
import { useSelectedProject } from '@/features/project/ProjectContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { DonutChart } from '@/components/charts/DonutChart';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { toErrorMessage } from '@/lib/apiClient';
import { colorForState, palette, categorical } from '@/lib/theme';
import { formatNumber, formatPercent, shortIteration } from '@/lib/format';
import type { VelocityOverview, VelocityReport, WorkItemsReport } from '@/types/azure';

const DONE_STATES = ['done', 'closed', 'completed', 'resolved'];

export function OverviewPage() {
  const { selectedProject } = useSelectedProject();
  const allProjects = !selectedProject;

  const workItems = useWorkItems(SOURCE.devprojects, { project: selectedProject });
  const velocity = useVelocity(SOURCE.devprojects, selectedProject); // enabled only when a project is set
  const overview = useVelocityOverview(SOURCE.devprojects, undefined, allProjects); // all-projects only

  const isLoading =
    workItems.isLoading || (allProjects ? overview.isLoading : velocity.isLoading);
  const isError = workItems.isError || (allProjects ? overview.isError : velocity.isError);

  return (
    <>
      <PageHeader title="Resumen" highlight={selectedProject ? `· ${selectedProject}` : '· Toda la organización'} />

      {isLoading && <LoadingState />}
      {isError && (
        <ErrorState
          message={toErrorMessage(workItems.error ?? overview.error ?? velocity.error)}
        />
      )}

      {!isLoading && !isError && workItems.data && (
        <OverviewContent
          wi={workItems.data}
          allProjects={allProjects}
          overview={overview.data}
          velocity={velocity.data}
        />
      )}
    </>
  );
}

function OverviewContent({
  wi,
  allProjects,
  overview,
  velocity,
}: {
  wi: WorkItemsReport;
  allProjects: boolean;
  overview?: VelocityOverview;
  velocity?: VelocityReport;
}) {
  const done = wi.byState
    .filter((b) => DONE_STATES.includes(b.key.toLowerCase()))
    .reduce((s, b) => s + b.count, 0);
  const bugs = wi.byType.find((b) => b.key.toLowerCase() === 'bug')?.count ?? 0;

  const stateLabels = wi.byState.map((b) => b.key);
  const stateSeries = wi.byState.map((b) => b.count);
  const stateColors = wi.byState.map((b, i) => colorForState(b.key, i));

  const avgVelocity = allProjects
    ? (overview?.projects.reduce((s, p) => s + p.averageVelocity, 0) ?? 0)
    : (velocity?.averageVelocity ?? 0);

  const topProjects = overview?.projects.slice(0, 12) ?? [];

  return (
    <>
      <div className="row">
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard title="Total work items" value={formatNumber(wi.total)} icon={Layers} />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard
            title="Completados"
            value={formatPercent(wi.total ? done / wi.total : 0)}
            icon={CheckCircle}
            delta={{ value: `${formatNumber(done)}`, direction: 'up', label: 'items' }}
          />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard
            title={allProjects ? 'Velocity total (org)' : 'Velocity promedio'}
            value={`${formatNumber(avgVelocity)} pts`}
            icon={TrendingUp}
          />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <StatCard title="Bugs" value={formatNumber(bugs)} icon={AlertCircle} />
        </div>
      </div>

      <div className="row">
        <div className="col-12 col-lg-5 d-flex">
          <ChartCard
            title="Work items por estado"
            action={
              <Link to="/work-items" className="btn btn-sm btn-outline-primary">
                Ver detalle
              </Link>
            }
          >
            <DonutChart labels={stateLabels} series={stateSeries} colors={stateColors} />
          </ChartCard>
        </div>
        <div className="col-12 col-lg-7 d-flex">
          {allProjects ? (
            <ChartCard
              title="Velocity por proyecto"
              subtitle="Promedio de story points por sprint"
              action={
                <Link to="/velocity" className="btn btn-sm btn-outline-primary">
                  Ver detalle
                </Link>
              }
            >
              {topProjects.length > 0 ? (
                <ColumnChart
                  categories={topProjects.map((p) => p.project)}
                  series={[{ name: 'Velocity promedio', data: topProjects.map((p) => p.averageVelocity) }]}
                  colors={[categorical[0]]}
                  horizontal
                  height={Math.max(260, topProjects.length * 30)}
                />
              ) : (
                <div className="state-center">Sin datos de velocity</div>
              )}
            </ChartCard>
          ) : (
            <ChartCard
              title="Velocity por sprint"
              subtitle="Planificado vs. completado"
              action={
                <Link to="/velocity" className="btn btn-sm btn-outline-primary">
                  Ver detalle
                </Link>
              }
            >
              <ColumnChart
                categories={(velocity?.sprints ?? []).map((s) => shortIteration(s.iterationName))}
                series={[
                  { name: 'Planificado', data: (velocity?.sprints ?? []).map((s) => s.planned) },
                  { name: 'Completado', data: (velocity?.sprints ?? []).map((s) => s.completed) },
                ]}
                colors={[palette.gray300, palette.primary]}
                height={260}
                dataLabels={false}
              />
            </ChartCard>
          )}
        </div>
      </div>
    </>
  );
}
