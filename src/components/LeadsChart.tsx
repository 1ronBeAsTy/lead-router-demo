'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'
import { formatNumber, plural } from './format'

/**
 * Ряд считает `bucketByDay` на сервере, сюда приезжают уже готовые точки —
 * включая подпись дня, чтобы часовой пояс браузера не разошёлся с серверным.
 */
export interface ChartPoint {
  date: string
  label: string
  total: number
  taken: number
  lost: number
  open: number
}

const SERIES = [
  { key: 'taken', label: 'взято', color: 'var(--chart-taken)' },
  { key: 'open', label: 'в работе', color: 'var(--chart-open)' },
  { key: 'lost', label: 'потеряно', color: 'var(--chart-lost)' },
] as const

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null

  const point = payload[0].payload as ChartPoint
  return (
    <div className="panel px-2.5 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{point.label}</div>
      <div className="mb-1.5 text-ink-3 tabular-nums">
        {formatNumber(point.total)} {plural(point.total, ['заявка', 'заявки', 'заявок'])}
      </div>
      <ul className="space-y-0.5">
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-1.5 text-ink-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: series.color }}
            />
            <span className="min-w-16">{series.label}</span>
            <span className="ml-auto font-medium text-ink tabular-nums">{point[series.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LeadsChart({ data }: { data: ChartPoint[] }) {
  const empty = data.every((point) => point.total === 0)

  return (
    <div className="h-[260px] w-full px-1 pt-3 pb-1">
      {empty ? (
        <div className="grid h-full place-items-center text-[13px] text-ink-3">
          За выбранный период заявок не было
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -18 }} barCategoryGap="28%">
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-3)', opacity: 0.6 }} />
            {SERIES.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                stackId="leads"
                fill={series.color}
                radius={index === 0 ? [0, 0, 2, 2] : index === SERIES.length - 1 ? [2, 2, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function ChartLegend() {
  return (
    <ul className="flex items-center gap-3">
      {SERIES.map((series) => (
        <li key={series.key} className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <span
            aria-hidden
            className="h-2 w-2 rounded-[2px]"
            style={{ backgroundColor: series.color }}
          />
          {series.label}
        </li>
      ))}
    </ul>
  )
}
