import { useState } from 'react';
import { Layers, Circle, CheckCircle, Users, Calendar, X } from 'react-feather';
import { useUserStories, useMeta } from '@/features/azure/hooks';
import { SOURCE } from '@/features/azure/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { DonutChart } from '@/components/charts/DonutChart';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { toErrorMessage } from '@/lib/apiClient';
import { palette, clientColors } from '@/lib/theme';
import { formatNumber, formatPercent, formatMonth } from '@/lib/format';
import type { ClientStoryCount, MonthClientMatrix, UserStoriesReport } from '@/types/azure';

/** Max clients shown in a chart before the rest fold into "Otros". */
const TOP_CLIENTS_BAR = 15;
const TOP_CLIENTS_STACK = 8;

export function ClientsPage() {
  const [createdFrom, setCreatedFrom] = useState('');
  const [closedFrom, setClosedFrom] = useState('');

  const { data, isLoading, isFetching, isError, error } = useUserStories(SOURCE.keytia, {
    createdFrom,
    closedFrom,
  });
  const { data: meta } = useMeta(SOURCE.keytia);

  const hasFilters = Boolean(createdFrom || closedFrom);

  return (
    <>
      <PageHeader title="Keytia" highlight="· User Stories por Cliente">
        <span className="badge bg-primary-subtle text-primary fs-6">
          {meta?.defaultProject ? `Proyecto: ${meta.defaultProject}` : 'Organización Keytia'}
        </span>
      </PageHeader>

      <FilterBar
        createdFrom={createdFrom}
        closedFrom={closedFrom}
        onCreatedFrom={setCreatedFrom}
        onClosedFrom={setClosedFrom}
        onClear={() => {
          setCreatedFrom('');
          setClosedFrom('');
        }}
        hasFilters={hasFilters}
        busy={isFetching}
      />

      {isLoading && <LoadingState label="Consultando user stories de Keytia…" />}
      {isError && <ErrorState message={toErrorMessage(error)} />}
      {data && data.totalStories === 0 && (
        <EmptyState
          message={
            hasFilters
              ? 'No hay user stories que cumplan los filtros de fecha seleccionados.'
              : 'No se encontraron user stories en KeytiaDev Backlog.'
          }
        />
      )}
      {data && data.totalStories > 0 && <ClientsContent data={data} />}
    </>
  );
}

interface FilterBarProps {
  createdFrom: string;
  closedFrom: string;
  onCreatedFrom: (v: string) => void;
  onClosedFrom: (v: string) => void;
  onClear: () => void;
  hasFilters: boolean;
  busy: boolean;
}

