import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';

export interface ColumnSeries {
  name: string;
  data: number[];
}

interface ColumnChartProps {
  categories: string[];
  series: ColumnSeries[];
  colors: string[];
  height?: number;
  horizontal?: boolean;
  stacked?: boolean;
  /** Show the value on each bar (secondary encoding / relief for contrast). */
  dataLabels?: boolean;
  yTitle?: string;
}

/** Column/bar chart for magnitude comparisons (by assignee, planned vs done…). */
export function ColumnChart({
  categories,
  series,
  colors,
  height = 300,
  horizontal = false,
  stacked = false,
  dataLabels = true,
  yTitle,
}: ColumnChartProps) {
  const options: ApexOptions = {
    chart: {
      type: 'bar',
      stacked,
      fontFamily: 'inherit',
      toolbar: { show: false },
    },
    colors,
    plotOptions: {
      bar: {
        horizontal,
        borderRadius: 4,
        borderRadiusApplication: 'end',
        columnWidth: '55%',
        dataLabels: { position: 'top' },
      },
    },
    dataLabels: {
      enabled: dataLabels,
      offsetY: horizontal ? 0 : -18,
      style: { colors: ['#495057'], fontWeight: 600 },
    },
    stroke: { show: true, width: 2, colors: ['transparent'] },
    xaxis: { categories, axisBorder: { show: false } },
    yaxis: yTitle ? { title: { text: yTitle } } : {},
    grid: { borderColor: '#e9ecef', strokeDashArray: 3 },
    legend: { show: series.length > 1, position: 'top', horizontalAlign: 'right' },
    tooltip: { shared: true, intersect: false },
  };

  return <ReactApexChart type="bar" options={options} series={series} height={height} />;
}
