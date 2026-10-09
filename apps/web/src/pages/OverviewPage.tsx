import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Layers, CheckCircle, Clock, Slash, Filter, X, AlertOctagon } from 'react-feather';
import { useIterations, useMeta, useWorkItems } from '@/features/azure/hooks';
import { SOURCE } from '@/features/azure/api';
import { useSelectedProject } from '@/features/project/ProjectContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { StateBadge } from '@/components/ui/StateBadge';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { DonutChart } from '@/components/charts/DonutChart';
import { toErrorMessage } from '@/lib/apiClient';
import { palette } from '@/lib/theme';
import { formatNumber, formatPercent, shortIteration } from '@/lib/format';
import type { WorkItemSummary, WorkItemsReport } from '@/types/azure';

export const DONE_STATES = ['done', 'closed', 'completed', 'resolved'];
const BLOCKED_TAG = 'bloqueado';
/**
 * Tipos de work item que consideran los reportes del resumen. Incluye el backlog
 * de ambas plantillas de proceso: "Product Backlog Item" (Scrum) y "User Story"
 * (Agile), más "Bug".
 */
export const TABLE_TYPES = ['product backlog item', 'user story', 'bug'];
const BUG_ROW_BG = '#F8D7DA';

/** Paleta de colores compartida con el dashboard de Keytia (misma secuencia). */
const CHART_PALETTE = [
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

/** Agrupa y cuenta items por una clave, de mayor a menor (como en el backend). */
function countBuckets(items: WorkItemSummary[], key: (i: WorkItemSummary) => string) {
  const map = new Map<string, number>();
  for (const i of items) map.set(key(i), (map.get(key(i)) ?? 0) + 1);
  return [...map.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count);
}

const isBlocked = (i: WorkItemSummary) =>
  i.tags.some((t) => t.toLowerCase() === BLOCKED_TAG);

/** Valores únicos (sin vacíos) ordenados en español, para poblar los filtros DDL. */
function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true }),
  );
}

type SortDir = 'asc' | 'desc';

interface SprintColumn {
  key: string;
  label: string;
  headClass?: string;
  cellClass?: string;
  /** Value used for sorting. */
  get: (i: WorkItemSummary) => string | number | null;
  /** Cell content. */
  render: (i: WorkItemSummary) => ReactNode;
}

const SPRINT_COLUMNS: SprintColumn[] = [
  { key: 'id', label: 'ID', cellClass: 'text-muted', get: (i) => i.id, render: (i) => `#${i.id}` },
  {
    key: 'sprint',
    label: 'Sprint',
    get: (i) => shortIteration(i.iterationPath),
    render: (i) => shortIteration(i.iterationPath),
  },
  { key: 'title', label: 'Título', get: (i) => i.title, render: (i) => i.title },
  { key: 'state', label: 'Estado', get: (i) => i.state, render: (i) => <StateBadge state={i.state} /> },
  {
    key: 'blocked',
    label: 'Bloqueado',
    get: (i) => (isBlocked(i) ? 1 : 0),
    render: (i) =>
      isBlocked(i) ? <span className="badge bg-warning text-dark">Bloqueado</span> : '—',
  },
  {
    key: 'type',
    label: 'Tipo de trabajo',
    headClass: 'd-none d-md-table-cell',
    cellClass: 'd-none d-md-table-cell',
    get: (i) => i.type,
    render: (i) => i.type,
  },
  {
    key: 'impact',
    label: 'Impacto estimado',
    headClass: 'text-end',
    cellClass: 'text-end',
    get: (i) => i.estimatedImpact,
    render: (i) => i.estimatedImpact ?? '—',
  },
  {
    key: 'assignee',
    label: 'Asignado a',
    headClass: 'd-none d-lg-table-cell',
    cellClass: 'd-none d-lg-table-cell',
    get: (i) => i.assignedTo,
    render: (i) => i.assignedTo,
  },
];

function compareValues(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls al final
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'es', { numeric: true });
}

/**
 * Tabla "Elementos del sprint": encabezado fijo con ~10 filas visibles (el resto
 * por scroll vertical), scroll lateral, y ordenamiento al hacer click en la columna.
 */
