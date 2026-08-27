import { useState } from 'react';
import {
  Layers,
  Clock,
  AlertCircle,
  Calendar,
  X,
  AlertTriangle,
  AlertOctagon,
  Filter,
} from 'react-feather';
import { useUserStories } from '@/features/azure/hooks';
import { SOURCE } from '@/features/azure/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { DonutChart } from '@/components/charts/DonutChart';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { toErrorMessage } from '@/lib/apiClient';
import { differenceInCalendarDays } from 'date-fns';
import { palette } from '@/lib/theme';
import { formatNumber, formatDate } from '@/lib/format';
import type {
  ClientStoryCount,
  ClientTypeMatrix,
  StoryListItem,
  UserStoriesReport,
} from '@/types/azure';

/** Max clients shown in a chart before the rest fold into "Otros". */
const TOP_CLIENTS_BAR = 6;
const TOP_CLIENTS_DONUT = 7;

/** Palette shared by "Abiertas por cliente" (donut) and "Requerimientos por cliente". */
const REQ_TYPE_PALETTE = [
  '#36566d',
  '#357988',
  '#afc5a1',
  '#fdcd7b',
  '#8f4953',
  '#7a825d',
  '#3a584a',
  '#62808a',
  '#203740',
  '#aedbda',
];

export function ClientsPage() {
  const [createdFrom, setCreatedFrom] = useState('');
  const [category, setCategory] = useState<Category>('all');

  const { data, isLoading, isFetching, isError, error } = useUserStories(SOURCE.keytia, {
    createdFrom,
    category,
  });

  const hasFilters = Boolean(createdFrom) || category !== 'all';

  return (
    <>
      <PageHeader title="Keytia" highlight="· User Stories por Cliente" />

      <FilterBar
        createdFrom={createdFrom}
        onCreatedFrom={setCreatedFrom}
        category={category}
        onCategory={setCategory}
        onClear={() => {
          setCreatedFrom('');
          setCategory('all');
        }}
        hasFilters={hasFilters}
        busy={isFetching}
      />

      {isLoading && <LoadingState label="Consultando user stories de Keytia…" />}
      {isError && <ErrorState message={toErrorMessage(error)} />}
      {data && data.totalOpen === 0 && (
        <EmptyState
          message={
            hasFilters
              ? 'No hay elementos que cumplan los filtros seleccionados.'
              : 'No se encontraron elementos abiertos en KeytiaDev Backlog.'
          }
        />
      )}
      {data && data.totalOpen > 0 && <ClientsContent data={data} />}
    </>
  );
}

/** Element category filter for the listings. */
type Category = 'all' | 'us' | 'bugs';

interface FilterBarProps {
  createdFrom: string;
  onCreatedFrom: (v: string) => void;
  category: Category;
  onCategory: (c: Category) => void;
  onClear: () => void;
  hasFilters: boolean;
  busy: boolean;
}

function FilterBar({
  createdFrom,
  onCreatedFrom,
  category,
  onCategory,
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
              onChange={(e) => onCreatedFrom(e.target.value)}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="category" className="filter-label">
              <Filter size={12} className="me-1" />
              Categoría
            </label>
            <select
              id="category"
              className="form-select form-select-sm"
              value={category}
              onChange={(e) => onCategory(e.target.value as Category)}
            >
              <option value="all">Todos</option>
              <option value="us">User stories</option>
              <option value="bugs">Bugs</option>
            </select>
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

/** Sort by scheduled delivery date ascending; items without a date go last. */
function byScheduledAsc(a: StoryListItem, b: StoryListItem): number {
  if (a.scheduledDate && b.scheduledDate) return a.scheduledDate.localeCompare(b.scheduledDate);
  if (a.scheduledDate) return -1;
  if (b.scheduledDate) return 1;
  return 0;
}

/** Whole calendar days elapsed from an ISO date to today (null date → null). */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return differenceInCalendarDays(new Date(), date);
}

type Semaforo = 'red' | 'yellow' | 'green' | 'none';

/**
 * Traffic light from the scheduled delivery date vs. today:
 * past due → red; within the next 3 days → yellow; further out → green.
 * No scheduled date → none (neutral).
 */
function semaforoFor(scheduledDate: string | null): Semaforo {
  if (!scheduledDate) return 'none';
  const date = new Date(scheduledDate);
  if (Number.isNaN(date.getTime())) return 'none';
  const diff = differenceInCalendarDays(date, new Date());
  if (diff < 0) return 'red';
  if (diff <= 3) return 'yellow';
  return 'green';
}

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  red: palette.danger,
  yellow: palette.warning,
  green: palette.success,
  none: palette.gray300,
};

