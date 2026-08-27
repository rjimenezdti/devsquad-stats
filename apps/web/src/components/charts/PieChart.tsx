import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';

interface PieChartProps {
  labels: string[];
  series: number[];
  colors: string[];
  height?: number;
  /** Per-slice percentage labels. Defaults to true. */
  dataLabels?: boolean;
}

/**
 * Pie for categorical distribution (e.g. work items by work type). A legend plus
 * optional per-slice labels provide the secondary encoding the palette requires.
 */
export function PieChart({
  labels,
  series,
  colors,
  height = 260,
  dataLabels = true,
}: PieChartProps) {
  const options: ApexOptions = {
    chart: { type: 'pie', fontFamily: 'inherit' },
    labels,
    colors,
    stroke: { width: 2, colors: ['#fff'] },
    legend: { position: 'bottom', fontSize: '13px' },
    dataLabels: {
      enabled: dataLabels,
      formatter: (val: number) => `${Math.round(val)}%`,
    },
    tooltip: { y: { formatter: (val: number) => String(val) } },
    responsive: [{ breakpoint: 576, options: { legend: { position: 'bottom' } } }],
  };

  return <ReactApexChart type="pie" options={options} series={series} height={height} />;
}
