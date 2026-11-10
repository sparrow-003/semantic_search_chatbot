import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { escapeCsvCell, triggerDownload } from "@/lib/export";
import { ALLOWED_CHART_TYPES, type ChartType, type UIComponent } from "@/lib/ui/schema";

type ChartProps = Extract<UIComponent, { type: "chart" }>["props"];

const PALETTE = [
  "var(--color-chart-1, #2563eb)",
  "var(--color-chart-2, #0d9488)",
  "var(--color-chart-3, #6366f1)",
  "var(--color-chart-4, #d97706)",
  "var(--color-chart-5, #e11d48)",
  "#0891b2",
  "#7c3aed",
  "#16a34a",
];

const CHART_LABELS: Record<ChartType, string> = {
  bar: "Bar",
  horizontal_bar: "Horizontal Bar",
  stacked_bar: "Stacked Bar",
  line: "Line",
  area: "Area",
  pie: "Pie",
  donut: "Donut",
  scatter: "Scatter",
  kpi: "KPI",
};

export function ChartBlock({ props }: { props: ChartProps }) {
  const [chartType, setChartType] = useState<ChartType>(props.chartType);

  const chartData = props.data.map((d) => ({
    label: d.label,
    value: d.value,
    secondaryValue: d.secondaryValue ?? 1,
    ...(d.breakdown ?? {}),
  }));

  const availableTypes = props.seriesKeys?.length
    ? ALLOWED_CHART_TYPES
    : ALLOWED_CHART_TYPES.filter((t) => t !== "stacked_bar");

  const handleExportCsv = () => {
    const csv = [
      [props.xLabel ?? "Label", props.yLabel ?? "Value"],
      ...props.data.map((d) => [d.label, d.value]),
    ]
      .map((r) => r.map(escapeCsvCell).join(","))
      .join("\r\n");
    triggerDownload("chart-data.csv", csv, "text/csv;charset=utf-8");
  };

  const totalCount = props.data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base">{props.title}</CardTitle>
          {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
            <SelectTrigger className="h-7 w-[135px] text-xs" aria-label="Chart visualization type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {CHART_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleExportCsv}
          >
            <Download className="size-3" /> CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-2">
        {!props.data.length ? (
          <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            No aggregated data points available.
          </div>
        ) : chartType === "kpi" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {props.data.slice(0, 6).map((item, i) => (
              <div key={item.label} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                  />
                  {item.label}
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{item.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[290px] w-full" role="img" aria-label={`${props.title} chart`}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "bar" ? (
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    angle={-15}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name={props.yLabel ?? "Events"} radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : chartType === "horizontal_bar" ? (
                <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={115} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name={props.yLabel ?? "Events"} radius={[0, 6, 6, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : chartType === "stacked_bar" && props.seriesKeys?.length ? (
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={48} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {props.seriesKeys.map((key, idx) => (
                    <Bar key={key} dataKey={key} stackId="a" fill={PALETTE[idx % PALETTE.length]} />
                  ))}
                </BarChart>
              ) : chartType === "line" ? (
                <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={props.yLabel ?? "Events"}
                    stroke={PALETTE[0]}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              ) : chartType === "area" ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={props.yLabel ?? "Events"}
                    stroke={PALETTE[0]}
                    fill={PALETTE[0]}
                    fillOpacity={0.22}
                  />
                </AreaChart>
              ) : chartType === "scatter" ? (
                <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis type="number" dataKey="secondaryValue" name="Tech Tags" tick={{ fontSize: 11 }} />
                  <YAxis type="number" dataKey="value" name="Relevance %" tick={{ fontSize: 11 }} />
                  <ZAxis dataKey="label" name="Event" />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter name="Events" data={chartData} fill={PALETTE[0]} />
                </ScatterChart>
              ) : (
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={chartType === "donut" ? 56 : 0}
                    outerRadius={95}
                    paddingAngle={chartType === "donut" ? 3 : 1}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {/* Screen-reader accessible summary table */}
        <table className="sr-only">
          <caption>{props.title} data summary</caption>
          <thead>
            <tr>
              <th>{props.xLabel ?? "Label"}</th>
              <th>{props.yLabel ?? "Value"}</th>
            </tr>
          </thead>
          <tbody>
            {props.data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td>{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground">
          <span>{props.provenanceNote ?? `Total across chart: ${totalCount}`}</span>
          <span>Data source: {props.dataSource}</span>
        </div>
      </CardContent>
    </Card>
  );
}