const SEMAFORO_TITLE: Record<Semaforo, string> = {
  red: 'Entrega vencida',
  yellow: 'Entrega próxima (≤ 3 días)',
  green: 'Entrega lejana (> 3 días)',
  none: 'Sin fecha programada',
};

/**
 * Per-client totals for the distribution donut: top `n` clients (by total) plus
 * an "Otros" slice for the remainder. `byClient` is already sorted by total.
 */
function clientDistribution(rows: ClientStoryCount[], n: number): { client: string; value: number }[] {
  const dist = rows.map((c) => ({ client: c.client, value: c.total }));
  if (dist.length <= n) return dist;
  const otros = dist.slice(n).reduce((sum, c) => sum + c.value, 0);
  return [...dist.slice(0, n), { client: 'Otros', value: otros }];
}

/**
 * Keeps the top `n` clients (already sorted by total) and folds the rest into a
 * single "Otros" column, summing each Tipo series.
 */
function capClientTypeMatrix(matrix: ClientTypeMatrix, n: number): ClientTypeMatrix {
  if (matrix.clients.length <= n) return matrix;
  const clients = [...matrix.clients.slice(0, n), 'Otros'];
  const series = matrix.series.map((s) => ({
    type: s.type,
    data: [...s.data.slice(0, n), s.data.slice(n).reduce((a, b) => a + b, 0)],
  }));
  return { clients, series };
}


