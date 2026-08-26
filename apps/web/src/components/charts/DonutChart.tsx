import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';

interface DonutChartProps {
  labels: string[];
  series: number[];
  colors: string[];
  height?: number;
  /** Big number shown in the center (defaults to the total). */
  centerLabel?: string;
}

/**
 * Donut for categorical distribution (e.g. work items by state). A legend plus
 * per-slice labels provide the secondary encoding the palette requires.
 */
export function DonutChart({ labels, series, colors, height = 260, centerLabel }: DonutChartProps) {
  const total = series.reduce((a, b) => a + b, 0);

  const options: ApexOptions = {
    chart: { type: 'donut', fontFamily: 'inherit' },
    labels,
    colors,
    stroke: { width: 2, colors: ['#fff'] },
    legend: { position: 'bottom', fontSize: '13px' },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => `${Math.round(val)}%`,
    },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              show: true,
              label: centerLabel ?? 'Total',
              formatter: () => String(total),
            },
          },
        },
      },
    },
    tooltip: { y: { formatter: (val: number) => String(val) } },
    responsive: [{ breakpoint: 576, options: { legend: { position: 'bottom' } } }],
  };

  return <ReactApexChart type="donut" options={options} series={series} height={height} />;
}
