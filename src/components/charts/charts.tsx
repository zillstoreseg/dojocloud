'use client';

import { useEffect, useState } from 'react';
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLocale } from 'next-intl';
import { CHART_CHROME, seriesColor } from './palette';
import { formatNumber } from '@/lib/money';

/** A row of chart-ready data. Type alias (not interface) so DTOs
 * from the analytics layer satisfy the index signature. */
export type ChartDatum = Record<string, string | number>;

export interface SeriesDef {
  key: string;
  label: string;
  /** Fixed slot index — identity, not rank. */
  slot: number;
  format?: 'number' | 'money' | 'percent';
}

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function formatValue(value: number, format: SeriesDef['format'], locale: string): string {
  if (format === 'money') return `$${value.toLocaleString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { maximumFractionDigits: 2 })}`;
  if (format === 'percent') return `${value}%`;
  return formatNumber(value, locale);
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  locale,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; color?: string }>;
  label?: string;
  series: SeriesDef[];
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 text-xs shadow-lg">
      <p className="mb-2 font-medium text-popover-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => {
          const def = series.find((s) => s.key === entry.dataKey);
          if (!def) return null;
          return (
            <div key={def.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="inline-block size-2.5 rounded-full ring-2 ring-[hsl(var(--card))]"
                  style={{ background: entry.color }}
                />
                {def.label}
              </span>
              {/* Values wear text ink; the swatch beside them carries identity. */}
              <span className="font-medium tabular-nums text-popover-foreground">
                {formatValue(entry.value ?? 0, def.format, locale)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const AXIS_PROPS = {
  stroke: CHART_CHROME.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function shortDate(value: string, locale: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
}

/** Change over time. One y-axis only — a second scale is never added. */
export function TimeSeriesChart({
  data,
  series,
  height = 280,
  area = false,
}: {
  data: ChartDatum[];
  series: SeriesDef[];
  height?: number;
  area?: boolean;
}) {
  const dark = useDarkMode();
  const locale = useLocale();
  const Chart = area ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={CHART_CHROME.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={(v) => shortDate(String(v), locale)} minTickGap={24} />
        <YAxis {...AXIS_PROPS} width={48} tickFormatter={(v) => formatNumber(Number(v), locale)} />
        <Tooltip
          cursor={{ stroke: CHART_CHROME.axis, strokeWidth: 1, strokeDasharray: '4 4' }}
          content={<ChartTooltip series={series} locale={locale} />}
        />
        {/* A legend is required from two series up; one series is named by the title. */}
        {series.length > 1 ? (
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingBottom: 12 }}
          />
        ) : null}
        {series.map((s) =>
          area ? (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={seriesColor(s.slot, dark)}
              fill={seriesColor(s.slot, dark)}
              fillOpacity={0.12}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_CHROME.surface }}
            />
          ) : (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={seriesColor(s.slot, dark)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_CHROME.surface }}
            />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

/** Magnitude comparison across categories. */
export function CategoryBarChart({
  data,
  series,
  categoryKey = 'name',
  height = 280,
  horizontal = false,
}: {
  data: ChartDatum[];
  series: SeriesDef[];
  categoryKey?: string;
  height?: number;
  horizontal?: boolean;
}) {
  const dark = useDarkMode();
  const locale = useLocale();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
        barGap={2}
      >
        <CartesianGrid stroke={CHART_CHROME.grid} strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...AXIS_PROPS} tickFormatter={(v) => formatNumber(Number(v), locale)} />
            <YAxis type="category" dataKey={categoryKey} {...AXIS_PROPS} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey={categoryKey} {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} width={48} tickFormatter={(v) => formatNumber(Number(v), locale)} />
          </>
        )}
        <Tooltip
          cursor={{ fill: CHART_CHROME.grid, fillOpacity: 0.3 }}
          content={<ChartTooltip series={series} locale={locale} />}
        />
        {series.length > 1 ? (
          <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingBottom: 12 }} />
        ) : null}
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={seriesColor(s.slot, dark)}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={horizontal ? 20 : 40}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Profit bars, where the sign is the point: gains and losses get the reserved
 * status hues rather than a categorical slot.
 */
export function SignedBarChart({
  data,
  valueKey,
  categoryKey = 'name',
  label,
  height = 280,
}: {
  data: ChartDatum[];
  valueKey: string;
  categoryKey?: string;
  label: string;
  height?: number;
}) {
  const locale = useLocale();
  const series: SeriesDef[] = [{ key: valueKey, label, slot: 0, format: 'money' }];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={CHART_CHROME.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={categoryKey} {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={56} tickFormatter={(v) => `$${formatNumber(Number(v), locale)}`} />
        <Tooltip
          cursor={{ fill: CHART_CHROME.grid, fillOpacity: 0.3 }}
          content={<ChartTooltip series={series} locale={locale} />}
        />
        <Bar dataKey={valueKey} name={label} radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((row, index) => (
            <Cell
              key={index}
              fill={Number(row[valueKey]) < 0 ? '#e34948' : '#1baf7a'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