/** US + Bugs without a scheduled delivery date: days since creation + author. */
function NoScheduleTable({ items }: { items: StoryListItem[] }) {
  return (
    <div className="card flex-fill">
      <div className="card-header">
        <h5 className="card-title mb-0">Requerimientos sin fecha programada ({items.length})</h5>
      </div>
      <div className="table-responsive item-table-scroll">
        <table className="table table-hover my-0">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Título</th>
              <th>Creado por</th>
              <th className="text-end text-nowrap">Días transcurridos</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted py-3">
                  Sin elementos.
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const days = daysSince(it.createdDate);
                return (
                  <tr key={it.id}>
                    <td>{it.id}</td>
                    <td>{it.client}</td>
                    <td>{it.title}</td>
                    <td>{it.createdBy || '—'}</td>
                    <td className="text-end">{days === null ? '—' : formatNumber(days)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientsContent({ data }: { data: UserStoriesReport }) {
  const typeMatrix = capClientTypeMatrix(data.byClientByType, TOP_CLIENTS_BAR);
  const clientDist = clientDistribution(data.byClient, TOP_CLIENTS_DONUT);
  // Backend already scopes openStories/bugs to the selected category.
  const allItems = [...data.openStories, ...data.bugs];
  const statusItems = allItems.filter((it) => it.scheduledDate).sort(byScheduledAsc);
  const noScheduleItems = allItems
    .filter((it) => !it.scheduledDate)
    .sort((a, b) => (a.createdDate ?? '').localeCompare(b.createdDate ?? ''));

  // Traffic-light counts across all elements (items without a date are neutral).
  let yellowCount = 0;
  let redCount = 0;
  for (const it of allItems) {
    const s = semaforoFor(it.scheduledDate);
    if (s === 'yellow') yellowCount += 1;
    else if (s === 'red') redCount += 1;
  }

  return (
    <>
      {/* KPIs */}
      <div className="row">
        <div className="col-sm-6 col-xl d-flex">
          <KpiCard label="User stories" value={formatNumber(data.totalStories)} icon={Layers} accent={palette.primary} />
        </div>
        <div className="col-sm-6 col-xl d-flex">
          <KpiCard label="Bugs" value={formatNumber(data.totalBugs)} icon={AlertOctagon} accent={palette.orange} />
        </div>
        <div className="col-sm-6 col-xl d-flex">
          <KpiCard
            label="Semáforo amarillo"
            value={formatNumber(yellowCount)}
            icon={Clock}
            accent={palette.warning}
            hint={{ text: 'Entrega ≤ 3 días' }}
          />
        </div>
        <div className="col-sm-6 col-xl d-flex">
          <KpiCard
            label="Semáforo rojo"
            value={formatNumber(redCount)}
            icon={AlertCircle}
            accent={palette.danger}
            hint={{ text: 'Entrega vencida', tone: 'down' }}
          />
        </div>
        <div className="col-sm-6 col-xl d-flex">
          <KpiCard
            label="Urgentes"
            value={formatNumber(data.totalUrgent)}
            icon={AlertTriangle}
            accent={palette.danger}
          />
        </div>
      </div>

      {/* Distribución por cliente + Requerimientos por cliente */}
      <div className="row">
        <div className="col-12 col-lg-4 d-flex">
          <ChartCard title="Abiertas por cliente" subtitle={`Top ${TOP_CLIENTS_DONUT} por volumen`}>
            <DonutChart
              labels={clientDist.map((c) => c.client)}
              series={clientDist.map((c) => c.value)}
              colors={clientDist.map((_, i) => REQ_TYPE_PALETTE[i % REQ_TYPE_PALETTE.length])}
              centerLabel="Abiertas"
              dataLabels={false}
            />
          </ChartCard>
        </div>
        <div className="col-12 col-lg-8 d-flex">
          <ChartCard
            title="Requerimientos por cliente"
            subtitle={`Top ${TOP_CLIENTS_BAR} por volumen (US + Bugs, apilado por tipo)`}
          >
            <ColumnChart
              categories={typeMatrix.clients}
              series={typeMatrix.series.map((s) => ({ name: s.type, data: s.data }))}
              colors={typeMatrix.series.map((_, i) => REQ_TYPE_PALETTE[i % REQ_TYPE_PALETTE.length])}
              stacked
              horizontal
              dataLabels={false}
              height={Math.max(220, typeMatrix.clients.length * 44 + 40)}
            />
          </ChartCard>
        </div>
      </div>

      {/* Listado combinado US + Bugs con indicador tipo semáforo */}
      <div className="row">
        <div className="col-12 d-flex">
          <StatusTable items={statusItems} />
        </div>
      </div>

      {/* Requerimientos sin fecha programada */}
      <div className="row">
        <div className="col-12 d-flex">
          <NoScheduleTable items={noScheduleItems} />
        </div>
      </div>
    </>
  );
}

/** Colored traffic-light dot driven by the scheduled delivery date. */
function SemaforoDot({ scheduledDate }: { scheduledDate: string | null }) {
  const status = semaforoFor(scheduledDate);
  const title =
    status === 'none'
      ? SEMAFORO_TITLE.none
      : `${SEMAFORO_TITLE[status]} · ${formatDate(scheduledDate)}`;
  return (
    <span
      className="semaforo-dot"
      style={{ backgroundColor: SEMAFORO_COLOR[status] }}
      title={title}
      aria-label={title}
    />
  );
}

/** Combined US + Bugs listing with the traffic-light indicator. */
function StatusTable({ items }: { items: StoryListItem[] }) {
  return (
    <div className="card flex-fill">
      <div className="card-header">
        <h5 className="card-title mb-0">User stories y Bugs ({items.length})</h5>
      </div>
      <div className="table-responsive item-table-scroll">
        <table className="table table-hover my-0">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Título</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th className="text-nowrap">Fecha de entrega programada</th>
              <th className="text-center">Semáforo</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-3">
                  Sin elementos.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className={it.urgent ? 'row-urgent' : undefined}>
                  <td>{it.id}</td>
                  <td>{it.client}</td>
                  <td>{it.title}</td>
                  <td>{it.type}</td>
                  <td>{it.state}</td>
                  <td className="text-nowrap">{formatDate(it.scheduledDate)}</td>
                  <td className="text-center">
                    <SemaforoDot scheduledDate={it.scheduledDate} />
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