function FilterBar({
  createdFrom,
  closedFrom,
  onCreatedFrom,
  onClosedFrom,
  onClear,
  hasFilters,
  busy,
}: FilterBarProps) {
  return (
    <div className="card filter-bar mb-3">
      <div className="card-body py-3">
        <div className="d-flex flex-wrap align-items-end gap-3">
          <div className="filter-field">
            <label htmlFor="createdFrom" className="filter-label">
              <Calendar size={12} className="me-1" />
              Creadas desde
            </label>
            <input
              id="createdFrom"
              type="date"
              className="form-control form-control-sm"
              value={createdFrom}
              max={closedFrom || undefined}
              onChange={(e) => onCreatedFrom(e.target.value)}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="closedFrom" className="filter-label">
              <Calendar size={12} className="me-1" />
              Entregadas (cerradas) desde
            </label>
            <input
              id="closedFrom"
              type="date"
              className="form-control form-control-sm"
              value={closedFrom}
              onChange={(e) => onClosedFrom(e.target.value)}
            />
          </div>

          {hasFilters && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClear}>
              <X size={14} className="me-1" />
              Limpiar
            </button>
          )}

          {busy && (
            <span className="text-muted small d-inline-flex align-items-center gap-1">
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              Actualizando…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Keeps the top `n` clients by total and folds the rest into a single "Otros". */
function capByClient(rows: ClientStoryCount[], n: number): ClientStoryCount[] {
  if (rows.length <= n) return rows;
  const top = rows.slice(0, n);
  const otros = rows.slice(n).reduce(
    (acc, c) => ({
      client: 'Otros',
      open: acc.open + c.open,
      resolved: acc.resolved + c.resolved,
      total: acc.total + c.total,
    }),
    { client: 'Otros', open: 0, resolved: 0, total: 0 },
  );
  return [...top, otros];
}

/** Caps the stacked month×client matrix to the top `n` clients by open volume. */
function capMatrix(matrix: MonthClientMatrix, n: number): MonthClientMatrix {
  if (matrix.series.length <= n) return matrix;
  const withTotals = matrix.series.map((s) => ({ s, total: s.data.reduce((a, b) => a + b, 0) }));
  withTotals.sort((a, b) => b.total - a.total);
  const top = withTotals.slice(0, n).map((x) => x.s);
  const rest = withTotals.slice(n).map((x) => x.s);
  const otros = {
    client: 'Otros',
    data: matrix.months.map((_, i) => rest.reduce((sum, s) => sum + s.data[i], 0)),
  };
  return { months: matrix.months, series: [...top, otros] };
}

function ClientsContent({ data }: { data: UserStoriesReport }) {
  const resolvedRate = data.totalStories ? data.totalResolved / data.totalStories : 0;

  const barClients = capByClient(data.byClient, TOP_CLIENTS_BAR);
  const matrix = capMatrix(data.openByMonthByClient, TOP_CLIENTS_STACK);
  const monthCats = matrix.months.map(formatMonth);
  const monthSeries = matrix.series.map((s) => ({ name: s.client, data: s.data }));
  const monthColors = clientColors(matrix.series.map((s) => s.client));

  return (
    <>
      {/* KPIs */}
      <div className="row">
        <div className="col-sm-6 col-xxl-3 d-flex">
          <KpiCard label="User stories" value={formatNumber(data.totalStories)} icon={Layers} accent={palette.primary} />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <KpiCard
            label="Abiertas"
            value={formatNumber(data.totalOpen)}
            icon={Circle}
            accent={palette.warning}
            hint={{ text: `${formatPercent(data.totalStories ? data.totalOpen / data.totalStories : 0)} del total` }}
          />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <KpiCard
            label="Resueltas"
            value={formatNumber(data.totalResolved)}
            icon={CheckCircle}
            accent={palette.success}
            hint={{ text: `${formatPercent(resolvedRate)} del total`, tone: 'up' }}
          />
        </div>
        <div className="col-sm-6 col-xxl-3 d-flex">
          <KpiCard label="Clientes" value={formatNumber(data.byClient.length)} icon={Users} accent={palette.purple} />
        </div>
      </div>

      {/* Abierto vs Resuelto + Por cliente */}
      <div className="row">
        <div className="col-12 col-lg-4 d-flex">
          <ChartCard title="Abiertas vs. Resueltas">
            <DonutChart
              labels={['Abiertas', 'Resueltas']}
              series={[data.totalOpen, data.totalResolved]}
              colors={[palette.warning, palette.success]}
              centerLabel="Total"
            />
          </ChartCard>
        </div>
        <div className="col-12 col-lg-8 d-flex">
          <ChartCard
            title="User stories por cliente"
            subtitle={`Top ${TOP_CLIENTS_BAR} por volumen (abiertas vs. resueltas)`}
          >
            <ColumnChart
              categories={barClients.map((c) => c.client)}
              series={[
                { name: 'Abiertas', data: barClients.map((c) => c.open) },
                { name: 'Resueltas', data: barClients.map((c) => c.resolved) },
              ]}
              colors={[palette.warning, palette.success]}
              stacked
              horizontal
              dataLabels={false}
              height={Math.max(320, barClients.length * 34)}
            />
          </ChartCard>
        </div>
      </div>

      {/* Finalizadas por mes */}
      <div className="row">
        <div className="col-12 d-flex">
          <ChartCard title="User stories finalizadas por mes" subtitle="Resueltas por mes de cierre">
            <ColumnChart
              categories={data.finishedByMonth.map((m) => formatMonth(m.month))}
              series={[{ name: 'Finalizadas', data: data.finishedByMonth.map((m) => m.count) }]}
              colors={[palette.success]}
              height={300}
              dataLabels={false}
              yTitle="User stories"
            />
          </ChartCard>
        </div>
      </div>

      {/* Abiertas por mes y por cliente (stacked) */}
      <div className="row">
        <div className="col-12 d-flex">
          <ChartCard
            title="User stories abiertas por mes y por cliente"
            subtitle="Creadas por mes, apiladas por cliente"
          >
            {monthCats.length > 0 ? (
              <ColumnChart
                categories={monthCats}
                series={monthSeries}
                colors={monthColors}
                stacked
                dataLabels={false}
                height={340}
                yTitle="Abiertas"
              />
            ) : (
              <div className="state-center">Sin user stories abiertas.</div>
            )}
          </ChartCard>
        </div>
      </div>

      {/* Tabla resumen por cliente (completa) */}
      <div className="row">
        <div className="col-12 d-flex">
          <div className="card flex-fill">
            <div className="card-header">
              <h5 className="card-title mb-0">Resumen por cliente ({data.byClient.length})</h5>
            </div>
            <div className="table-responsive">
              <table className="table table-hover my-0">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="text-end">Abiertas</th>
                    <th className="text-end">Resueltas</th>
                    <th className="text-end">Total</th>
                    <th className="text-end">% Resuelto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byClient.map((c) => (
                    <tr key={c.client}>
                      <td>{c.client}</td>
                      <td className="text-end">{formatNumber(c.open)}</td>
                      <td className="text-end">{formatNumber(c.resolved)}</td>
                      <td className="text-end">{formatNumber(c.total)}</td>
                      <td className="text-end">
                        {formatPercent(c.total ? c.resolved / c.total : 0)}
                      </td>
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