function SprintItemsTable({ items }: { items: WorkItemSummary[] }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const col = sortKey ? SPRINT_COLUMNS.find((c) => c.key === sortKey) : undefined;
    if (!col) return items;
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => factor * compareValues(col.get(a), col.get(b)));
  }, [items, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="card flex-fill">
      <div className="card-header">
        <h5 className="card-title mb-0">Elementos del sprint</h5>
      </div>
      {/* overflow:auto habilita scroll lateral y vertical; maxHeight deja ~10 filas visibles. */}
      <div style={{ maxHeight: 495, overflow: 'auto' }}>
        <table className="table table-hover my-0" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              {SPRINT_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={col.headClass}
                  role="button"
                  onClick={() => toggleSort(col.key)}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    background: 'var(--bs-body-bg, #fff)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr
                key={item.id}
                style={
                  item.type.toLowerCase() === 'bug' ? { backgroundColor: BUG_ROW_BG } : undefined
                }
              >
                {SPRINT_COLUMNS.map((col) => (
                  <td key={col.key} className={col.cellClass}>
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 ? (
        <div className="card-body text-muted small">
          No hay elementos para el sprint seleccionado.
        </div>
      ) : (
        <div className="card-footer text-muted small">
          {formatNumber(items.length)} elementos.
        </div>
      )}
    </div>
  );
}

export function OverviewPage() {
  const { selectedProject } = useSelectedProject();

  // Iterations are project-scoped; fall back to the source's default project
  // when the dashboard is showing the whole organization.
  const meta = useMeta(SOURCE.devprojects);
  const iterationsProject = selectedProject || meta.data?.defaultProject || '';
  const iterations = useIterations(SOURCE.devprojects, iterationsProject);

  const [selectedSprint, setSelectedSprint] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [blockedFilter, setBlockedFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  // Las rutas de iteración (y los valores disponibles) cambian por proyecto, así
  // que al cambiar de proyecto se reinician todos los filtros.
  useEffect(() => {
    setSelectedSprint('');
    setStateFilter('');
    setBlockedFilter('');
    setTypeFilter('');
  }, [iterationsProject]);

  const sprintOptions = useMemo(
    () =>
      [...(iterations.data ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      ),
    [iterations.data],
  );

  const workItems = useWorkItems(SOURCE.devprojects, {
    project: selectedProject,
    iterationPath: selectedSprint || undefined,
  });

  // Base de los filtros/opciones: solo los tipos que el resumen considera.
  const baseItems = useMemo(
    () =>
      (workItems.data?.items ?? []).filter((i) => TABLE_TYPES.includes(i.type.toLowerCase())),
    [workItems.data],
  );
  const stateOptions = useMemo(() => uniqueSorted(baseItems.map((i) => i.state)), [baseItems]);
  const typeOptions = useMemo(() => uniqueSorted(baseItems.map((i) => i.type)), [baseItems]);

  // Estado/Bloqueado/Tipo se aplican en el cliente sobre los datos ya traídos
  // (el Sprint se aplica en el backend vía iterationPath).
  const filteredItems = useMemo(
    () =>
      baseItems.filter((i) => {
        if (stateFilter && i.state !== stateFilter) return false;
        if (typeFilter && i.type !== typeFilter) return false;
        if (blockedFilter === 'blocked' && !isBlocked(i)) return false;
        if (blockedFilter === 'unblocked' && isBlocked(i)) return false;
        return true;
      }),
    [baseItems, stateFilter, typeFilter, blockedFilter],
  );

  const anyFilter = Boolean(selectedSprint || stateFilter || blockedFilter || typeFilter);
  const clearFilters = () => {
    setSelectedSprint('');
    setStateFilter('');
    setBlockedFilter('');
    setTypeFilter('');
  };

  const isLoading = workItems.isLoading;
  const isError = workItems.isError;

  return (
    <>
      <PageHeader
        title="Resumen"
        highlight={selectedProject ? `· ${selectedProject}` : '· Toda la organización'}
      />

      <div className="card filter-bar mb-3">
        <div className="card-body py-3">
          <div className="d-flex flex-wrap align-items-end gap-3">
            <div className="filter-field">
              <label htmlFor="state-filter" className="filter-label">
                <Filter size={12} className="me-1" />
                Estado
              </label>
              <select
                id="state-filter"
                className="form-select form-select-sm"
                style={{ minWidth: 180 }}
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                disabled={stateOptions.length === 0}
              >
                <option value="">Todos los estados</option>
                {stateOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="sprint-filter" className="filter-label">
                <Filter size={12} className="me-1" />
                Sprint
              </label>
              <select
                id="sprint-filter"
                className="form-select form-select-sm"
                style={{ minWidth: 180 }}
                value={selectedSprint}
                onChange={(e) => setSelectedSprint(e.target.value)}
                disabled={sprintOptions.length === 0}
              >
                <option value="">Todos los sprints</option>
                {sprintOptions.map((it) => (
                  <option key={it.id} value={it.path}>
                    {shortIteration(it.name)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="blocked-filter" className="filter-label">
                <Filter size={12} className="me-1" />
                Bloqueado
              </label>
              <select
                id="blocked-filter"
                className="form-select form-select-sm"
                style={{ minWidth: 150 }}
                value={blockedFilter}
                onChange={(e) => setBlockedFilter(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="blocked">Sí</option>
                <option value="unblocked">No</option>
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="type-filter" className="filter-label">
                <Filter size={12} className="me-1" />
                Tipo de trabajo
              </label>
              <select
                id="type-filter"
                className="form-select form-select-sm"
                style={{ minWidth: 180 }}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                disabled={typeOptions.length === 0}
              >
                <option value="">Todos los tipos</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {anyFilter && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={clearFilters}
              >
                <X size={14} className="me-1" />
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message={toErrorMessage(workItems.error)} />}

      {!isLoading && !isError && workItems.data && (
        <OverviewContent
          wi={{ ...workItems.data, items: filteredItems }}
          showSprintTable
        />
      )}
    </>
  );
}

export function OverviewContent({
  wi,
  afterKpis,
  showSprintTable,
  showBugsKpi,
}: {
  wi: WorkItemsReport;
  /** Contenido opcional que se inserta entre los KPIs y las gráficas. */
  afterKpis?: ReactNode;
  /** Muestra la tabla "Elementos del sprint". */
  showSprintTable?: boolean;
  /**
   * Agrega un KPI con la cantidad de Bugs (en rojo) y muestra "Bloqueados" en
   * morado. Usado en la página "Todos los proyectos".
   */
  showBugsKpi?: boolean;
}) {
  // Todos los reportes del resumen solo consideran los tipos permitidos
  // (Product Backlog Item y Bug).
  const items = wi.items.filter((i) => TABLE_TYPES.includes(i.type.toLowerCase()));
  const total = items.length;
  const byState = countBuckets(items, (i) => i.state);

  const done = byState
    .filter((b) => DONE_STATES.includes(b.key.toLowerCase()))
    .reduce((s, b) => s + b.count, 0);
  const pending = Math.max(0, total - done);
  const blocked = items.filter((i) =>
    i.tags.some((t) => t.toLowerCase() === BLOCKED_TAG),
  ).length;
  const bugs = items.filter((i) => i.type.toLowerCase() === 'bug').length;

  const stateLabels = byState.map((b) => b.key);
  const stateSeries = byState.map((b) => b.count);
  const stateColors = byState.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]);

  const byWorkType = countBuckets(items, (i) => i.workType);
  const workTypeLabels = byWorkType.map((b) => b.key);
  const workTypeSeries = byWorkType.map((b) => b.count);
  const workTypeColors = byWorkType.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]);

  return (
    <>
      <div className="row">
        <div className="col d-flex">
          <KpiCard
            label="Total work items"
            value={formatNumber(total)}
            icon={Layers}
            accent={palette.primary}
          />
        </div>
        <div className="col d-flex">
          <KpiCard
            label="Completados"
            value={formatPercent(total ? done / total : 0)}
            icon={CheckCircle}
            accent={palette.success}
            hint={{ text: `${formatNumber(done)} items`, tone: 'up' }}
          />
        </div>
        <div className="col d-flex">
          <KpiCard
            label="Pendientes"
            value={formatNumber(pending)}
            icon={Clock}
            accent={palette.warning}
          />
        </div>
        <div className="col d-flex">
          <KpiCard
            label="Bloqueados"
            value={formatNumber(blocked)}
            icon={Slash}
            accent={showBugsKpi ? palette.purple : palette.danger}
          />
        </div>
        {showBugsKpi && (
          <div className="col d-flex">
            <KpiCard
              label="Bugs"
              value={formatNumber(bugs)}
              icon={AlertOctagon}
              accent={palette.danger}
            />
          </div>
        )}
      </div>

      {afterKpis}

      <div className="row">
        <div className="col-12 col-lg-6 d-flex">
          <ChartCard title="Work items por estado">
            <DonutChart
              labels={stateLabels}
              series={stateSeries}
              colors={stateColors}
              dataLabels={false}
            />
          </ChartCard>
        </div>
        <div className="col-12 col-lg-6 d-flex">
          <ChartCard title="Work items por tipo de trabajo">
            <DonutChart
              labels={workTypeLabels}
              series={workTypeSeries}
              colors={workTypeColors}
              dataLabels={false}
            />
          </ChartCard>
        </div>
      </div>

      {showSprintTable && (
        <div className="row">
          <div className="col-12 d-flex">
            <SprintItemsTable items={items} />
          </div>
        </div>
      )}
    </>
  );
}
